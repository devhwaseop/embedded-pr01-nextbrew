// 추출 흐름: 준비 → 타이머 → 결과

import { h, svg, fill, section, field, stepper, choiceList, chips, modal, toast, toggle, pressButton, pressable, term, termOf, tags, fmtDateTime, linkButton } from '../dom.js';
import { planFigure, brewFigure } from '../charts.js';
import { readCompass, adviseNext, umPerClickFor, lastSurveyed } from '../../core/compass.js';
import { store, saveActive, loadActive, clearActive } from '../../core/store.js';
import { PRESETS } from '../../data/presets.js';
import { allRecipes, findRecipe } from '../../core/recipeBook.js';
import { buildPlan, scaleAdvice, formatRatio, stepHint, HINT_SOURCES, recipeTags } from '../../core/recipe.js';
import { startBrew, readyBrew, view, advance, undoAdvance, cancel, summarize, presence, acknowledge, elapsedSec } from '../../core/timer.js';
import { conditionRows, stepRows, beanFacts } from '../../core/facts.js';
import { WORDS, END_STATE_WORDS, endStateKey, josa, DECAF_ASSIST } from '../../core/words.js';
import {
  createBrew, newId, round1, formatSec, grindActual, formatDelta, timingVerdict, netServerWeight, linkWeights, dilutionView,
  beanStock, daysSince, timerOf, DRIPPERS, FILTERS, POUR_METHODS, END_STATES,
} from '../../core/schema.js';
import { findPrevious, compareTimer } from '../../core/diff.js';
import { logEvent } from '../../core/log.js';
import { keepAwake, releaseAwake } from '../../platform/wakelock.js';
import { brewNotFound, adviceView } from './records.js';
import { advicePatch, lastAdvised } from '../../core/adviceImport.js';
import { measureImportButton, measureSummary, measureView } from '../measureImport.js';
import { measurementOf } from '../../core/grindMeasure.js';

// 문장 끝(. ! ?) 다음의 띄어쓰기를 줄바꿈으로
export function sentenceLines(text) {
  return (text ?? '').replace(/([.!?])\s+/g, '$1\n');
}

// 원두만 바꾸고 물은 그대로일 때 비율이 어떻게 바뀌나: 「원두와 물의 비율 1:9.4 → 1:9.1 (… 물 150g 그대로)」
export function ratioChange(c, doseDeltaG) {
  const to = c.doseG + doseDeltaG;
  return `${WORDS.ratio.label} ${formatRatio(c.hotWaterG / c.doseG)} → ${formatRatio(c.hotWaterG / to)} (원두 ${c.doseG}g → ${Math.round(to * 10) / 10}g, 물 ${c.hotWaterG}g 그대로)`;
}

// 얼음(사용자 요청 9/25 — 얼음 조각은 크기가 제각각이라 추천 무게에 딱 맞추기 어렵다).
// 뜨거운 물은 추출을 정하므로 그대로 두고, 얼음은 식히고 묽히는 몫이라 차이는 추출 뒤 가수로 맞춘다
// (근거: docs/agent-notes/참고 출처 목록.md 「얼음과 추출」).
export function iceShortG(plan, iceG, style) {
  if (style === 'hot') return 0;
  return Math.max(0, plan.iceG - (iceG ?? 0));
}
function iceLines(plan, iceG) {
  const base = `추천 ${plan.iceG}g (원두량 × 레시피 비율)`;
  const diff = (iceG ?? 0) - plan.iceG;
  if (!diff) return base;
  const planRatio = formatRatio((plan.hotWaterG + plan.iceG) / plan.doseG);
  const line = diff < 0
    ? `${-diff}g 적습니다. 추출 뒤 찬물 ${-diff}g을 더하면(가수) 계획 비율 ${planRatio}이 됩니다.`
    : `${diff}g 많습니다. 다 녹으면 ${formatRatio((plan.hotWaterG + iceG) / plan.doseG)}로 계획(${planRatio})보다 조금 연해집니다. 맞추려면 얼음을 조금 덜어 내세요.`;
  return [h('div', null, base), h('div', { class: 'row-line' }, line), h('div', null, '뜨거운 물은 추출을 정해서 그대로 둡니다.')];
}

// ── 준비 ─────────────────────────────────────────────────────
// 입력 중인 값은 세션 저장소에 둔다. 원두·그라인더를 등록하러 갔다 와도, 취소하고 돌아와도 그대로 남게.
const DRAFT_KEY = 'nb.prepDraft';
export function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}
export function saveDraft(d) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* 세션 저장소가 막혀도 화면은 계속 쓸 수 있다 */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 없으면 그만 */
  }
}

// 예전에 직접 입력한 값도 다음부터 목록에 보이게
function usedValues(get, base) {
  const seen = new Set(base);
  for (const b of store.brews()) {
    const v = get(b);
    if (v) seen.add(v);
  }
  return [...seen];
}

function customHints(recipeId) {
  return store.settings().stepHints?.[recipeId] ?? null;
}

// 「이전 추출 방법 유지」: 직전 기록의 설정으로 시작한다. 원두량·온도는 같은 레시피의 직전 기록에서 가져온다.
function defaultsFor(recipeId) {
  const recipe = findRecipe(recipeId) ?? PRESETS[0];
  const brews = store.brews();
  const last = brews[0];
  const lastSame = brews.find((b) => b.recipe.id === recipe.id);
  const c = last?.conditions;
  // 다 쓴(소모) 원두는 다시 고르지 않는다(9/25)
  const lastBean = last?.bean?.id ? store.get('beans', last.bean.id) : null;
  return {
    recipeId: recipe.id,
    beanId: lastBean && lastBean.status !== 'consumed' ? lastBean.id : null,
    beanName: last?.bean && !last.bean.id ? last.bean.name : '',
    grinderId: c?.grind?.grinderId ?? store.list('grinders')[0]?.id ?? null,
    dial: c?.grind?.dial ?? null,
    um: c?.grind?.um ?? null, // 참고 µm(보조, 선택) — 직전 기록과 같은 그라인더·다이얼에서 이어받는다
    umSd: c?.grind?.umSd ?? null, // 참고 µm 의 표준편차(선택) — 사진 측정 도구가 평균과 함께 낸다
    dripper: c?.dripper ?? DRIPPERS[0],
    filter: c?.filter ?? FILTERS[0],
    rinsed: c?.rinsed ?? null,
    pourMethod: c?.pourMethod ?? POUR_METHODS[0],
    doseG: lastSame?.conditions.doseG ?? recipe.refDoseG,
    tempC: lastSame?.conditions.tempC ?? recipe.tempC,
    style: recipe.style,
    iceG: null, // null = 레시피 추천값
    ratio: null, // 원두와 물의 비율(1:x 의 x). null = 레시피 비율. 뜨거운 물 = 원두량 × 비율
  };
}

