// 추출 흐름: 준비 → 타이머 → 결과

import { h, svg, section, field, stepper, choiceList, chips, modal, toast, toggle, pressButton, term, termOf } from '../dom.js';
import { store, saveActive, loadActive, clearActive } from '../../core/store.js';
import { PRESETS, findPreset } from '../../data/presets.js';
import { buildPlan, scaleAdvice, formatRatio, stepHint, HINT_SOURCES } from '../../core/recipe.js';
import { startBrew, view, advance, undoAdvance, cancel, summarize, presence, acknowledge, elapsedSec } from '../../core/timer.js';
import { conditionRows, stepRows } from '../../core/facts.js';
import { WORDS, END_STATE_WORDS, endStateKey } from '../../core/words.js';
import {
  createBrew, newId, round1, formatSec, formatGrind, grindActual, formatDelta, timingVerdict, netServerWeight,
  DRIPPERS, FILTERS, POUR_METHODS, END_STATES,
} from '../../core/schema.js';
import { findPrevious, compareTimer } from '../../core/diff.js';
import { logEvent } from '../../core/log.js';
import { keepAwake, releaseAwake } from '../../platform/wakelock.js';

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
  const recipe = findPreset(recipeId) ?? PRESETS[0];
  const brews = store.brews();
  const last = brews[0];
  const lastSame = brews.find((b) => b.recipe.id === recipe.id);
  const c = last?.conditions;
  return {
    recipeId: recipe.id,
    beanId: last?.bean?.id ?? null,
    beanName: last?.bean && !last.bean.id ? last.bean.name : '',
    grinderId: c?.grind?.grinderId ?? store.list('grinders')[0]?.id ?? null,
    dial: c?.grind?.dial ?? null,
    um: c?.grind?.um ?? null, // 참고 µm(보조, 선택) — 직전 기록과 같은 그라인더·다이얼에서 이어받는다
    dripper: c?.dripper ?? DRIPPERS[0],
    filter: c?.filter ?? FILTERS[0],
    rinsed: c?.rinsed ?? null,
    pourMethod: c?.pourMethod ?? POUR_METHODS[0],
    doseG: lastSame?.conditions.doseG ?? recipe.refDoseG,
    tempC: lastSame?.conditions.tempC ?? recipe.tempC,
    style: recipe.style,
    iceG: null, // null = 레시피 추천값
  };
}