export function prepScreen() {
  const lastRecipe = store.brews()[0]?.recipe.id;
  let d = loadDraft() ?? defaultsFor(findRecipe(lastRecipe) ? lastRecipe : PRESETS[0].id);
  const root = h('div', { class: 'screen' });
  let hintsOpen = false; // 다시 그려도 「단계 설명」 펼침을 유지
  const set = (patch, redraw = true) => {
    d = { ...d, ...patch };
    saveDraft(d);
    if (redraw) draw();
  };

  function draw() {
    const recipe = findRecipe(d.recipeId) ?? PRESETS[0];
    // 원두량·뜨거운 물·비율 세 칸을 다 조정할 수 있다(사용자 요청 9/24). 저장하는 것은 비율 하나 — 원두량을 바꾸면 물이 비율을 따라간다
    const dose = Number(d.doseG) || recipe.refDoseG;
    const plan = buildPlan(recipe, dose, customHints(recipe.id), { waterG: d.ratio != null ? dose * d.ratio : null });
    const iceG = d.style === 'hot' ? 0 : d.iceG ?? plan.iceG;
    const advice = scaleAdvice(recipe, d.doseG);
    // 다 쓴(소모) 원두는 목록에서 뺀다 — 지금 골라 둔 것이면 남긴다(9/25)
    const beans = store.list('beans').filter((b) => b.status !== 'consumed' || b.id === d.beanId).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const bean = d.beanId ? store.get('beans', d.beanId) : null;
    const grinders = store.list('grinders');
    const grinder = grinders.find((g) => g.id === d.grinderId) ?? null;

    const beanSelect = h(
      'select',
      {
        onChange: (e) => {
          const v = e.target.value;
          set(v === '__free__' ? { beanId: null, beanName: d.beanName || ' ' } : { beanId: v || null, beanName: '' });
        },
      },
      h('option', { value: '' }, '선택 안 함'),
      ...beans.map((b) => h('option', { value: b.id, selected: b.id === d.beanId }, b.roaster ? `${b.name} · ${b.roaster}` : b.name)),
      h('option', { value: '__free__', selected: !d.beanId && Boolean(d.beanName) }, '등록 없이 이름만 적기'),
    );

    fill(
      root,
      h('h1', null, '추출 준비'),
      section(
        '레시피',
        recipeFilter(),
        h('select', {
          onChange: (e) => {
            // 레시피에 딸린 값만 바꾸고 원두·도구 선택은 그대로 둔다
            const nd = defaultsFor(e.target.value);
            set({ recipeId: nd.recipeId, doseG: nd.doseG, tempC: nd.tempC, style: nd.style, iceG: null, ratio: null });
          },
        }, ...shownRecipes(recipe).map((r) => h('option', { value: r.id, selected: r.id === recipe.id }, r.name))),
        tags(recipeTags(recipe)),
        // 가져온 레시피는 드리퍼·온도·분쇄·출처 주소가 비어 있을 수 있다 — 빈 칸은 빼고 잇는다
        h(
          'div',
          { class: 'hint' },
          [
            recipe.style === 'iced' ? '아이스' : '핫',
            recipe.designedFor ? `${recipe.designedFor} 기준` : null,
            `원두 ${recipe.refDoseG}g`,
            `비율 ${formatRatio(recipe.waterRatio)}`,
            recipe.tempC != null ? `${recipe.tempC}℃` : null,
            recipe.grindNote || null,
            recipe.roastNote || null,
          ].filter(Boolean).join(' · '),
        ),
        recipe.source?.url
          ? h('div', { class: 'source' }, '출처: ', h('a', { href: recipe.source.url, target: '_blank', rel: 'noopener' }, recipe.source.label))
          : recipe.source?.label ? h('div', { class: 'source' }, `출처: ${recipe.source.label}`) : null,
        linkButton({ href: '#/recipes', label: '레시피 추가·관리', returnToPrep: true }),
      ),
      section(
        '원두',
        field('원두', beanSelect, bean ? beanStatusLine(bean, d.doseG) : null),
        !d.beanId && d.beanName
          ? field('원두 이름', h('input', { type: 'text', value: d.beanName.trim(), onChange: (e) => set({ beanName: e.target.value }, false) }))
          : null,
        linkButton({ href: '#/bean/new', label: '＋ 원두 등록', returnToPrep: true }),
        field('원두량', stepper({ value: d.doseG, step: 1, min: 1, max: 100, unit: 'g', onChange: (v) => set({ doseG: v, iceG: null }) }),
          advice ? advice.text : `레시피 기준 원두량입니다. 기준으로 먼저 내린 뒤 바꿔 가며 비교하세요.`),
      ),
      adviceCard(recipe, grinder),
      aiAdviceCard(recipe, grinder),
      section(
        '분쇄',
        decafAssist(grinder),
        grinders.length
          ? field('그라인더', h('select', { onChange: (e) => set({ grinderId: e.target.value }) }, ...grinders.map((g) => h('option', { value: g.id, selected: g.id === d.grinderId }, g.name))))
          : h('div', { class: 'hint' }, '등록된 그라인더가 없습니다. 영점을 쓰려면 설정에서 등록하세요.'),
        // 그라인더 표시값을 넣으면 영점 반영값을 아래에 보인다(사용자 요청 9/25 · 용어 9/26 결정)
        field(termOf(WORDS.grindDial), stepper({ value: d.dial, step: 1, min: 0, max: 999, onChange: (v) => set({ dial: v }) }), grindLine(grinder)),
        // 보조값(사용자 결정 9/24): 사진으로 잰 값이나 변환 사이트의 추정치를 직접 적는다. 앱은 이 값으로 µm 를 만들지 않고,
        // 같은 그라인더 기록이 쌓이면 «클릭당 µm» 추정에만 쓴다(core/compass.js).
        field(term('참고 µm', '선택 · 사진 측정값이나 변환 사이트 추정치'), stepper({ value: d.um, step: 10, min: 0, max: 3000, unit: 'µm', onChange: (v) => set({ um: v }, false) })),
        field(term('µm 표준편차', '선택 · 사진 측정 결과에 함께 나옴'), stepper({ value: d.umSd, step: 10, min: 0, max: 3000, unit: 'µm', onChange: (v) => set({ umSd: v }, false) })),
        // 측정 결과 불러오기(사용자 결정 9/26): 언스페셜티 CSV·사진 → 값 확인 → Click 뜻 확인 → 그라인더 표시값·참고 µm·표준편차를 채운다
        ...measureImportButton({ grinder, via: 'prep', onDone: (m) => set({ dial: m.dial, um: m.meanUm, umSd: m.sdUm, measurement: m }) }),
        d.measurement
          ? h(
              'details',
              { class: 'sub-details' },
              h('summary', null, `불러온 측정: ${measureSummary(d.measurement)}`),
              measureView(d.measurement),
              h('button', { type: 'button', class: 'inline-btn quiet', onClick: () => set({ measurement: null }) }, '측정 떼기'),
            )
          : null,
        linkButton({ href: 'https://community.unspecialty.com/compass/grinder', label: '사진으로 분쇄 재기 · 언스페셜티', external: true }),
        linkButton({ href: '#/grinders', label: '그라인더 등록·영점·클릭당 µm', returnToPrep: true }),
      ),
      section(
        '도구',
        field('드리퍼', choiceList({ options: usedValues((b) => b.conditions.dripper, DRIPPERS), value: d.dripper, onChange: (v) => set({ dripper: v }, false) })),
        field('필터', choiceList({ options: usedValues((b) => b.conditions.filter, FILTERS), value: d.filter, onChange: (v) => set({ filter: v }, false) })),
        field(termOf(WORDS.rinse), chips({ options: ['함', '안 함'], selected: d.rinsed == null ? null : d.rinsed ? '함' : '안 함', describe: { 함: WORDS.rinse.on, '안 함': WORDS.rinse.off }, onChange: (v) => set({ rinsed: v == null ? null : v === '함' }) })),
        field(WORDS.pourMethod.label, choiceList({ options: usedValues((b) => b.conditions.pourMethod, POUR_METHODS), value: d.pourMethod, onChange: (v) => set({ pourMethod: v }, false) }),
          `레시피 추천: ${recipe.pourMethod ?? '원문에 붓는 모양은 없음'} (붓기 팁은 아래 「이번 계획」)`),
      ),
      section(
        '물·얼음',
        field('핫/아이스', chips({ options: ['아이스', '핫'], selected: d.style === 'hot' ? '핫' : '아이스', onChange: (v) => set({ style: v === '핫' ? 'hot' : 'iced', iceG: null }) }),
          recipe.style === 'iced' && d.style === 'hot' ? '아이스 기준 레시피라 뜨거운 물 양은 그대로입니다.' : null),
        // 설명 모양 통일(사용자 요청 9/24): 항목 이름 옆 옅은 설명(term) — 설정 「보조 설명」으로 켜고 끈다
        field(term('물 온도', '가열을 끝낸 시점의 온도'), stepper({ value: d.tempC, step: 1, min: 50, max: 100, unit: '℃', onChange: (v) => set({ tempC: v }, false) })),
        // 뜨거운 물을 바꾸면 비율이 따라간다(비우면 레시피 비율)
        field(term('뜨거운 물', '원두량 × 비율'), stepper({ value: plan.hotWaterG, step: 1, min: 1, max: 2000, unit: 'g', onChange: (v) => set({ ratio: v == null ? null : v / dose }) })),
        // 원두와 물의 비율(사용자 요청 9/24 — 흔히 쓰는 1:15 표기, 독립 항목·직접 조정). 바꾸면 뜨거운 물 = 원두량 × 비율
        field(WORDS.ratio.label, stepper({ value: Math.round(plan.ratioHot * 10) / 10, step: 0.5, min: 1, max: 30, prefix: '1:', onChange: (v) => set({ ratio: v }) }),
          // 안내는 줄을 나눈다: ① 레시피 비율과 같은지(다르면 되돌리기 버튼) ② 아이스면 얼음까지 넣은 비율
          [
            h('div', { class: 'row-line' }, d.ratio != null
              ? [h('span', null, `레시피 비율(${formatRatio(recipe.waterRatio)})과 다름`), h('button', { type: 'button', class: 'inline-btn', onClick: () => set({ ratio: null }) }, '레시피 비율로')]
              : '레시피 비율 그대로'),
            iceG ? h('div', null, `얼음 ${iceG}g까지 넣으면 ${formatRatio((plan.hotWaterG + iceG) / plan.doseG)}`) : null,
          ]),
        d.style === 'hot'
          ? null
          : field(term('얼음', '저울에 올려 잰 값'), stepper({ value: iceG, step: 1, min: 0, max: 500, unit: 'g', onChange: (v) => set({ iceG: v }) }), iceLines(plan, iceG)),
      ),
      section(
        '이번 계획',
        // 「원두와 물의 비율 1:9.4」는 이름과 값이 따로 떨어지지 않게 한 덩어리로 줄을 바꾼다
        h('div', null, `원두 ${plan.doseG}g · 뜨거운 물 ${plan.hotWaterG}g · `, h('span', { class: 'nowrap' }, `${WORDS.ratio.label} ${formatRatio(plan.ratioHot)}`),
          iceG ? h('div', { class: 'hint' }, `얼음 ${iceG}g까지 넣으면 ${formatRatio((plan.hotWaterG + iceG) / plan.doseG)}`) : null),
        planFigure(plan),
        h(
          'table',
          { class: 'plan' },
          h('tr', null, h('th', null, '단계'), h('th', null, '시작'), h('th', null, WORDS.target.label)),
          ...plan.steps.map((s) => h('tr', null, h('td', null, s.label), h('td', null, formatSec(s.startSec)), h('td', null, `${s.targetCumG}g`))),
          h('tr', null, h('td', null, '종료 목표'), h('td', null, formatSec(plan.endSec)), h('td', null, '')),
        ),
        h(
          'ul',
          { class: 'hint' },
          // 헹군 물이 얼음에 섞이지 않게 린싱을 먼저 적는다
          d.rinsed ? h('li', null, '필터를 헹구고, 헹군 물은 버립니다.') : null,
          iceG ? h('li', null, `서버에 얼음 ${iceG}g을 넣습니다.`) : null,
          iceShortG(plan, iceG, d.style) ? h('li', null, `추출 뒤 찬물 ${iceShortG(plan, iceG, d.style)}g을 더합니다(얼음이 추천보다 적은 만큼).`) : null,
          ...(recipe.pourTips ?? []).map((n) => h('li', null, n)),
          ...recipe.notes.filter((n) => !n.startsWith('얼음을 서버')).map((n) => h('li', null, n)),
        ),
        hintEditor(recipe),
      ),
      // 준비 → 타이머 화면(대기) → [시작](사용자 요청 9/25). 시간은 타이머 화면의 [시작]부터 잰다.
      h('button', { class: 'primary big wide', onClick: () => start(recipe, plan, iceG, grinder) }, '다음'),
      h('div', { class: 'hint center' }, '다음 화면에서 물을 붓기 시작할 때 [시작]을 누릅니다.'),
    );
  }

  // 원두 상태 한 줄: 로스팅 후·개봉 후 며칠, 남은 원두 추정(9/25). 이번 원두량보다 적게 남았으면 알린다.
  function beanStatusLine(bean, doseG) {
    const st = beanStock(bean, store.brews());
    const facts = beanFacts(bean, store.brews());
    if (!facts.length) return null;
    const short = st.remainingG != null && doseG && st.remainingG < doseG;
    return h('span', { class: short ? 'warn-text' : '' }, facts.join(' · '), short ? ` — 이번 원두량(${doseG}g)보다 적습니다` : '');
  }

  // 디카페인 보조(9/26 사용자 요청): 고른 원두가 디카페인이면 분쇄·원두량을 바꾸는 안내와 한 번 누르면 맞추는 단추.
  // 분쇄는 같은 표시값에서 더 곱게 갈린다는 연구(가운데 입자 8~38µm 작음)의 가운데쯤인 약 20µm 굵게 — 클릭당 µm 를 알면 클릭 수로.
  // 원두량 +0.5~1g 은 로스터리 안내 글 수준이라 그렇게 밝힌다. 값은 누를 때만 바뀐다(자동으로 바꾸지 않는다).
  function decafAssist(grinder) {
    const bean = d.beanId ? store.get('beans', d.beanId) : null;
    if (!bean?.decaf) return null;
    const upc = grinder ? umPerClickFor(grinder, store.brews()) : null;
    const clicks = upc?.value ? Math.sign(upc.value) * Math.max(1, Math.round(DECAF_ASSIST.grindUm / Math.abs(upc.value))) : null;
    return h(
      'div',
      { class: 'notice decaf-note' },
      h('div', null, '디카페인 원두 — 같은 표시값에서 더 곱게 갈립니다.'),
      h('div', { class: 'hint' }, clicks ? `평소보다 약 ${DECAF_ASSIST.grindUm}µm 굵게(${Math.abs(clicks)}클릭) 시작해 보세요.` : `평소보다 조금 굵게(약 ${DECAF_ASSIST.grindUm}µm) 시작해 보세요. 그라인더에 클릭당 µm 를 적으면 클릭 수로 알려 드립니다.`),
      h('div', { class: 'hint' }, `맛이 옅게 느껴지면 원두를 ${DECAF_ASSIST.doseG}~1g 늘려 보세요(로스터리 안내 글 기준 — 연구로 확인된 값은 아닙니다).`),
      h(
        'div',
        { class: 'row wrap' },
        clicks && d.dial != null
          ? h('button', { type: 'button', class: 'inline-btn', onClick: () => { logEvent('prep.decafAssist', { action: 'grind', clicks, from: d.dial, to: d.dial + clicks, umPerClick: upc.value }); set({ dial: d.dial + clicks }); } }, `분쇄 ${Math.abs(clicks)}클릭 굵게`)
          : null,
        h('button', { type: 'button', class: 'inline-btn', onClick: () => { logEvent('prep.decafAssist', { action: 'dose', from: d.doseG, to: d.doseG + DECAF_ASSIST.doseG }); set({ doseG: d.doseG + DECAF_ASSIST.doseG, iceG: null }); } }, `원두 +${DECAF_ASSIST.doseG}g`),
      ),
    );
  }

  // 「영점 반영값 122 · 영점 −3」: 그라인더 표시값 + 영점 = 영점 반영값(용어는 사용자 결정 9/26 「그라인더 표시값 / 영점 반영값」)
  function grindLine(grinder) {
    if (d.dial == null) return '그라인더 표시값을 넣으세요.';
    const z = grinder?.zeroOffset ?? 0;
    if (!grinder) return '그라인더를 등록하면 영점 반영값을 보여 줍니다.';
    if (!z) return `영점 반영값 ${d.dial} · 영점 0`;
    return h('span', null, h('b', null, `영점 반영값 ${grindActual(d.dial, z)}`), ` · 영점 ${z > 0 ? '+' : '−'}${Math.abs(z)}`);
  }

  // 레시피 필터(사용자 결정 9/24 — 언스페셜티 레시피 목록의 드리퍼별 필터 참고): 드리퍼가 두 종류 이상일 때만 보인다
  function recipeFilter() {
    const drippers = [...new Set(allRecipes().map((r) => r.designedFor).filter(Boolean))];
    if (drippers.length < 2) return null;
    return chips({ options: drippers, selected: d.recipeFilter ?? null, onChange: (v) => set({ recipeFilter: v }) });
  }
  function shownRecipes(current) {
    const all = allRecipes();
    const list = d.recipeFilter ? all.filter((r) => r.designedFor === d.recipeFilter) : all;
    return list.includes(current) ? list : [current, ...list];
  }

  // 지난번 제안(사용자 결정 9/24 — 커피 컴퍼스): 같은 레시피(원두를 골랐으면 같은 원두)의 가장 최근 «설문한» 기록에서 낸 제안.
  // [제안대로 맞추기]는 그 기록의 값에서 출발한다: 그라인더 표시값 = 그때 영점 반영값 + 제안 클릭 − 지금 영점, 원두 = 그때 + 제안 g, 물 = 그때 그대로.
  function adviceCard(recipe, grinder) {
    const prev = lastSurveyed(store.brews(), { recipeId: recipe.id, beanId: d.beanId });
    if (!prev) return null;
    const roast = prev.bean?.id ? store.get('beans', prev.bean.id)?.roast || null : null;
    const pg = prev.conditions.grind;
    const sameGrinder = grinder && pg?.grinderId === grinder.id;
    const upc = sameGrinder ? umPerClickFor(grinder, store.brews()) : null;
    const adv = adviseNext(readCompass(prev.survey, { roast }), { umPerClick: upc?.value ?? null });
    if (!adv) return null;
    const canDial = adv.clicks != null && pg?.dial != null;
    const apply = () => {
      const patch = {};
      if (canDial) patch.dial = pg.dial + (pg.zeroOffset || 0) + adv.clicks - (grinder?.zeroOffset || 0);
      if (adv.doseDeltaG) {
        patch.doseG = Math.round((prev.conditions.doseG + adv.doseDeltaG) * 10) / 10;
        patch.ratio = prev.conditions.hotWaterG / patch.doseG; // 물은 그때 그대로가 되도록
        patch.iceG = null;
      }
      logEvent('advice.apply', {
        source: 'compass',
        fromBrewId: prev.id, grindUm: adv.grindUm, clicks: adv.clicks, doseDeltaG: adv.doseDeltaG,
        dial: { from: d.dial, to: patch.dial ?? d.dial }, doseG: { from: d.doseG, to: patch.doseG ?? d.doseG }, waterG: patch.ratio != null ? prev.conditions.hotWaterG : null,
      });
      set(patch);
      toast('제안대로 맞췄습니다.');
    };
    const actionable = canDial || adv.doseDeltaG;
    return section(
      '지난번 제안',
      h('div', { class: 'hint' }, `${fmtDateTime(prev.timer.startedAt)} 추출의 테이스팅 노트 기준${roast ? ` · ${roast}` : ''}`),
      h('ul', { class: 'advice' }, ...adv.lines.map((l) => h('li', null, l))),
      canDial ? h('div', { class: 'hint' }, `그라인더 표시값: ${pg.dial} → ${pg.dial + (pg.zeroOffset || 0) + adv.clicks - (grinder?.zeroOffset || 0)}`) : null,
      adv.doseDeltaG ? h('div', { class: 'hint' }, ratioChange(prev.conditions, adv.doseDeltaG)) : null,
      adv.grindUm && !canDial
        ? h('div', { class: 'hint' }, sameGrinder ? '클릭당 µm 를 알면 클릭 수로 알려 드립니다(설정 → 그라인더, 또는 참고 µm 를 두 눈금 이상에서 기록).' : '지난번과 그라인더가 달라 분쇄는 µm 로만 보입니다.')
        : null,
      upc ? h('div', { class: 'source' }, `클릭당 약 ${upc.value}µm (${upc.source === 'manual' ? '설정에 적은 값' : `기록 ${upc.n}건으로 추정`})`) : null,
      actionable ? h('button', { type: 'button', onClick: apply }, '제안대로 맞추기') : null,
    );
  }

  // AI 제안(9/25 — 기록 화면 「AI 제안」에 넣은 것): 같은 레시피(원두를 골랐으면 같은 원두)의 가장 최근 AI 제안.
  // [AI 제안대로 맞추기]는 그 기록의 값에서 출발한다. 다이얼은 같은 그라인더일 때만 바꾼다(core/adviceImport.js advicePatch).
  function aiAdviceCard(recipe, grinder) {
    const from = lastAdvised(store.brews(), { recipeId: recipe.id, beanId: d.beanId });
    if (!from) return null;
    const a = from.aiAdvice;
    const { patch, dialSkipped } = advicePatch(a, from, { grinderId: grinder?.id ?? null });
    const apply = () => {
      logEvent('advice.apply', {
        source: 'ai', fromBrewId: from.id, dialSkipped,
        dial: { from: d.dial, to: patch.dial ?? d.dial }, doseG: { from: d.doseG, to: patch.doseG ?? d.doseG },
        waterG: a.next.hotWaterG ?? null, tempC: { from: d.tempC, to: patch.tempC ?? d.tempC },
      });
      set(patch);
      toast('AI 제안대로 맞췄습니다.');
    };
    return section(
      'AI 제안',
      h('div', { class: 'hint' }, `${fmtDateTime(from.timer.startedAt)} 추출에 넣은 AI 답 기준`),
      ...adviceView(a, from),
      dialSkipped ? h('div', { class: 'hint' }, '제안이 달린 기록과 그라인더가 달라 그라인더 표시값은 바꾸지 않습니다.') : null,
      Object.keys(patch).length ? h('button', { type: 'button', onClick: apply }, 'AI 제안대로 맞추기') : null,
    );
  }

  // 단계 설명(타이머의 회색 문장): 직접 쓴 문장 → 레시피 원문 → 일반 설명 → 비움 순서로 고른다(core/recipe.js stepHint).
  // 근거가 없는 단계는 비어 있고, 여기서 직접 쓸 수 있다. 저장은 설정(stepHints)에 해서 계정 동기화를 따라간다.
  function hintEditor(recipe) {
    const mine = customHints(recipe.id) ?? {};
    const rows = recipe.steps.map((st, i) => {
      const cur = stepHint(recipe, i, mine);
      const base = stepHint(recipe, i, null);
      const box = h('textarea', { rows: 2, value: mine[i] ?? '', placeholder: base.text || '근거가 없어 비어 있습니다. 직접 쓸 수 있어요.' });
      const saveHint = (text) => {
        const all = { ...(store.settings().stepHints ?? {}) };
        const next = { ...(all[recipe.id] ?? {}) };
        if (text) next[i] = text;
        else delete next[i];
        all[recipe.id] = next;
        store.setSetting('stepHints', all);
        logEvent('hint.save', { recipeId: recipe.id, index: i, cleared: !text });
        toast(text ? '저장했습니다.' : '원래 설명으로 돌렸습니다.');
        draw();
      };
      return h(
        'div',
        { class: 'note-row' },
        h('div', null, h('b', null, st.label), h('span', { class: 'muted' }, ` · ${HINT_SOURCES[cur.source]}`)),
        h('div', { class: 'hint' }, cur.text || '(비어 있음)'),
        box,
        h('div', { class: 'row wrap' },
          h('button', { type: 'button', onClick: () => saveHint(box.value.trim()) }, '저장'),
          mine[i] ? h('button', { type: 'button', onClick: () => saveHint('') }, '원래대로') : null),
      );
    });
    return h('details', { class: 'hint-editor', open: hintsOpen, onToggle: (e) => (hintsOpen = e.target.open) }, h('summary', null, '단계 설명 보기·직접 쓰기'), ...rows);
  }

  function start(recipe, plan, iceG, grinder) {
    if (!d.doseG) return toast('원두량을 넣어 주세요.');
    const bean = d.beanId
      ? { id: d.beanId, name: store.get('beans', d.beanId)?.name ?? '' }
      : d.beanName.trim()
        ? { id: null, name: d.beanName.trim() }
        : null;
    const prep = {
      bean,
      style: d.style,
      tempC: d.tempC,
      grind: d.dial != null || grinder
        ? { grinderId: grinder?.id ?? null, grinderName: grinder?.name ?? '', dial: d.dial, zeroOffset: grinder?.zeroOffset ?? 0, um: d.um ?? null, umSd: d.umSd ?? null, measurement: d.measurement ?? null }
        : null,
      dripper: d.dripper,
      filter: d.filter,
      rinsed: d.rinsed,
      pourMethod: d.pourMethod,
    };
    // 얼음이 추천보다 적으면 그만큼을 추출 뒤 가수로 채우는 것이 계획이다(9/25) — 결과 화면 가수의 처음 값이 된다
    const short = iceShortG(plan, iceG, d.style);
    const finalPlan = { ...plan, iceG, iceTargetG: d.style === 'hot' ? 0 : plan.iceG, dilutionG: (plan.dilutionG ?? 0) + short };
    saveDraft(d); // 뒤로 가거나 취소하면 그 값 그대로 준비 화면으로 돌아오게
    const now = Date.now();
    const brewId = newId('brew', now);
    // 시간은 아직 재지 않는다. 타이머 화면의 [시작]에서 brew.start 를 남기고 잰다.
    saveActive({ brewId, recipeId: recipe.id, recipe, plan: finalPlan, prep, readyAt: now, customRatio: plan.waterFixed, state: readyBrew() });
    location.hash = '#/timer';
  }

  draw();
  return root;
}

// ── 타이머 ───────────────────────────────────────────────────
// 연타·실수 대책(사용자 결정 9/24): 버튼은 뗄 때 실행하고 밀어서 취소할 수 있으며, 넘긴 뒤에는 잠깐 [되돌리기]가 뜬다.
// [종료]도 두 번 눌림으로 끝나 버리지 않게, 누른 뒤 FINISH_MS 동안 되돌릴 수 있고 그다음 저장한다.
// 종료 시각은 누른 순간으로 기록하므로 기다리는 시간이 기록을 바꾸지 않는다.
const UNDO_MS = 5000;
const FINISH_MS = 3000;

// [종료] 뒤 저장. 되돌리기 시간 안에 새로고침·이동해도 기록을 잃지 않게 화면과 떼어 둔다.
function saveFinished(active, state, now, navigate = true) {
  const { plan, brewId } = active;
  const timer = summarize(state, plan);
  const brew = createBrew({ id: brewId, recipe: active.recipe, plan, prep: active.prep, timer, now: state.startedAt });
  logEvent('brew.end', { totalSec: timer.totalSec, plannedTotalSec: timer.plannedTotalSec, deltaSec: round1(timer.totalSec - timer.plannedTotalSec), verdict: timingVerdict(timer.totalSec - timer.plannedTotalSec).kind, via: state.endVia ?? null }, { brewId, now });
  store.put('brews', brew);
  logEvent('brew.saved', { where: store.mode }, { brewId });
  clearActive();
  clearDraft();
  if (navigate) location.hash = `#/brew/${brewId}/result`;
}