export function prepScreen() {
  const lastRecipe = store.brews()[0]?.recipe.id;
  let d = loadDraft() ?? defaultsFor(findPreset(lastRecipe) ? lastRecipe : PRESETS[0].id);
  const root = h('div', { class: 'screen' });
  let hintsOpen = false; // 다시 그려도 「단계 설명」 펼침을 유지
  const set = (patch, redraw = true) => {
    d = { ...d, ...patch };
    saveDraft(d);
    if (redraw) draw();
  };

  function draw() {
    const recipe = findPreset(d.recipeId) ?? PRESETS[0];
    const plan = buildPlan(recipe, d.doseG, customHints(recipe.id));
    const iceG = d.style === 'hot' ? 0 : d.iceG ?? plan.iceG;
    const advice = scaleAdvice(recipe, d.doseG);
    const beans = store.list('beans').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
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

    root.replaceChildren(
      h('h1', null, '추출 준비'),
      section(
        '레시피',
        h('select', {
          onChange: (e) => {
            // 레시피에 딸린 값만 바꾸고 원두·도구 선택은 그대로 둔다
            const nd = defaultsFor(e.target.value);
            set({ recipeId: nd.recipeId, doseG: nd.doseG, tempC: nd.tempC, style: nd.style, iceG: null });
          },
        }, ...PRESETS.map((r) => h('option', { value: r.id, selected: r.id === recipe.id }, r.name))),
        h(
          'div',
          { class: 'hint' },
          `${recipe.style === 'iced' ? '아이스' : '핫'} · ${recipe.designedFor} 기준 · 원두 ${recipe.refDoseG}g · ${recipe.tempC}℃ · ${recipe.grindNote}`,
          recipe.roastNote ? ` · ${recipe.roastNote}` : '',
        ),
        h('div', { class: 'source' }, '출처: ', h('a', { href: recipe.source.url, target: '_blank', rel: 'noopener' }, recipe.source.label)),
      ),
      section(
        '원두',
        field('원두', beanSelect),
        !d.beanId && d.beanName
          ? field('원두 이름', h('input', { type: 'text', value: d.beanName.trim(), onChange: (e) => set({ beanName: e.target.value }, false) }))
          : null,
        h('a', { class: 'link-action', href: '#/bean/new', onClick: () => sessionStorage.setItem('nb.returnTo', '#/prep') }, '＋ 원두 등록'),
        field('원두량', stepper({ value: d.doseG, step: 1, min: 1, max: 100, unit: 'g', onChange: (v) => set({ doseG: v, iceG: null }) }),
          advice ? advice.text : `레시피 기준 원두량입니다. 기준으로 먼저 내린 뒤 바꿔 가며 비교하세요.`),
      ),
      section(
        '분쇄',
        grinders.length
          ? field('그라인더', h('select', { onChange: (e) => set({ grinderId: e.target.value }) }, ...grinders.map((g) => h('option', { value: g.id, selected: g.id === d.grinderId }, g.name))))
          : h('div', { class: 'hint' }, '등록된 그라인더가 없습니다. 영점을 쓰려면 설정에서 등록하세요.'),
        field(termOf(WORDS.grindDial), stepper({ value: d.dial, step: 1, min: 0, max: 999, onChange: (v) => set({ dial: v }) }),
          d.dial != null ? `표기 ${formatGrind(d.dial, grinder?.zeroOffset ?? 0)} · 실제 ${grindActual(d.dial, grinder?.zeroOffset ?? 0)}클릭` : '다이얼 값을 넣으면 영점을 반영해 보여 줍니다.'),
        // 보조값(사용자 결정 9/24): 변환 사이트에서 찾은 추정치를 직접 적는다. 앱이 계산하지 않는다.
        field(term('참고 µm', '선택 · 변환 사이트의 추정치'), stepper({ value: d.um, step: 10, min: 0, max: 3000, unit: 'µm', onChange: (v) => set({ um: v }, false) })),
        h('a', { class: 'link-action', href: '#/settings', onClick: () => sessionStorage.setItem('nb.returnTo', '#/prep') }, '그라인더 등록·영점 변경·변환 사이트'),
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
        field('물 온도', stepper({ value: d.tempC, step: 1, min: 50, max: 100, unit: '℃', onChange: (v) => set({ tempC: v }, false) }), '가열을 끝낸 시점의 온도'),
        d.style === 'hot'
          ? null
          : field('얼음', stepper({ value: iceG, step: 1, min: 0, max: 500, unit: 'g', onChange: (v) => set({ iceG: v }) }), `추천 ${plan.iceG}g (원두량 × 레시피 비율)`),
      ),
      section(
        '이번 계획',
        h('div', null, `뜨거운 물 ${plan.hotWaterG}g (${formatRatio(plan.ratioHot)})`, iceG ? ` + 얼음 ${iceG}g = 전체 ${formatRatio((plan.hotWaterG + iceG) / plan.doseG)}` : ''),
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
          ...(recipe.pourTips ?? []).map((n) => h('li', null, n)),
          ...recipe.notes.filter((n) => !n.startsWith('얼음을 서버')).map((n) => h('li', null, n)),
        ),
        hintEditor(recipe),
      ),
      h('button', { class: 'primary big wide', onClick: () => start(recipe, plan, iceG, grinder) }, '추출 시작'),
      h('div', { class: 'hint center' }, '물을 붓기 시작할 때 누르세요. 추출이 끝나면 자동으로 저장됩니다.'),
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
        ? { grinderId: grinder?.id ?? null, grinderName: grinder?.name ?? '', dial: d.dial, zeroOffset: grinder?.zeroOffset ?? 0, um: d.um ?? null }
        : null,
      dripper: d.dripper,
      filter: d.filter,
      rinsed: d.rinsed,
      pourMethod: d.pourMethod,
    };
    const finalPlan = { ...plan, iceG };
    saveDraft(d); // 취소하면 시작했던 값 그대로 준비 화면으로 돌아오게
    const now = Date.now();
    const brewId = newId('brew', now);
    saveActive({ brewId, recipeId: recipe.id, recipe, plan: finalPlan, prep, state: startBrew(now) });
    logEvent('brew.start', { recipeId: recipe.id, doseG: plan.doseG, hotWaterG: plan.hotWaterG, iceG, dripper: d.dripper }, { brewId, now });
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
  logEvent('brew.end', { totalSec: timer.totalSec, plannedTotalSec: timer.plannedTotalSec, deltaSec: round1(timer.totalSec - timer.plannedTotalSec), verdict: timingVerdict(timer.totalSec - timer.plannedTotalSec).kind }, { brewId, now });
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
  if (!active || active.state.status !== 'running') {
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
  const num = h('div', { class: 'ring-num' });
  const sub = h('div', { class: 'ring-sub' });
  const stepName = h('div', { class: 'ring-step' });
  const elapsed = h('div', { class: 'elapsed' });
  const targetMain = h('div');
  const targetSub = h('div', { class: 'pour-sub' });
  const target = h('div', { class: 'pour-target' }, targetMain, targetSub);
  const hint = h('div', { class: 'step-hint' });
  const next = h('div', { class: 'next' });
  const infoText = h('span');
  const undoBtn = h('button', { type: 'button', class: 'undo-btn', onClick: onUndo }, '되돌리기');
  const info = h('div', { class: 'press-info hidden', role: 'status' }, infoText, undoBtn);
  const nextBtn = pressButton({
    label: '다음 푸어 ›',
    className: 'primary big',
    onPress: onNext,
    onAbort: () => {
      logEvent('brew.pressAbort', { button: view(state, plan, Date.now()).isLast ? 'end' : 'next', stepIndex: state.stepIndex }, { brewId });
      toast('밀어서 취소했습니다. 넘기지 않았어요.');
    },
  });
  const cancelBtn = h('button', { class: 'big', onClick: onCancel }, '취소');
  // 방치 확인 창(넷플릭스 「아직 보고 계신가요?」 방식)
  const stillText = h('p');
  const still = h(
    'div',
    { class: 'modal-back hidden' },
    h(
      'div',
      { class: 'modal', role: 'alertdialog', 'aria-label': '아직 추출 중인가요?' },
      h('h3', null, '아직 추출 중인가요?'),
      stillText,
      h('div', { class: 'row' }, h('button', { type: 'button', onClick: onStillCancel }, '기록 없이 끝내기'), h('button', { type: 'button', class: 'primary', onClick: onStillHere }, '계속 추출')),
    ),
  );
  let askedAt = null; // 같은 질문을 로그에 한 번만 남기려고
  let stopped = false;
  const root = h(
    'div',
    { class: 'screen timer' },
    h('div', { class: 'timer-head' }, h('div', { class: 'recipe-name' }, active.recipe.name), elapsed),
    h('div', { class: 'ring-wrap' }, ring, h('div', { class: 'ring-center' }, num, sub, stepName)),
    target,
    hint,
    next,
    info,
    h('div', { class: 'row' }, cancelBtn, nextBtn),
    still,
  );

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
      stillText.textContent = `목표 시각을 ${Math.floor(p.overSec)}초 넘겼어요. ${formatSec(p.stopAtSec - elapsedSec(state, now))} 안에 답이 없으면 기록 없이 끝냅니다.`;
    }
    const v = view(state, plan, now);
    const ended = state.status === 'ended';
    elapsed.textContent = formatSec(Math.floor(v.elapsed)); // 스톱워치처럼 내림(남은 시간은 올림이라 합이 맞는다)
    if (ended) {
      num.textContent = '종료';
      sub.textContent = '';
    } else if (v.overSec > 0) {
      num.textContent = `+${Math.floor(v.overSec)}`;
      sub.textContent = '초 지남';
    } else {
      num.textContent = String(Math.ceil(v.remainingSec));
      sub.textContent = '초 남음';
    }
    root.classList.toggle('over', !ended && v.overSec > 0);
    arc.setAttribute('stroke-dashoffset', String(C * v.progress));
    stepName.textContent = v.step.label;
    // 붓는 구간: 목표 g을 파스텔 빨강으로 은은하게 강조하고, 고르게 부을 때의 «지금쯤 저울 값»과 속도를 함께 보인다.
    // 붓는 시간이 지나면 「붓기 끝 · 기다리는 중」으로 바꾼다(9/24 — 10초 뒤에도 「붓습니다」가 남아 상황과 안 맞던 것).
    target.classList.toggle('pouring', !ended && v.pouring);
    target.classList.toggle('waiting', ended || v.pourDone);
    if (!ended && v.pouring) {
      targetMain.textContent = `${v.step.targetCumG}g까지 붓기`;
      targetSub.textContent = `지금 약 ${v.expectedNowG}g · 초당 ${v.pourRateGps}g · ${Math.ceil(v.pourLeftSec)}초`;
    } else if (ended || v.pourDone) {
      targetMain.textContent = `${v.step.targetCumG}g 붓기 끝`;
      targetSub.textContent = ended ? '' : '기다리는 중';
    } else {
      targetMain.textContent = `${v.step.targetCumG}g까지 붓기`;
      targetSub.textContent = '';
    }
    hint.textContent = v.step.hint;
    next.textContent = v.next ? `다음: ${v.next.label} · ${v.next.targetCumG}g까지 (${formatSec(v.next.startSec)})` : `물이 다 빠지면 종료 (목표 ${formatSec(plan.endSec)})`;
    nextBtn.setLabel(ended ? '저장 중…' : v.isLast ? '종료' : '다음 푸어 ›');
    nextBtn.disabled = ended;
    cancelBtn.disabled = ended;
    if (ended && finishTimer) infoText.textContent = `${endInfo} · ${Math.max(0, Math.ceil((undoStack[undoStack.length - 1].at + FINISH_MS - now) / 1000))}초 뒤 저장`;
    const undoable = canUndo(now);
    undoBtn.classList.toggle('hidden', !undoable);
    info.classList.toggle('hidden', !undoable && now > infoUntil);
  }

  function onNext() {
    if (state.status !== 'running') return;
    const now = Date.now();
    const from = state.stepIndex;
    state = advance(state, plan, now);
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
      logEvent('brew.step', { from: plan.steps[from].label, to: plan.steps[to].label, plannedSec, actualSec, deltaSec: round1(actualSec - plannedSec), verdict: vd.kind }, { brewId, now });
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
  const timerId = setInterval(tick, 200);
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
      h('tr', null, h('td', null, s.label), h('td', null, formatSec(s.actualEndSec)), h('td', { class: 'muted' }, formatSec(s.plannedEndSec)), h('td', { class: `verdict ${s.verdict?.kind ?? ''}` }, s.verdict?.text ?? '—')),
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
  if (prev.partner) lines.push(h('a', { class: 'link-action', href: `#/brew/${b.id}` }, '두 기록 1:1 비교 보기 ›'));
  return { lines, prev };
}