// 방치 확인에 답이 없어 끝낸다(기록 없음, 로그만 — 취소와 같은 처리). core/timer.js presence() 참고.
function abandonBrew(active, state, p, now) {
  const { plan, brewId } = active;
  const t = elapsedSec(state, now);
  logEvent('brew.abandon', {
    stepIndex: state.stepIndex,
    stepLabel: plan.steps[state.stepIndex].label,
    askAtSec: round1(p.askAtSec),
    stopAtSec: round1(p.stopAtSec),
    lastPressSec: state.stepStartsSec[state.stepIndex],
    openedLateSec: round1(Math.max(0, t - p.stopAtSec)),
  }, { brewId, now });
  clearActive();
  location.hash = '#/prep';
  setTimeout(() => toast('답이 없어 추출을 기록 없이 끝냈습니다.'), 0);
}

export function timerScreen() {
  const active = loadActive();
  // 앱을 닫았다가 한도를 넘긴 뒤 다시 열었으면 묻지 않고 바로 끝낸다
  if (active?.state.status === 'running' && presence(active.state, active.plan, Date.now()).phase === 'abandon') {
    const now = Date.now();
    setTimeout(() => abandonBrew(active, active.state, presence(active.state, active.plan, now), now), 0);
    return h('div');
  }
  if (active?.state.status === 'ended') {
    setTimeout(() => saveFinished(active, active.state, Date.now()), 0);
    return h('div');
  }
  if (!active || (active.state.status !== 'running' && active.state.status !== 'ready')) {
    setTimeout(() => (location.hash = '#/'), 0);
    return h('div');
  }
  const { plan, brewId } = active;
  let state = active.state;
  const undoStack = []; // 이 화면에서 누른 [다음]·[종료]: { at(ms) }
  let finishTimer = null;
  let infoUntil = 0;
  let endInfo = ''; // [종료] 직후 막대 문구(남은 초는 tick 이 붙인다)

  const R = 88;
  const C = 2 * Math.PI * R;
  const arc = svg('circle', { cx: 100, cy: 100, r: R, class: 'ring-fg', 'stroke-dasharray': C, 'stroke-dashoffset': 0, transform: 'rotate(-90 100 100)' });
  const ring = svg('svg', { viewBox: '0 0 200 200', class: 'ring' }, svg('circle', { cx: 100, cy: 100, r: R, class: 'ring-bg' }), arc);
  // 원 안(사용자 요청 9/25 — 핵심을 원 안에 모은다): 큰 숫자 + 작은 「초」 / 「남음」 / 붓는 동안 빨간 알약 「7초 · 42g」 / 맨 아래 「100g까지」
  const num = h('span', { class: 'ring-num' });
  const unit = h('span', { class: 'ring-unit' }, '초');
  const sub = h('div', { class: 'ring-sub' });
  const pourLeft = h('span');
  const pourG = h('span');
  const pourPill = h('div', { class: 'ring-pour hidden', 'aria-live': 'off' }, pourLeft, h('span', { class: 'ring-pour-dot' }, '·'), pourG);
  const targetIn = h('div', { class: 'ring-target' });
  // 단계 이름은 원 밖 아래에 크게(사용자 요청 9/25)
  const stepName = h('div', { class: 'step-name' });
  const elapsed = h('div', { class: 'elapsed' });
  // 전체 진행 막대(사용자 결정 9/24 — 언스페셜티 진행 화면의 「총 진행상태」 참고): 레시피 종료 목표까지 얼마나 왔나
  const totalFill = h('div', { class: 'total-fill' });
  const totalBar = h('div', { class: 'total-bar', role: 'progressbar', 'aria-label': '전체 진행', 'aria-valuemin': 0, 'aria-valuemax': plan.endSec }, totalFill);
  const hint = h('div', { class: 'step-hint' });
  const next = h('div', { class: 'next' });
  const infoText = h('span');
  const undoBtn = h('button', { type: 'button', class: 'undo-btn', onClick: onUndo }, '되돌리기');
  const info = h('div', { class: 'press-info hidden', role: 'status' }, infoText, undoBtn);
  const readyNote = h('div', { class: 'hint center' }, '물을 붓기 시작할 때 [시작]이나 원을 누르세요.', h('br'), '추출이 끝나면 자동으로 저장됩니다.');
  // 주 동작(시작 · 다음 푸어 · 종료): 아래 버튼과 원 전체가 같은 일을 한다(사용자 요청 9/25 — 붓는 중에 아래 버튼을 찾기 어렵다).
  // via = 어디를 눌렀나(button|ring) — 로그로 어느 쪽을 쓰는지 본다
  const primary = (via) => (state.status === 'ready' ? onStart(via) : onNext(via));
  const aborted = (via) => {
    const button = state.status === 'ready' ? 'start' : view(state, plan, Date.now()).isLast ? 'end' : 'next';
    logEvent('brew.pressAbort', { button, via, stepIndex: state.stepIndex }, { brewId });
    toast(button === 'start' ? '밀어서 취소했습니다. 시작하지 않았어요.' : '밀어서 취소했습니다. 넘기지 않았어요.');
  };
  const nextBtn = pressButton({ label: '다음 푸어 ›', className: 'primary big', onPress: () => primary('button'), onAbort: () => aborted('button') });
  const cancelBtn = h('button', { class: 'big', onClick: () => (state.status === 'ready' ? onBack() : onCancel()) }, '취소');
  // 방치 확인 창(넷플릭스 「아직 보고 계신가요?」 방식). 9/25: 다음 푸어 시간의 절반이 지나도록 안 누르면 뜬다(core/timer.js).
  // 마지막 단계가 아니면 깜박한 것이 거의 확실해 [레시피 시각에 넘긴 걸로 고치기]를 첫 번째로 둔다.
  const stillTitle = h('h3');
  const stillText = h('p');
  const stillBtns = h('div', { class: 'still-actions' });
  const still = h('div', { class: 'modal-back hidden' }, h('div', { class: 'modal', role: 'alertdialog', 'aria-label': '방치 확인' }, stillTitle, stillText, stillBtns));
  let stillFor = null; // 창을 어느 단계에 맞춰 그렸나
  function buildStill(i) {
    stillFor = i;
    const nx = plan.steps[i + 1];
    if (!nx) {
      stillTitle.textContent = '아직 추출 중인가요?';
      fill(stillBtns, h('button', { type: 'button', class: 'primary', onClick: onStillHere }, '계속 추출'), h('button', { type: 'button', onClick: onStillCancel }, '기록 없이 끝내기'));
      return;
    }
    stillTitle.textContent = `${josa(nx.label, '을', '를')} 누르지 않았어요`;
    fill(
      stillBtns,
      h('button', { type: 'button', class: 'primary', onClick: onStillFix }, `레시피 시각(${formatSec(nx.startSec)})에 넘긴 걸로 고치기`),
      h('button', { type: 'button', onClick: onStillHere }, `아직 ${plan.steps[i].label} 중이에요`),
      h('button', { type: 'button', onClick: onStillCancel }, '기록 없이 끝내기'),
    );
  }
  let askedAt = null; // 같은 질문을 로그에 한 번만 남기려고
  let stopped = false;
  // 원 전체 = 누름 영역(버튼과 같은 규칙: 뗄 때 실행, 밖으로 밀면 취소). 누르면 살짝 눌리고 누른 자리에서 물결이 퍼진다.
  const ringWrap = h('div', { class: 'ring-wrap press-ring', role: 'button', tabindex: 0, 'aria-label': '시작' }, ring, h('div', { class: 'ring-center' }, h('div', { class: 'ring-num-row' }, num, unit), sub, pourPill, targetIn));
  pressable(ringWrap, {
    onPress: () => primary('ring'),
    onAbort: () => aborted('ring'),
    disabled: () => state.status === 'ended' || state.status === 'cancelled',
    onDown: (e) => {
      const r = ringWrap.getBoundingClientRect();
      const ripple = h('span', { class: 'ring-ripple', style: `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px` });
      ringWrap.append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    },
  });
  ringWrap.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && state.status !== 'ended') {
      e.preventDefault();
      primary('ring');
    }
  });
  const root = h(
    'div',
    { class: 'screen timer' },
    h('div', { class: 'timer-head' }, h('div', { class: 'recipe-name' }, active.recipe.name), elapsed),
    totalBar,
    ringWrap,
    stepName,
    hint,
    next,
    readyNote,
    info,
    h('div', { class: 'row' }, cancelBtn, nextBtn),
    still,
  );

  // 원 안의 큰 숫자가 바뀔 때 살짝 올라오며 바뀐다(사용자 결정 9/25 — 시각 요소 「숫자 바뀜」). 같은 숫자면 그대로 둔다.
  function setNum(t) {
    if (num.textContent === t) return;
    num.textContent = t;
    num.classList.remove('tick');
    void num.offsetWidth; // 애니메이션을 처음부터 다시
    num.classList.add('tick');
  }

  const canUndo = (now) => state.status === 'ended' || (undoStack.length > 0 && now - undoStack[undoStack.length - 1].at < UNDO_MS);
  function showInfo(text, kind) {
    infoText.textContent = text;
    info.className = `press-info ${kind}`;
    infoUntil = Date.now() + UNDO_MS;
  }

  function tick() {
    if (stopped) return;
    const now = Date.now();
    const p = presence(state, plan, now);
    if (p.phase === 'abandon') {
      stopped = true;
      abandonBrew(active, state, p, now);
      return;
    }
    still.classList.toggle('hidden', p.phase !== 'ask');
    if (p.phase === 'ask') {
      if (askedAt !== p.askAtSec) {
        askedAt = p.askAtSec;
        logEvent('brew.stillAsk', { stepIndex: state.stepIndex, stepLabel: plan.steps[state.stepIndex].label, overSec: round1(p.overSec) }, { brewId, now });
      }
      if (stillFor !== state.stepIndex) buildStill(state.stepIndex);
      const t = elapsedSec(state, now);
      const nx = plan.steps[state.stepIndex + 1];
      const left = `${formatSec(p.stopAtSec - t)} 안에 답이 없으면 기록 없이 끝냅니다.`;
      stillText.textContent = nx
        ? `${nx.label} 시작(${formatSec(nx.startSec)})에서 ${Math.floor(t - nx.startSec)}초 지났어요. 깜박했다면 레시피 시각에 넘긴 것으로 고칠 수 있어요. ${left}`
        : `목표 시각을 ${Math.floor(p.overSec)}초 넘겼어요. ${left}`;
    }
    const v = view(state, plan, now);
    const ended = state.status === 'ended';
    const ready = state.status === 'ready';
    readyNote.classList.toggle('hidden', !ready);
    cancelBtn.textContent = ready ? '뒤로' : '취소';
    if (ready) {
      // 대기: 시간은 0에 멈춰 있고, 첫 단계에서 할 일만 보인다
      elapsed.textContent = formatSec(0);
      totalFill.style.width = '0%';
      setNum(String(Math.ceil(v.remainingSec)));
      unit.classList.remove('hidden');
      sub.textContent = '동안';
      pourPill.classList.add('hidden');
      arc.setAttribute('stroke-dashoffset', '0');
      stepName.textContent = v.step.label;
      targetIn.textContent = `${v.step.targetCumG}g까지 붓기`;
      hint.textContent = sentenceLines(v.step.hint);
      next.textContent = v.next ? `다음: ${v.next.label} · ${v.next.targetCumG}g까지 (${formatSec(v.next.startSec)})` : '';
      nextBtn.setLabel('시작');
      nextBtn.disabled = false;
      cancelBtn.disabled = false;
      info.classList.toggle('hidden', now > infoUntil);
      return;
    }
    elapsed.textContent = formatSec(Math.floor(v.elapsed)); // 스톱워치처럼 내림(남은 시간은 올림이라 합이 맞는다)
    totalFill.style.width = `${Math.min(100, (v.elapsed / plan.endSec) * 100)}%`;
    totalBar.classList.toggle('over', v.elapsed > plan.endSec);
    totalBar.setAttribute('aria-valuenow', String(Math.floor(v.elapsed)));
    // 큰 숫자 옆에 작게 「초」, 아래에 「남음」(사용자 요청 9/25)
    unit.classList.toggle('hidden', ended);
    if (ended) {
      setNum('종료');
      sub.textContent = '';
    } else if (v.overSec > 0) {
      setNum(`+${Math.floor(v.overSec)}`);
      sub.textContent = '지남';
    } else {
      setNum(String(Math.ceil(v.remainingSec)));
      sub.textContent = '남음';
    }
    root.classList.toggle('over', !ended && v.overSec > 0);
    ringWrap.setAttribute('aria-label', ended ? '종료됨' : v.isLast ? '종료' : '다음 푸어');
    arc.setAttribute('stroke-dashoffset', String(C * v.progress));
    stepName.textContent = v.step.label;
    // 붓는 구간(9/25 원 안으로): 빨간 알약 「7초 · 42g」 = 붓기 남은 초 · 고르게 부을 때의 «지금쯤 저울 값», 맨 아래 「100g까지」.
    // 붓는 시간이 지나면 알약을 숨기고 맨 아래를 「100g 붓기 끝」으로(9/24 — 10초 뒤에도 「붓습니다」가 남아 상황과 안 맞던 것).
    const pouring = !ended && v.pouring;
    pourPill.classList.toggle('hidden', !pouring);
    if (pouring) {
      pourLeft.textContent = `${Math.ceil(v.pourLeftSec)}초`;
      pourG.textContent = `${v.expectedNowG}g`;
    }
    targetIn.classList.toggle('done', ended || v.pourDone);
    targetIn.textContent = ended || v.pourDone ? `${v.step.targetCumG}g 붓기 끝` : `${v.step.targetCumG}g까지`;
    // 문장마다 줄을 바꾼다(사용자 요청 9/24 — 「~단계입니다.」 다음에서 끊기게). CSS .step-hint 가 white-space: pre-line
    hint.textContent = sentenceLines(v.step.hint);
    // 마지막 단계: 떼는 때 = 물줄기가 방울로 바뀔 때(사용자 질문 9/25). 레시피 시각은 기다릴 시각이 아니라 비교할 목표다.
    next.textContent = v.next
      ? `다음: ${v.next.label} · ${v.next.targetCumG}g까지 (${formatSec(v.next.startSec)})`
      : `물줄기가 방울로 바뀌면 [종료]를 누르고 드리퍼를 떼세요 · 목표 약 ${formatSec(plan.endSec)}`;
    nextBtn.setLabel(ended ? '저장 중…' : v.isLast ? '종료' : '다음 푸어 ›');
    nextBtn.disabled = ended;
    cancelBtn.disabled = ended;
    if (ended && finishTimer) infoText.textContent = `${endInfo} · ${Math.max(0, Math.ceil((undoStack[undoStack.length - 1].at + FINISH_MS - now) / 1000))}초 뒤 저장`;
    const undoable = canUndo(now);
    undoBtn.classList.toggle('hidden', !undoable);
    info.classList.toggle('hidden', !undoable && now > infoUntil);
  }

  // [시작]: 이 순간부터 잰다. 준비 화면에서 넘어온 뒤 기다린 시간(readySec)도 남긴다 — 준비와 붓기 사이가 얼마나 벌어지나.
  function onStart(via = 'button') {
    if (state.status !== 'ready') return;
    const now = Date.now();
    state = startBrew(now);
    saveActive({ ...active, state });
    const p = active.prep;
    logEvent('brew.start', {
      recipeId: active.recipeId, doseG: plan.doseG, hotWaterG: plan.hotWaterG, iceG: plan.iceG, iceTargetG: plan.iceTargetG, dripper: p.dripper,
      ratio: Math.round(plan.ratioHot * 10) / 10, customRatio: Boolean(active.customRatio), readySec: active.readyAt ? round1((now - active.readyAt) / 1000) : null, via,
    }, { brewId, now });
    tick();
  }

  // 대기 화면의 [뒤로]: 아직 시작 전이라 묻지 않고 준비 화면으로 돌아간다(입력값은 그대로).
  function onBack() {
    const now = Date.now();
    logEvent('brew.readyBack', { waitedSec: active.readyAt ? round1((now - active.readyAt) / 1000) : null }, { brewId, now });
    stopped = true;
    clearActive();
    location.hash = '#/prep';
  }

  function onNext(via = 'button') {
    if (state.status !== 'running') return;
    const now = Date.now();
    const from = state.stepIndex;
    state = advance(state, plan, now);
    if (state.status === 'ended') state = { ...state, endVia: via }; // brew.end 로그에 남긴다
    undoStack.push({ at: now });
    saveActive({ ...active, state });
    if (state.status === 'ended') {
      const vd = timingVerdict(state.endedSec - plan.endSec);
      endInfo = `종료 · ${vd.text} (레시피 ${formatSec(plan.endSec)})`;
      showInfo(endInfo, vd.kind);
      finishTimer = setTimeout(() => {
        finishTimer = null;
        saveFinished(active, state, Date.now());
      }, FINISH_MS);
    } else {
      const to = state.stepIndex;
      const actualSec = state.stepStartsSec[to];
      const plannedSec = plan.steps[to].startSec;
      const vd = timingVerdict(actualSec - plannedSec);
      logEvent('brew.step', { from: plan.steps[from].label, to: plan.steps[to].label, plannedSec, actualSec, deltaSec: round1(actualSec - plannedSec), verdict: vd.kind, via }, { brewId, now });
      showInfo(`${plan.steps[to].label} 시작 · ${vd.text} (레시피 ${formatSec(plannedSec)})`, vd.kind);
    }
    tick();
  }

  function onUndo() {
    const now = Date.now();
    if (!canUndo(now)) return;
    const last = undoStack.pop();
    const what = state.status === 'ended' ? 'end' : 'step';
    if (finishTimer) {
      clearTimeout(finishTimer);
      finishTimer = null;
    }
    const fromLabel = plan.steps[state.stepIndex].label;
    state = undoAdvance(state);
    saveActive({ ...active, state });
    logEvent('brew.undo', { what, from: fromLabel, to: plan.steps[state.stepIndex].label, afterSec: round1((now - last.at) / 1000) }, { brewId, now });
    // 연타로 두 번 넘겼다면 막대가 남아 한 번 더 되돌릴 수 있다(canUndo 가 남은 기록의 시각을 본다)
    showInfo(what === 'end' ? '종료를 되돌렸습니다. 계속 진행합니다.' : `되돌렸습니다 · ${plan.steps[state.stepIndex].label}`, 'undone');
    tick();
  }

  // 방치 확인에서 [레시피 시각에 넘긴 걸로 고치기]: 깜박하고 못 누른 [다음 푸어]를 레시피 시각으로 기록한다(되돌리기 가능)
  function onStillFix() {
    if (state.status !== 'running' || state.stepIndex >= plan.steps.length - 1) return;
    const now = Date.now();
    const from = state.stepIndex;
    const at = plan.steps[from + 1].startSec;
    const lateSec = round1(elapsedSec(state, now) - at);
    state = advance(state, plan, now, { atSec: at });
    undoStack.push({ at: now });
    saveActive({ ...active, state });
    const actualSec = state.stepStartsSec[from + 1];
    logEvent('brew.step', { from: plan.steps[from].label, to: plan.steps[from + 1].label, plannedSec: at, actualSec, deltaSec: round1(actualSec - at), verdict: 'ok', via: 'stillAsk', backdated: true, pressedLateSec: lateSec }, { brewId, now });
    showInfo(`${plan.steps[from + 1].label} 시작을 레시피 시각 ${formatSec(at)}으로 고쳤습니다`, 'ok');
    tick();
  }

  function onStillHere() {
    const now = Date.now();
    const p = presence(state, plan, now);
    state = acknowledge(state, now);
    saveActive({ ...active, state });
    logEvent('brew.stillHere', { stepIndex: state.stepIndex, answeredAfterSec: round1(elapsedSec(state, now) - p.askAtSec) }, { brewId, now });
    tick();
  }

  function onStillCancel() {
    const now = Date.now();
    const c = cancel(state, now);
    stopped = true;
    logEvent('brew.cancel', { recipeId: active.recipeId, stepIndex: c.stepIndex, stepLabel: plan.steps[c.stepIndex].label, elapsedSec: c.endedSec, via: 'stillAsk' }, { brewId, now });
    clearActive();
    location.hash = '#/prep';
  }

  async function onCancel() {
    const k = await modal({
      title: '추출을 취소할까요?',
      body: '취소하면 이 추출은 기록되지 않고, 준비 화면으로 돌아갑니다.',
      actions: [{ key: 'no', label: '계속 추출' }, { key: 'yes', label: '취소하기', primary: true }],
    });
    if (k !== 'yes' || state.status !== 'running') return;
    const now = Date.now();
    const c = cancel(state, now);
    logEvent('brew.cancel', { recipeId: active.recipeId, stepIndex: c.stepIndex, stepLabel: plan.steps[c.stepIndex].label, elapsedSec: c.endedSec, via: 'timer' }, { brewId, now });
    clearActive();
    location.hash = '#/prep';
  }

  tick();
  const timerId = setInterval(tick, 100); // 붓는 동안의 저울 값이 부드럽게 오르게 0.1초마다(9/25, 전 0.2초)
  keepAwake();
  return {
    node: root,
    hideNav: true,
    cleanup: () => {
      clearInterval(timerId);
      releaseAwake();
      // 되돌리기 시간 안에 화면을 떠나면 그 자리에서 저장한다(이동한 화면은 그대로 둔다)
      if (finishTimer) {
        clearTimeout(finishTimer);
        finishTimer = null;
        saveFinished(active, state, Date.now(), false);
      }
    },
  };
}