export function resultScreen(id) {
  const b = store.get('brews', id);
  if (!b) return h('div', { class: 'screen' }, '기록을 찾을 수 없습니다.');
  const root = h('div', { class: 'screen' });
  const save = (field, value) => {
    b.result[field] = value;
    store.put('brews', b);
    logEvent('result.update', { field, value }, { brewId: b.id });
  };

  // 서버 무게(선택): 스위치를 켜면 서버를 고르고 총 무게를 넣는다. 서버 뺀 무게 = 총 무게 − 서버 자체 무게.
  function serverBlock() {
    const r = b.result;
    const on = r.serverWeightG != null || r.server != null;
    const servers = store.list('servers');
    const sw = toggle({
      checked: on,
      label: '서버 무게 재기',
      onChange: (v) => {
        if (v) {
          // 지난번에 잰 서버, 없으면 등록한 첫 서버를 먼저 고른다
          const lastId = store.brews().find((x) => x.result?.server?.id)?.result.server.id;
          const pick = servers.find((x) => x.id === lastId) ?? servers[0];
          save('server', pick ? { id: pick.id, name: pick.name, tareG: pick.tareG } : { id: null, name: '', tareG: null });
        } else {
          save('serverWeightG', null);
          save('server', null);
        }
        draw();
      },
    });
    if (!on) return [sw];
    const sel = r.server?.id ?? '__custom__';
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
    const net = netServerWeight(r);
    return [
      sw,
      field('서버', select, servers.length ? null : h('span', null, '자주 쓰는 서버는 ', h('a', { href: '#/settings' }, '설정'), '에서 등록해 두면 다음부터 고르기만 하면 됩니다.')),
      sel === '__custom__'
        ? field('서버 자체 무게', stepper({ value: r.server?.tareG, step: 1, min: 0, max: 3000, unit: 'g', onChange: (v) => { save('server', { ...(r.server ?? { id: null, name: '' }), tareG: v }); draw(); } }))
        : null,
      field(termOf(WORDS.serverTotal), stepper({ value: r.serverWeightG, step: 1, min: 0, max: 3000, unit: 'g', onChange: (v) => { save('serverWeightG', v); draw(); } })),
      net != null
        ? h('div', { class: 'total' }, `${WORDS.netWeight.label} ${net}g`, h('span', { class: 'term-sub' }, WORDS.netWeight.sub))
        : h('div', { class: 'hint' }, `서버 무게와 총 무게를 넣으면 ${WORDS.netWeight.label}를 계산합니다.`),
    ];
  }

  function draw() {
    const { lines } = comparisonBlock(b);
    const r = b.result;
    const c = b.conditions;
    root.replaceChildren(
      h('h1', null, '추출 결과'),
      h('div', { class: 'hint' }, '자동으로 저장되었습니다. 아래를 고치면 바로 반영됩니다.'),
      section('결과', timerTable(b), h('div', { class: 'total' }, `총 ${formatSec(b.timer.totalSec)}`, h('span', { class: 'muted' }, ` (레시피 ${formatSec(b.timer.plannedTotalSec)})`)), ...lines),
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
        field(termOf(WORDS.dilution), stepper({ value: r.dilutionG, step: 1, min: 0, max: 1000, unit: 'g', onChange: (v) => save('dilutionG', v ?? 0) }), '레시피 추천값이 기본값입니다.'),
        ...serverBlock(),
      ),
      h('button', { class: 'primary big wide', onClick: () => (location.hash = `#/brew/${b.id}/survey`) }, '맛 설문하기'),
      h('button', { class: 'wide', onClick: () => (location.hash = '#/') }, '마신 뒤에 할게요'),
    );
  }
  draw();
  return root;
}