// ── 결과 ─────────────────────────────────────────────────────
export function conditionsList(b) {
  return h('dl', { class: 'kv' }, ...conditionRows(b).flatMap(([k, v, sub]) => [h('dt', null, term(k, sub)), h('dd', null, v)]));
}

// 단계표: 레시피 끝 시각과 실제로 누른 시각, 그리고 판정(±2초 이내 = 적절)
export function timerTable(b) {
  return h(
    'table',
    { class: 'plan' },
    h('tr', null, h('th', null, '단계'), h('th', null, '실제 끝'), h('th', null, '레시피'), h('th', null, '판정')),
    ...stepRows(b).map((s) =>
      h('tr', null, h('td', null, s.label), h('td', null, formatSec(s.actualEndSec), s.corrected ? h('span', { class: 'term-sub' }, '고침') : null), h('td', { class: 'muted' }, formatSec(s.plannedEndSec)), h('td', { class: `verdict ${s.verdict?.kind ?? ''}` }, s.verdict?.text ?? '—')),
    ),
  );
}

export function comparisonBlock(b) {
  const prev = findPrevious(store.list('brews'), b);
  const lines = [];
  if (prev.sameRecipe) {
    const c = compareTimer(b, prev.sameRecipe);
    const sig = c.steps.filter((s) => s.significant);
    if (c.total.significant) lines.push(h('div', { class: 'diff strong' }, `지난 추출보다 ${formatDelta(c.total.deltaSec)}`));
    for (const s of sig) lines.push(h('div', { class: 'diff' }, `${s.label} 끝: ${formatDelta(s.deltaSec)}`));
    if (!c.total.significant && sig.length === 0) lines.push(h('div', { class: 'muted' }, '지난 추출과 거의 같습니다(±2초 이내).'));
  } else {
    lines.push(h('div', { class: 'muted' }, '같은 레시피로 내린 이전 기록이 없습니다.'));
  }
  if (prev.sameBeanOtherRecipe) lines.push(h('div', { class: 'hint' }, `이 원두는 지난번에 「${prev.sameBeanOtherRecipe.recipe.name}」로 내렸습니다.`));
  if (prev.partner) lines.push(linkButton({ href: `#/brew/${b.id}`, label: '두 기록 1:1 비교 보기' }));
  return { lines, prev };
}

export function resultScreen(id) {
  const b = store.get('brews', id);
  if (!b) return brewNotFound();
  const root = h('div', { class: 'screen' });
  const save = (field, value) => {
    b.result[field] = value;
    store.put('brews', b);
    logEvent('result.update', { field, value }, { brewId: b.id });
  };

  // 서버 무게(사용자 요청 9/25): 스위치는 처음부터 켜져 있다. 재지 않으려면 끄거나 칸을 비워 두면 된다.
  // 9/26: 무게 칸끼리 서로 따라 바뀐다(core/schema.js linkWeights) — 가수 전 + 가수 = 가수 후, 가수 후 + 추가 얼음 = 얼음 넣은 뒤.
  // 어느 칸을 고쳐도 칸이 사라지지 않는다(전에는 두 무게를 넣으면 가수 칸이 값만 보이는 칸으로 바뀌었다).
  const iced = b.conditions.style !== 'hot';
  function lastServer(servers) {
    const lastId = store.brews().find((x) => x.result?.server?.id)?.result.server.id;
    const pick = servers.find((x) => x.id === lastId) ?? servers[0];
    return pick ? { id: pick.id, name: pick.name, tareG: pick.tareG } : null;
  }
  // 칸 하나를 고치면 따라 바뀌는 칸까지 한 번에 저장한다(로그는 고친 칸 하나 + 따라 바뀐 칸들)
  function setWeight(key, v) {
    if (!b.result.server && key !== 'dilutionG' && key !== 'iceAddedG') {
      const pick = lastServer(store.list('servers'));
      if (pick) b.result.server = pick; // 무게를 처음 넣을 때 화면에 보이던 서버를 기록에 함께 남긴다
    }
    const changed = linkWeights(b.result, key, v, { iceOn: iced && Boolean(b.result.iceAddedOn) });
    Object.assign(b.result, { [key]: v }, changed);
    store.put('brews', b);
    logEvent('result.update', { field: key, value: v, linked: Object.fromEntries(Object.entries(changed).filter(([k]) => k !== key)) }, { brewId: b.id });
    draw();
  }
  const weightOn = () => !b.result.serverOff;

  function serverBlock() {
    const r = b.result;
    const servers = store.list('servers');
    const sw = toggle({
      checked: weightOn(),
      label: '서버 무게 재기',
      sub: { on: '서버를 올린 채 잰 저울 값을 적습니다. 비워 두어도 됩니다.', off: '무게를 적지 않고 가수만 직접 적습니다.' },
      onChange: (v) => {
        save('serverOff', !v);
        if (!v) {
          for (const k of ['serverWeightG', 'serverAfterG', 'serverAfterIceG', 'server']) save(k, null);
        }
        draw();
      },
    });
    if (!weightOn()) return [sw];
    const srv = r.server ?? lastServer(servers);
    const sel = srv?.id ?? '__custom__';
    const select = h(
      'select',
      {
        onChange: (e) => {
          const pick = servers.find((x) => x.id === e.target.value);
          save('server', pick ? { id: pick.id, name: pick.name, tareG: pick.tareG } : { id: null, name: '', tareG: r.server?.tareG ?? null });
          draw();
        },
      },
      ...servers.map((x) => h('option', { value: x.id, selected: x.id === sel }, `${x.name} · ${x.tareG ?? '?'}g`)),
      h('option', { value: '__custom__', selected: sel === '__custom__' }, '등록 없이 무게만 적기'),
    );
    const net = netServerWeight({ ...r, server: srv });
    return [
      sw,
      field('서버', select, servers.length ? null : h('span', null, '자주 쓰는 서버는 ', h('a', { href: '#/servers' }, '서버 등록'), '에 넣어 두면 다음부터 고르기만 하면 됩니다.')),
      sel === '__custom__'
        ? field('서버 자체 무게', stepper({ value: srv?.tareG, step: 1, min: 0, max: 3000, unit: 'g', onChange: (v) => { save('server', { ...(r.server ?? { id: null, name: '' }), tareG: v }); draw(); } }))
        : null,
      field(termOf(WORDS.serverTotal), stepper({ value: r.serverWeightG, step: 1, min: 0, max: 3000, unit: 'g', onChange: (v) => setWeight('serverWeightG', v) }),
        net != null ? h('span', null, h('b', null, `${WORDS.netWeight.label} ${net}g`), ` · ${WORDS.netWeight.sub}`) : null),
    ];
  }

  // 가수(항상 보인다) · 가수 후 총무게(서버 무게를 잴 때)
  function dilutionBlock() {
    const r = b.result;
    return [
      field(termOf(WORDS.dilution), stepper({ value: dilutionView(b).dilutionG, step: 1, min: 0, max: 1000, unit: 'g', onChange: (v) => setWeight('dilutionG', v ?? 0) }),
        r.lastWeighed === 'after' && r.serverWeightG != null ? '가수 후 − 가수 전 총무게로 계산했습니다. 여기를 고치면 가수 후 총무게가 따라 바뀝니다.' : null),
      weightOn() ? field(termOf(WORDS.serverAfter), stepper({ value: r.serverAfterG, step: 1, min: 0, max: 5000, unit: 'g', onChange: (v) => setWeight('serverAfterG', v) })) : null,
    ];
  }

  // 추가 얼음(아이스, 사용자 요청 9/26 — 가수 아래, 처음엔 꺼짐). 끄면 «안 넣음»이 아니라 «기록 안 함(양 모름)»으로 공유한다
  function iceBlock() {
    if (!iced) return [];
    const r = b.result;
    const sw = toggle({
      checked: Boolean(r.iceAddedOn),
      label: WORDS.iceAdded.label,
      sub: { on: '추출 뒤 서버나 잔에 더 넣은 얼음을 적습니다.', off: '적지 않으면 「넣었을 수 있지만 양은 모름」으로 남습니다.' },
      onChange: (v) => {
        save('iceAddedOn', v);
        if (v) setWeight('iceAddedG', r.iceAddedG ?? 0);
        else draw();
      },
    });
    if (!r.iceAddedOn) return [sw];
    return [
      sw,
      field(termOf(WORDS.iceAdded), stepper({ value: r.iceAddedG ?? 0, step: 1, min: 0, max: 1000, unit: 'g', onChange: (v) => setWeight('iceAddedG', v ?? 0) }),
        r.iceLastWeighed === 'after' && r.serverAfterG != null ? '얼음 넣은 뒤 − 가수 후 총무게로 계산했습니다.' : null),
      weightOn() ? field(termOf(WORDS.serverAfterIce), stepper({ value: r.serverAfterIceG, step: 1, min: 0, max: 5000, unit: 'g', onChange: (v) => setWeight('serverAfterIceG', v) })) : null,
    ];
  }

  // 원두와 물의 비율(가수·추가 얼음 포함)과 계획 비율까지의 추천
  function ratioBlock() {
    const dv = dilutionView(b);
    const what = dv.iceAddedG ? '가수·추가 얼음 포함' : '가수 포함';
    const lines = [];
    if (Math.abs(dv.moreG) < 1) lines.push(h('div', null, `계획 비율(${formatRatio(dv.ratioTarget)})과 같습니다.`));
    else if (dv.moreG > 0) lines.push(h('div', null, `계획 비율 ${formatRatio(dv.ratioTarget)}까지 가수 ${Math.round(dv.moreG)}g 더`));
    else lines.push(h('div', null, `계획 비율(${formatRatio(dv.ratioTarget)})보다 ${Math.round(-dv.moreG)}g만큼 연합니다.`));
    lines.push(h('div', null, '계획 비율 = 계획한 뜨거운 물 + 추천 얼음 + 레시피 가수'));
    return field(`${WORDS.ratio.label}(${what})`, h('div', { class: 'field-value' }, formatRatio(dv.ratioNow), h('span', { class: 'term-sub' }, `물 모두 ${dv.waterNowG}g`)), lines);
  }

  // 누른 시각 고치기(사용자 요청 9/25, 정정 9/26 — 못 누른 경우만이 아니라 모든 단계를 사후에): 타이머 기록은 그대로 두고
  // result.startShiftSec(시작 보정) · result.stepFix(단계별 «끝» 시각)를 겹쳐 본다(core/schema.js timerOf)
  let fixOpen = false;
  // 분쇄 측정(사용자 결정 9/26): 준비 화면에서 불러온 것이 없으면 여기서 이 기록에 붙인다(result.grindMeasurement)
  function measureSection() {
    const m = measurementOf(b);
    const g = b.conditions.grind;
    const grinder = g?.grinderId ? store.get('grinders', g.grinderId) : null;
    return section(
      '분쇄 측정',
      m ? h('div', { class: 'hint' }, measureSummary(m)) : h('div', { class: 'hint' }, '언스페셜티에서 분쇄를 잰 결과(CSV 또는 결과 화면 사진)를 이 기록에 붙일 수 있습니다.'),
      m ? measureView(m) : null,
      ...measureImportButton({ grinder: grinder ?? (g ? { id: null, name: g.grinderName, zeroOffset: g.zeroOffset } : null), via: 'result', onDone: (mm) => { save('grindMeasurement', mm); draw(); } }),
      linkButton({ href: 'https://community.unspecialty.com/compass/grinder', label: '사진으로 분쇄 재기 · 언스페셜티', external: true }),
    );
  }

  function fixEditor() {
    const t = timerOf(b);
    const fix = b.result.stepFix ?? {};
    const shift = b.result.startShiftSec ?? 0;
    const changed = shift !== 0 || Object.keys(fix).length > 0;
    const setFix = (i, v) => {
      const next = { ...fix };
      const base = b.timer.steps[i].actualEndSec == null ? null : round1(b.timer.steps[i].actualEndSec + shift);
      if (v == null || v === base) delete next[i];
      else next[i] = v;
      const ends = b.timer.steps.map((s, k) => next[k] ?? (s.actualEndSec == null ? null : s.actualEndSec + shift));
      if (ends.some((e, k) => k > 0 && e != null && ends[k - 1] != null && e <= ends[k - 1])) {
        toast('앞 단계가 끝난 시각보다 늦어야 합니다.');
        return draw();
      }
      save('stepFix', next);
      draw();
    };
    return h(
      'details',
      { class: 'sub-details', open: fixOpen || changed, onToggle: (e) => (fixOpen = e.target.open) },
      h('summary', null, '누른 시각 고치기'),
      h('div', { class: 'hint' }, '늦게·일찍 눌렀거나 못 누른 단계를 실제 시각으로 고칩니다. 타이머 기록은 그대로 두고, 화면·비교·AI 공유는 고친 시각으로 봅니다.'),
      field(
        term('시작 보정', '[시작]을 늦게 눌렀으면 +, 일찍 눌렀으면 −'),
        stepper({ value: shift, step: 1, min: -30, max: 30, unit: '초', onChange: (v) => { save('startShiftSec', v ?? 0); draw(); } }),
        '모든 누른 시각이 이만큼 옮겨집니다(붓기 시작 = 0초).',
      ),
      ...t.steps.map((st, i) =>
        field(
          `${st.label} 끝`,
          stepper({ value: st.actualEndSec, step: 1, min: 0, max: 3600, unit: '초', onChange: (v) => setFix(i, v) }),
          `${formatSec(st.actualEndSec)} · 레시피 ${formatSec(st.plannedEndSec)}${st.corrected ? ` · 누른 시각 ${formatSec(b.timer.steps[i].actualEndSec)}에서 고침` : ''}`,
        ),
      ),
      changed ? h('button', { type: 'button', class: 'inline-btn quiet', onClick: () => { save('stepFix', {}); save('startShiftSec', 0); draw(); } }, '누른 시각으로 되돌리기') : null,
    );
  }

  function draw() {
    const { lines } = comparisonBlock(b);
    const r = b.result;
    const c = b.conditions;
    fill(
      root,
      h('h1', null, '추출 결과'),
      h('div', { class: 'hint' }, '자동으로 저장되었습니다. 아래를 고치면 바로 반영됩니다.'),
      section('결과', timerTable(b), brewFigure(b), h('div', { class: 'total' }, `총 ${formatSec(timerOf(b).totalSec)}`, h('span', { class: 'muted' }, ` (레시피 ${formatSec(b.timer.plannedTotalSec)})`)), ...lines, fixEditor()),
      section(
        '종료 상태',
        chips({
          options: END_STATES.map((k) => END_STATE_WORDS[k].label),
          selected: END_STATE_WORDS[endStateKey(r.endState)]?.label ?? null,
          describe: Object.fromEntries(END_STATES.map((k) => [END_STATE_WORDS[k].label, END_STATE_WORDS[k].sub])),
          onChange: (v) => save('endState', END_STATES.find((k) => END_STATE_WORDS[k].label === v) ?? null),
        }),
      ),
      section(
        '계획대로 했나요?',
        field(`물 (계획 ${c.hotWaterG}g)`, chips({ options: ['계획대로', '바뀜'], selected: r.actualWaterG == null ? '계획대로' : '바뀜', onChange: (v) => { save('actualWaterG', v === '바뀜' ? c.hotWaterG : null); draw(); } })),
        r.actualWaterG != null ? stepper({ value: r.actualWaterG, step: 1, min: 0, max: 2000, unit: 'g', onChange: (v) => save('actualWaterG', v) }) : null,
        field(`드립 방법 (계획 ${c.pourMethod})`, chips({ options: ['계획대로', '바뀜'], selected: r.actualPourMethod == null ? '계획대로' : '바뀜', onChange: (v) => { save('actualPourMethod', v === '바뀜' ? c.pourMethod : null); draw(); } })),
        r.actualPourMethod != null ? choiceList({ options: POUR_METHODS, value: r.actualPourMethod, onChange: (v) => save('actualPourMethod', v) }) : null,
      ),
      section(
        '추출 후',
        ...serverBlock(),
        ...dilutionBlock(),
        ...iceBlock(),
        ratioBlock(),
      ),
      measureSection(),
      // 추가 입력(사용자 요청 9/26 — 테이스팅 노트처럼 결과에도 자유롭게 적는 칸)
      section(null, field(termOf(WORDS.resultNote), h('textarea', { rows: 3, value: b.result.extraNote ?? '', placeholder: '물이 한쪽으로 쏠림, 원두층이 평평하지 않음 등', onChange: (e) => save('extraNote', e.target.value.trim() || null) }))),
      h('button', { class: 'primary big wide', onClick: () => (location.hash = `#/brew/${b.id}/survey`) }, '테이스팅 노트 쓰기'),
      h('button', { class: 'wide', onClick: () => (location.hash = '#/') }, '마신 뒤에 할게요'),
    );
  }
  draw();
  return root;
}
