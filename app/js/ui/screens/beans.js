// 원두 목록 · 원두 등록
// 항목은 SCA 외재적 평가 양식의 재배·가공 항목(국가·지역·생산자·품종·가공방식)을 참고했다 — 사용자 확인 예정.
// 노트 추천은 이전에 등록한 같은 산지·가공 원두에서만 가져온다(core/suggest.js).
// 9/25 사용자 요청: 이름 자동 조합(직접 적기 스위치) · 배전도 슬라이더 · 구매 무게(단위 선택) · 제조일·개봉일 ·
//   기록으로 남은 원두 추정 · 10g 이하 알림 · 「소모」 상태(목록에서 흐리게, 준비 화면 목록에서 뺀다).

import { h, fill, section, field, choiceList, tagEditor, toast, toggle, numberSlider, chips, stepper, dateStepper, today, copyText, pickOne, modal } from '../dom.js';
import { beanPrompt, readBeanText, validateBeanImport, beanPatch, applyBeanPatch } from '../../core/beanImport.js';
import { measureListItem } from '../measureImport.js';
import { store } from '../../core/store.js';
import { n2,
  createBean, beanAutoName, beanNameIsAuto, beanStock, roastedFromBestBefore, shiftMonths, formatDay,
  PROCESS_TYPES, ROAST_LEVEL, ROAST_LEVEL_TICKS, roastWordOf, roastLabel, PROFILE_SCALES, PROFILE_ITEMS, BEAN_UNITS, DEFAULT_SHELF_MONTHS, LOW_BEAN_G,
} from '../../core/schema.js';
import { DECAF_HELP } from '../../core/words.js';
import { beanFacts } from '../../core/facts.js';
import { suggestNotes } from '../../core/suggest.js';
import { logEvent } from '../../core/log.js';
import { loadDraft, saveDraft } from './brew.js';
import { icon } from '../icons.js';
import { BLEND_KINDS, MAX_PARTS, blendKind, blendAutoName, templateAutoName, createBlend, ratioPct, partsLine } from '../../core/blend.js';

// 원두 탭 위의 [원두 | 레시피 | 그라인더 | 서버] 전환 — 추출에 쓰는 «저장 항목»을 한 탭에
// (9/25 원두·레시피, 9/26 설정에서 그라인더·서버를 옮겨 네 칸 — 사용자 요청). 칸마다 아이콘 위·이름 아래.
// 각 칸은 주소(#/beans · #/recipes · #/grinders · #/servers)로 가서, 옮길 때 옆으로 넘어간다(main.js · ui/tabSlide.js).
export const SEGMENT_ITEMS = [
  ['beans', '#/beans', 'bean', '원두'],
  ['recipes', '#/recipes', 'book', '레시피'],
  ['grinders', '#/grinders', 'grinder', '그라인더'],
  ['drippers', '#/drippers', 'dripper', '드리퍼'], // 9/26 신설 — 추출 순서(갈기 → 내리기 → 받기)대로 그라인더와 서버 사이
  ['servers', '#/servers', 'server', '서버'],
];
export function beansSegment(active) {
  const seg = ([key, href, name, label]) =>
    h('a', { href, class: `seg${key === active ? ' on' : ''}`, role: 'tab', 'aria-selected': String(key === active) }, icon(name), h('span', null, label));
  return h('div', { class: 'segment', role: 'tablist', 'aria-label': SEGMENT_ITEMS.map((x) => x[3]).join(' · ') }, ...SEGMENT_ITEMS.map(seg));
}

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// 상태 바꾸기(사용 중 ↔ 소모). via = 어디서 눌렀나(home|list|form). 저장소의 원두에 상태만 바꿔 쓴다(수정 중인 다른 칸은 건드리지 않음)
export function setBeanStatus(bean, status, via) {
  const st = beanStock(bean, store.brews(), store.list('beans'));
  store.put('beans', { ...bean, status, consumedAt: status === 'consumed' ? new Date().toISOString() : null });
  logEvent('bean.status', { beanId: bean.id, status, remainingG: st.remainingG, via });
}

// 남은 원두가 10g 이하(추정)일 때의 알림 — 그 자리에서 「소모」로 바꿀 수 있다
export function lowBeanNotice(bean, brews, via) {
  const st = beanStock(bean, brews, store.list('beans'));
  return h(
    'div',
    { class: 'notice warn notice-row' },
    h('div', null, `「${bean.name}」 남은 원두 약 ${n2(Math.max(0, st.remainingG))}g(추정)`, h('span', { class: 'term-sub' }, '다 쓰셨으면 소모로 바꿔 주세요.')),
    h('button', { type: 'button', onClick: () => { setBeanStatus(bean, 'consumed', via); toast('소모로 바꿨습니다.'); rerender(); } }, '소모로 바꾸기'),
  );
}

function beanRow(b, brews) {
  const all = store.list('beans');
  const st = beanStock(b, brews, all);
  // 이름이 좁아지지 않게 날짜·남은 양은 이름 아래 줄에 두고, 오른쪽에는 상태 표시만 둔다
  const kind = blendKind(b);
  const meta = [b.roaster, kind !== 'single' ? BLEND_KINDS[kind] : null, roastLabel(b), b.decaf ? '디카페인' : null].filter(Boolean).join(' · ');
  const facts = b.status === 'consumed' ? '' : beanFacts(b, brews, Date.now(), all).join(' · ');
  return h(
    'a',
    { class: `list-row${b.status === 'consumed' ? ' inactive' : ''}`, href: `#/bean/${b.id}` },
    h('div', null, h('div', null, b.name), meta ? h('div', { class: 'hint' }, meta) : null, facts ? h('div', { class: 'hint' }, facts) : null),
    b.status === 'consumed' ? h('div', { class: 'right hint' }, '소모') : st.low ? h('div', { class: 'right badge' }, '거의 다 씀') : null,
  );
}

export function beansScreen() {
  const brews = store.brews();
  const all = store.list('beans').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const active = all.filter((b) => b.status !== 'consumed');
  const used = all.filter((b) => b.status === 'consumed');
  return h(
    'div',
    { class: 'screen' },
    beansSegment('beans'),
    h('h1', { class: 'sr-only' }, '원두'),
    h('a', { class: 'button primary wide', href: '#/bean/new' }, '＋ 원두 등록'),
    ...active.filter((b) => beanStock(b, brews, all).low).map((b) => lowBeanNotice(b, brews, 'list')),
    // 홈 「최근 기록」처럼 칸 안에 줄마다 상자(9/26 사용자 요청)
    active.length ? section('사용 중인 원두', ...active.map((b) => beanRow(b, brews))) : null,
    all.length ? null : section(null, h('div', { class: 'hint' }, '등록한 원두가 없습니다.')),
    used.length ? section('다 쓴 원두', ...used.map((b) => beanRow(b, brews))) : null,
    templatesSection(),
  );
}

// 블렌드 템플릿 목록(9/26 사용자 결정 — 추출할 때 섞는 비율은 원두와 따로 등록한다)
function templatesSection() {
  const list = store.list('blends').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const nameOf = (p) => store.get('beans', p.beanId)?.name ?? p.name;
  return section(
    '블렌드 템플릿',
    h('div', { class: 'hint' }, '추출할 때 가진 원두를 섞는 비율입니다. 추출 준비에서 고르면 원두량을 비율대로 나눠 원두마다 남은 양에서 뺍니다. 미리 섞어 담아 둔 원두는 위 원두 등록에서 「내가 섞은 블렌드」로 등록하세요.'),
    ...list.map((t) =>
      h('a', { class: 'list-row', href: `#/blend/${t.id}` }, h('div', null, h('div', null, t.name), h('div', { class: 'hint' }, partsLine(t.parts.map((p) => ({ ...p, name: nameOf(p) })), { kind: 'ratio' })))),
    ),
    h('a', { class: 'button wide', href: '#/blend/new' }, '＋ 블렌드 템플릿 등록'),
  );
}

// draft = 로스터리 설명 가져오기(AI)로 칸을 채운 뒤 다시 그릴 때 넘기는, 아직 저장하지 않은 원두
export function beanFormScreen(id, { draft = null } = {}) {
  const existing = id === 'new' ? null : store.get('beans', id);
  if (id !== 'new' && !existing) return h('div', { class: 'screen' }, '원두를 찾을 수 없습니다.');
  // 9/25 전에 등록한 원두는 nameAuto 가 없어 «직접»으로 연다(직접 적은 이름을 지킨다)
  const bean = draft ? structuredClone(draft) : existing ? { ...createBean({ id: existing.id }), ...structuredClone(existing), nameAuto: beanNameIsAuto(existing) } : createBean();
  // 새 원두는 제조일·개봉일을 오늘로 채워 둔다(사용자 요청 9/25 — 오늘에서 며칠 옮기는 것이 빠르다). 모르면 [비우기].
  // 이미 등록한 원두의 빈 날짜는 채우지 않는다 — 다른 칸만 고쳐 저장해도 날짜가 생기는 일을 막으려고(−/+ 는 오늘부터 움직인다).
  if (!existing && !draft) {
    bean.roastedOn = today();
    bean.openedOn = today();
  }
  let startStatus = bean.status;
  const others = () => store.list('beans');
  const usedProcesses = [...new Set([...PROCESS_TYPES, ...others().map((b) => b.process).filter(Boolean)])];
  // 직접 넣은 가공방식에는 어느 원두에서 왔는지 붙인다(9/26 사용자 요청 — 「? (콩볶는사람들 · 인도네시아)」, 로스터리가 길면 줄임).
  // 목록은 등록한 원두들의 값에서 만들어지므로, 그 원두의 가공방식을 고치면 목록에서도 사라진다(따로 지우는 기능은 두지 않는다).
  const short = (s, n = 8) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
  const processLabels = Object.fromEntries(
    usedProcesses.filter((p) => !PROCESS_TYPES.includes(p)).map((p) => {
      const src = others().filter((b) => (b.process ?? '').trim() === p);
      if (!src.length) return [p, p];
      const b0 = src.find((b) => b.id !== bean.id) ?? src[0];
      const where = b0.id === bean.id ? '이 원두' : [b0.roaster ? short(b0.roaster) : null, b0.country || null].filter(Boolean).join(' · ') || short(b0.name, 12);
      return [p, `${p} (${where}${src.length > 1 ? ` 외 ${src.length - 1}` : ''})`];
    }),
  );

  // 글자를 치는 칸이 초점을 잃지 않게 화면 전체를 다시 그리지 않고, 바뀌는 칸만 따로 그린다.
  const nameBox = h('div', { class: 'stack' });
  const notesBox = h('div', { class: 'stack' });
  const stockBox = h('div');
  const roastedBox = h('div', { class: 'stack' });
  const statusBox = h('div', { class: 'stack' });
  const decafBox = h('div', { class: 'stack' });
  const profileBox = h('div', { class: 'stack' });

  // 이름 자동 짓기: 싱글 오리진은 산지 항목을 잇고, 블렌드는 구성에서 짓는다(core/blend.js blendAutoName)
  const kind = blendKind(bean);
  const autoName = () => (blendKind(bean) === 'single' ? beanAutoName(bean) : blendAutoName(bean));
  const partsBox = h('div', { class: 'stack' });

  const text = (key, placeholder = '', after = null) =>
    h('input', { type: 'text', value: bean[key] ?? '', placeholder, onInput: (e) => { bean[key] = e.target.value; drawName(); after?.(); } });

  function drawName() {
    fill(
      nameBox,
      toggle({
        checked: bean.nameAuto,
        label: '자동으로 짓기',
        sub: {
          on: kind === 'roaster' ? '구성의 국가를 이어 「○·○ 블렌드」로 짓습니다.' : kind === 'me' ? '섞은 원두 이름을 « + »로 잇습니다.' : '국가·지역·생산자·품종·가공방식을 이어 붙입니다.',
          off: '이름을 직접 적습니다.',
        },
        onChange: (v) => {
          bean.nameAuto = v;
          // 직접으로 바꾸면 지금 조합을 입력칸에 채워 두고 고치게 한다
          if (!v && !bean.name) bean.name = autoName();
          drawName();
        },
      }),
      bean.nameAuto
        ? h('div', { class: 'field-value' }, autoName() || h('span', { class: 'muted' }, kind === 'single' ? '국가·지역 등을 넣으면 채워집니다' : '구성을 넣으면 채워집니다'))
        : h('input', { type: 'text', value: bean.name ?? '', placeholder: '예: 에티오피아 예가체프 첼바 G1 워시드', onInput: (e) => (bean.name = e.target.value) }),
    );
  }

  function drawNotes() {
    const sug = suggestNotes(others(), { country: bean.country, process: bean.process, excludeId: bean.id });
    // 빈 자리는 fill() 이 거른다(9/24 「null」 표시 사고)
    fill(
      notesBox,
      sug.length ? h('div', { class: 'hint' }, `같은 산지로 전에 등록한 노트: ${sug.join(', ')}`) : null,
      tagEditor({ options: sug, selected: bean.notes, onChange: (v) => (bean.notes = v), placeholder: '로스터리 표기 노트', removable: true }),
    );
  }

  // 디카페인(9/26 사용자 요청): 켜면 가공 특성 설명(설정 「보조 설명」을 따른다)과, 추출 준비의 분쇄·원두량 보조 안내가 붙는다
  function drawDecaf() {
    fill(
      decafBox,
      toggle({
        checked: bean.decaf,
        label: '디카페인 원두',
        sub: { on: '추출 준비에서 분쇄를 조금 굵게, 원두량을 조금 늘리는 안내를 보입니다.', off: '카페인을 뺀 원두면 켜 주세요.' },
        onChange: (v) => { bean.decaf = v; drawDecaf(); },
      }),
      bean.decaf ? h('ul', { class: 'hint sub-hint decaf-help' }, ...DECAF_HELP.map((t) => h('li', null, t))) : null,
    );
  }

  // 로스터리 맛 지표(9/26 사용자 요청): 로스터리가 적은 「산미 3.5 · 단맛 4」를 척도(5점·10점)와 함께. 항목을 눌러 넣고, × 로 뺀다.
  // 넣은 항목은 슬라이더를 움직여야 값이 생긴다(「선택 안 함」 — 가운데 값으로 저장하지 않는다). 값이 없는 항목은 저장하지 않는다.
  let profScale = bean.roasterProfile?.scale ?? 5;
  let profItems = (bean.roasterProfile?.items ?? []).map((it) => ({ ...it }));
  const syncProfile = () => {
    const items = profItems.filter((it) => it.value != null);
    bean.roasterProfile = items.length ? { scale: profScale, items } : null;
  };
  function drawProfile() {
    const custom = h('input', { type: 'text', placeholder: '다른 항목(예: 향미, 여운)' });
    const addItem = (label) => {
      const l = label.trim();
      if (!l || profItems.some((it) => it.label === l)) return;
      profItems.push({ label: l, value: null });
      drawProfile();
    };
    custom.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), addItem(custom.value)));
    const step = profScale === 10 ? 2 : 1;
    const ticks = Array.from({ length: profScale / step + 1 }, (_, i) => [i * step, String(i * step)]);
    fill(
      profileBox,
      h('div', { class: 'row-line' }, h('span', { class: 'hint' }, '로스터리 표기 척도'), chips({
        options: PROFILE_SCALES.map((n) => `${n}점`),
        selected: `${profScale}점`,
        onChange: (v) => {
          const n = Number.parseInt(v, 10);
          if (!n || n === profScale) return drawProfile();
          // 척도를 바꾸면 적어 둔 값을 같은 비율로 옮긴다(5점 3.5 → 10점 7)
          profItems = profItems.map((it) => ({ ...it, value: it.value == null ? null : Math.round(((it.value * n) / profScale) * 2) / 2 }));
          profScale = n;
          syncProfile();
          drawProfile();
        },
      })),
      ...profItems.map((it) =>
        numberSlider({
          label: h('div', { class: 'field-label row-line' }, it.label, h('button', { type: 'button', class: 'chip-x inline', 'aria-label': `${it.label} 빼기`, onClick: () => { profItems = profItems.filter((x) => x !== it); syncProfile(); drawProfile(); } }, h('span', { 'aria-hidden': 'true' }, '×'))),
          min: 0,
          max: profScale,
          step: 0.5,
          value: it.value,
          ticks,
          format: (v) => `${v} / ${profScale}`,
          onChange: (v) => { it.value = v; syncProfile(); },
        }),
      ),
      h('div', { class: 'chips' }, ...PROFILE_ITEMS.filter((l) => !profItems.some((it) => it.label === l)).map((l) => h('button', { type: 'button', class: 'chip', onClick: () => addItem(l) }, `＋ ${l}`))),
      h('div', { class: 'row' }, custom, h('button', { type: 'button', onClick: () => addItem(custom.value) }, '추가')),
      h('div', { class: 'hint sub-hint' }, '별·점으로 표기했으면 개수를 적습니다(★★★☆☆ → 3). 「약·중·강」 같은 말이면 5점에서 1·3·5 로 옮겨 적어 주세요.'),
    );
  }

  // 남은 원두(추정) = 구매 무게 − 이 원두 기록들의 원두량 합
  function drawStock() {
    const st = beanStock(bean, store.brews(), store.list('beans'));
    fill(
      stockBox,
      st.totalG == null
        ? h('div', { class: 'hint' }, '구매 무게를 넣으면 기록으로 남은 원두를 셉니다.')
        : h(
            'div',
            { class: st.low ? 'notice warn' : 'hint' },
            // 미리 섞은 블렌드에 넣은 무게는 «섞음»으로 뺀다(9/26)
            `${kind === 'me' ? '섞은 무게' : '구매'} ${n2(st.totalG)}g − 기록 ${st.brews}건 ${n2(st.usedG)}g${st.mixedG ? ` − 섞음 ${n2(st.mixedG)}g` : ''} = 남은 약 ${n2(Math.max(0, st.remainingG))}g(추정)`,
            st.low ? h('span', { class: 'term-sub' }, `${LOW_BEAN_G}g 이하입니다. 다 쓰셨으면 아래 상태를 「소모」로 바꿔 주세요.`) : null,
          ),
    );
  }

  const unitSelect = h(
    'select',
    { class: 'unit', onChange: (e) => { if (bean.purchased) bean.purchased = { ...bean.purchased, unit: e.target.value }; drawStock(); } },
    ...Object.entries(BEAN_UNITS).map(([k, u]) => h('option', { value: k, selected: (bean.purchased?.unit ?? 'g') === k }, u.label)),
  );
  const amountInput = h('input', {
    type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: bean.purchased?.amount ?? '', placeholder: '예: 200',
    onInput: (e) => {
      const v = e.target.value === '' ? null : Number(e.target.value);
      bean.purchased = v == null ? null : { amount: v, unit: unitSelect.value };
      drawStock();
    },
  });

  // 제조일(로스팅일). 봉투에 소비기한만 있으면 거꾸로 센다 — 기간은 로스터리마다 달라 결과는 «추정»이다.
  // 소비기한 칸의 처음 값 = 오늘 + 기간(오늘 볶았다면 찍혔을 날짜) — 거기서 봉투 날짜로 옮긴다.
  let shelfMonths = bean.roastedOnFrom?.months ?? DEFAULT_SHELF_MONTHS;
  let bestBefore = bean.roastedOnFrom?.bestBefore ?? shiftMonths(today(), shelfMonths);
  function drawRoasted() {
    const est = h('div', { class: 'hint' }, bean.roastedOnFrom ? `소비기한 ${bean.roastedOnFrom.bestBefore}에서 ${bean.roastedOnFrom.months}개월을 뺀 추정값입니다.` : '');
    est.classList.toggle('hidden', !bean.roastedOnFrom);
    fill(
      roastedBox,
      dateStepper({ value: bean.roastedOn, onChange: (v) => { bean.roastedOn = v; bean.roastedOnFrom = null; est.classList.add('hidden'); } }),
      est,
      h(
        'details',
        { class: 'sub-details', open: Boolean(bean.roastedOnFrom) },
        h('summary', null, '봉투에 소비기한만 있으면'),
        field('소비기한', dateStepper({ value: bestBefore, clearable: false, onChange: (v) => (bestBefore = v) })),
        field(
          '소비기한까지 기간',
          stepper({ value: shelfMonths, step: 1, min: 1, max: 36, unit: '개월', onChange: (v) => (shelfMonths = v ?? DEFAULT_SHELF_MONTHS) }),
          '로스터리마다 6개월~2년으로 달라, 처음 값 12개월은 흔한 값일 뿐입니다. 봉투나 로스터리 안내에 기간이 있으면 그 값으로 바꾸세요.',
        ),
        h('button', {
          type: 'button',
          onClick: () => {
            const r = roastedFromBestBefore(bestBefore, shelfMonths);
            if (!r) return toast('소비기한 날짜를 넣어 주세요.');
            bean.roastedOn = r;
            bean.roastedOnFrom = { bestBefore, months: shelfMonths };
            drawRoasted();
          },
        }, '제조일 계산'),
      ),
    );
  }

  // 상태(사용자 요청 9/25): 수정 화면에서 언제든 [소모로 바꾸기]·[사용 중으로 복구] — 눈에 띄지 않는 작은 버튼. 누르면 바로 저장된다.
  // 홈·원두 목록의 10g 이하 알림과 [소모로 바꾸기]는 그대로 있다. 새 원두는 저장한 뒤에 바꿀 수 있다.
  function drawStatus() {
    if (!existing) return fill(statusBox);
    const consumed = bean.status === 'consumed';
    const when = consumed && bean.consumedAt ? ` · ${formatDay(new Date(bean.consumedAt))}` : '';
    fill(
      statusBox,
      h(
        'div',
        { class: 'row-line' },
        h('span', null, consumed ? `소모한 원두${when}` : '사용 중'),
        h('button', {
          type: 'button',
          class: 'inline-btn quiet',
          onClick: () => {
            const next = consumed ? 'active' : 'consumed';
            setBeanStatus(store.get('beans', bean.id) ?? bean, next, 'form');
            bean.status = next;
            bean.consumedAt = store.get('beans', bean.id)?.consumedAt ?? null;
            startStatus = next; // 저장할 때 같은 변경을 한 번 더 남기지 않게
            toast(consumed ? '사용 중으로 되돌렸습니다.' : '소모로 바꿨습니다.');
            drawStatus();
            drawStock();
          },
        }, consumed ? '사용 중으로 복구' : '소모로 바꾸기'),
      ),
      h('div', { class: 'hint' }, consumed ? '추출 준비의 원두 목록에서 빠져 있습니다. 복구하면 다시 나옵니다.' : '다 쓴 원두는 소모로 바꾸면 목록에서 흐리게 보이고, 추출 준비의 원두 목록에서 빠집니다.'),
    );
  }

  // 로스터리 설명으로 채우기(AI, 9/26 사용자 결정): 프롬프트 복사 → 캡처와 함께 AI 에 → 답 붙여 넣기 → 칸마다 골라 채우기.
  // 채운 뒤 화면을 새로 그린다(아직 저장 전 — 원두 [저장]을 눌러야 저장된다). 이미 적은 칸과 다른 값은 처음에 체크하지 않는다.
  const aiBox = h('div', { class: 'stack' });
  const aiPaste = h('textarea', { rows: 3, placeholder: 'AI 답(JSON)을 여기에 붙여 넣기' });
  const aiFile = h('input', { type: 'file', accept: 'application/json,.json,.txt,text/plain', class: 'hidden' });
  async function aiLoad(via) {
    let raw;
    let fixes = [];
    try {
      const text = via === 'file' ? await aiFile.files[0].text() : aiPaste.value;
      aiFile.value = '';
      ({ raw, fixes } = readBeanText(text));
    } catch (e) {
      logEvent('bean.aiImportFail', { beanId: bean.id, stage: 'read', via, message: e.message });
      return fill(aiBox, h('div', { class: 'notice error' }, e.message));
    }
    const { value, errors, warnings } = validateBeanImport(raw);
    if (errors.length || !value) {
      logEvent('bean.aiImportFail', { beanId: bean.id, stage: 'check', via, errors });
      return fill(aiBox, h('div', { class: 'notice error' }, '확인이 필요합니다', h('ul', null, ...errors.map((x) => h('li', null, x)))));
    }
    const rows = beanPatch(bean, value);
    const picked = new Set(rows.filter((r) => !r.same && !r.conflict).map((r) => r.key));
    fill(
      aiBox,
      [...fixes, ...warnings].length ? h('div', { class: 'notice' }, '고쳐 읽은 곳', h('ul', null, ...[...fixes, ...warnings].map((x) => h('li', null, x)))) : null,
      value.uncertain.length ? h('div', { class: 'notice warn' }, 'AI 가 자신 없다고 한 칸', h('ul', null, ...value.uncertain.map((x) => h('li', null, x)))) : null,
      rows.length
        ? h(
            'div',
            { class: 'stack' },
            ...rows.map((r) => {
              const box = h('input', { type: 'checkbox', checked: picked.has(r.key), disabled: r.same });
              box.addEventListener('change', () => (box.checked ? picked.add(r.key) : picked.delete(r.key)));
              return h('label', { class: `list-row pick-row${r.conflict ? ' conflict' : ''}` }, box, h('div', { class: 'grow' }, h('div', null, r.label), h('div', { class: 'hint' }, r.same ? `같음: ${r.to}` : r.from ? `지금 ${r.from} → ${r.to}${r.key === 'notes' ? '(더하기)' : ''}` : r.to)));
            }),
            h('button', {
              type: 'button',
              class: 'primary wide',
              onClick: () => {
                applyBeanPatch(bean, value, [...picked]);
                logEvent('bean.aiImport', { beanId: bean.id, via, fields: [...picked], skipped: rows.filter((r) => !picked.has(r.key)).map((r) => r.key), uncertain: value.uncertain.length, warnings: warnings.length, fixes: fixes.length });
                toast('칸을 채웠습니다. 확인한 뒤 [저장]을 눌러 주세요.');
                screen.replaceWith(beanFormScreen(id, { draft: bean }));
              },
            }, '고른 칸 채우기'),
          )
        : h('div', { class: 'hint' }, '채울 값이 없습니다.'),
    );
  }
  aiFile.addEventListener('change', () => aiFile.files[0] && aiLoad('file'));
  const aiSection = h(
    'details',
    { class: 'card ai-bean' },
    h('summary', null, '로스터리 설명으로 채우기(AI)'),
    h(
      'ol',
      { class: 'guide' },
      h('li', null, '[프롬프트 복사]를 누르고, AI 앱(ChatGPT·Gemini·Claude)에 로스터리 상세 페이지·봉투 캡처와 함께 붙여 넣어 보냅니다.'),
      h('li', null, 'AI 답(JSON)을 아래 칸에 붙여 넣고 [확인하기]를 누릅니다(파일로 받았으면 [파일에서 불러오기]).'),
      h('li', null, '채울 칸을 고르고 [고른 칸 채우기] → 확인한 뒤 [저장].'),
    ),
    h('button', {
      type: 'button',
      class: 'wide',
      onClick: async () => {
        const ok = await copyText(beanPrompt());
        logEvent('bean.aiPromptCopy', { beanId: bean.id, ok });
        toast(ok ? '프롬프트를 복사했습니다. 캡처와 함께 AI 앱에 보내 주세요.' : '복사하지 못했습니다.');
      },
    }, '프롬프트 복사'),
    aiPaste,
    h('div', { class: 'row wrap' }, h('button', { type: 'button', onClick: () => aiLoad('paste') }, '확인하기'), h('button', { type: 'button', onClick: () => aiFile.click() }, '파일에서 불러오기'), aiFile),
    aiBox,
  );

  // 이전 원두 내용 가져오기(9/26 사용자 요청 — 같은 원두를 다시 샀을 때). 새 원두 등록에서만.
  // 원두 자체의 정보만 옮긴다: 이름·로스터리·산지·가공·배전도·디카페인·노트·로스터리 맛 지표.
  // 봉투마다 다른 것(구매 무게·제조일·개봉일·상태)과 메모(원두별로 따로 — 9/26 사용자 확인)·분쇄 측정(원두별)은 옮기지 않는다.
  const COPY_KEYS = ['name', 'nameAuto', 'roaster', 'country', 'region', 'producer', 'variety', 'process', 'blend', 'roast', 'roastLevel', 'roastLevelFrom', 'decaf', 'notes', 'roasterProfile'];
  async function copyFromPrevious() {
    const list = store.list('beans').sort((a, b) => (b.roastedOn ?? b.updatedAt ?? '').localeCompare(a.roastedOn ?? a.updatedAt ?? ''));
    const r = await pickOne({
      title: '어느 원두의 내용을 가져올까요?',
      hint: '같은 원두를 다시 샀을 때 씁니다. 구매 무게·날짜·메모는 새로 적습니다.',
      items: list.map((b) => ({ value: b, label: b.name, sub: [b.roaster, b.roastedOn ? `제조 ${b.roastedOn}` : null, b.status === 'consumed' ? '소모' : null].filter(Boolean).join(' · '), inactive: b.status === 'consumed' })),
      emptyText: '등록한 원두가 없습니다.',
    });
    if (!r?.value) return;
    const src = r.value;
    for (const k of COPY_KEYS) if (src[k] !== undefined) bean[k] = structuredClone(src[k]);
    bean.nameAuto = beanNameIsAuto(src);
    logEvent('bean.copyFrom', { fromId: src.id, fromName: src.name, fields: COPY_KEYS.filter((k) => src[k] != null && src[k] !== '') });
    toast('이전 원두 내용을 채웠습니다. 날짜·구매 무게를 확인한 뒤 [저장]을 눌러 주세요.');
    screen.replaceWith(beanFormScreen(id, { draft: bean }));
  }

  // 원두 종류(9/26 사용자 요청 — 블렌드). 바꾸면 칸 구성이 달라져 화면을 다시 그린다(저장 전 값은 그대로 넘긴다).
  const kindChips = chips({
    options: Object.values(BLEND_KINDS),
    selected: BLEND_KINDS[kind],
    onChange: (label) => {
      const next = Object.keys(BLEND_KINDS).find((k) => BLEND_KINDS[k] === label) ?? kind;
      if (next !== kind) {
        const blank = { country: '', region: '', variety: '', process: '', pct: null };
        if (next === 'single') bean.blend = null;
        // 싱글에서 로스터리 블렌드로: 적어 둔 산지를 첫 줄로 옮겨 둔다
        else if (next === 'roaster') bean.blend = { by: 'roaster', parts: [{ ...blank, country: bean.country ?? '', region: bean.region ?? '', variety: bean.variety ?? '', process: bean.process ?? '' }, { ...blank }] };
        // 내가 섞은 블렌드: 제조일은 원두마다 달라 비운다(섞은 날 = 개봉일 칸)
        else Object.assign(bean, { blend: { by: 'me', parts: [{ beanId: null, name: '', g: null }, { beanId: null, name: '', g: null }] }, roastedOn: null, roastedOnFrom: null });
      }
      screen.replaceWith(beanFormScreen(id, { draft: bean }));
    },
  });

  // 블렌드 구성(9/26). 로스터리 블렌드 = 산지별 줄(국가·지역·품종·가공방식·비율%), 내가 섞은 블렌드 = 가진 원두와 섞은 무게.
  // 줄을 더하고 뺄 때만 이 칸을 다시 그린다(값을 치는 동안은 다시 그리지 않아 초점을 지킨다).
  const mixHints = [];
  function drawMixHints() {
    // 섞은 뒤 남은 양: 저장된 이 블렌드 대신 지금 적는 구성으로 센다
    const beans = [...store.list('beans').filter((x) => x.id !== bean.id), bean];
    for (const [p, span] of mixHints) {
      const b = p.beanId ? store.get('beans', p.beanId) : null;
      const st = b ? beanStock(b, store.brews(), beans) : null;
      span.textContent = st?.remainingG == null ? '' : st.remainingG < 0 ? `섞은 뒤 약 ${n2(st.remainingG)}g — 모자랍니다` : `섞은 뒤 남은 약 ${n2(st.remainingG)}g`;
      span.className = st?.remainingG != null && st.remainingG < 0 ? 'warn-text' : 'hint';
    }
  }
  function drawParts() {
    if (kind === 'single') return;
    const parts = bean.blend.parts;
    const remove = (i) =>
      parts.length > 1
        ? h('button', { type: 'button', class: 'chip-x inline', 'aria-label': '이 줄 빼기', onClick: () => { parts.splice(i, 1); drawName(); drawParts(); drawStock(); } }, h('span', { 'aria-hidden': 'true' }, '×'))
        : null;
    mixHints.length = 0;
    const rows = parts.map((p, i) => {
      if (kind === 'roaster') {
        const inp = (k, ph) => h('input', { type: 'text', value: p[k] ?? '', placeholder: ph, onInput: (e) => { p[k] = e.target.value; drawName(); } });
        return h(
          'div',
          { class: 'blend-row' },
          h('div', { class: 'row-line' }, h('span', { class: 'field-label' }, `구성 ${i + 1}`), remove(i)),
          h('div', { class: 'row' }, inp('country', '국가'), inp('region', '지역')),
          h('div', { class: 'row' }, inp('variety', '품종'), inp('process', '가공방식')),
          h('div', { class: 'row amount' }, h('input', { type: 'number', inputmode: 'decimal', min: 0, max: 100, step: 'any', value: p.pct ?? '', placeholder: '비율(모르면 비움)', onInput: (e) => (p.pct = e.target.value === '' ? null : Number(e.target.value)) }), h('span', { class: 'unit' }, '%')),
        );
      }
      // 섞을 수 있는 원두: 이 원두·다른 «내가 섞은 블렌드»는 빼고(섞은 것을 또 섞으면 남은 양 셈이 꼬인다), 다 쓴 원두는 이미 고른 것만
      const options = store.list('beans').filter((b) => b.id !== bean.id && blendKind(b) !== 'me' && (b.status !== 'consumed' || b.id === p.beanId)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      const hint = h('span', { class: 'hint' });
      mixHints.push([p, hint]);
      return h(
        'div',
        { class: 'blend-row' },
        h('div', { class: 'row-line' }, h('span', { class: 'field-label' }, `원두 ${i + 1}`), remove(i)),
        h('select', { onChange: (e) => { const b = store.get('beans', e.target.value); p.beanId = b?.id ?? null; p.name = b?.name ?? ''; drawName(); drawMixHints(); } },
          h('option', { value: '', selected: !p.beanId }, '원두 고르기'),
          ...options.map((b) => h('option', { value: b.id, selected: b.id === p.beanId }, b.name))),
        h('div', { class: 'row amount' }, h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: p.g ?? '', placeholder: '섞은 무게', onInput: (e) => { p.g = e.target.value === '' ? null : Number(e.target.value); drawStock(); drawMixHints(); } }), h('span', { class: 'unit' }, 'g')),
        hint,
      );
    });
    fill(
      partsBox,
      ...rows,
      parts.length < MAX_PARTS
        ? h('button', { type: 'button', class: 'inline-btn', onClick: () => { parts.push(kind === 'roaster' ? { country: '', region: '', variety: '', process: '', pct: null } : { beanId: null, name: '', g: null }); drawParts(); } }, kind === 'roaster' ? '＋ 산지 더하기' : '＋ 원두 더하기')
        : null,
    );
    drawMixHints();
  }

  // 이 원두의 분쇄 측정(9/26 — 원두별로 모은다). 올리기는 추출 준비·결과·그라인더 화면에서.
  const measures = existing ? store.list('measurements').filter((m) => m.beanId === bean.id).sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? '')) : [];

  function save() {
    // 블렌드 구성(9/26): 빈 줄은 뺀다. 내가 섞은 블렌드는 원두·무게가 있는 줄만, 로스터리 블렌드는 산지 정보가 하나라도 있는 줄만.
    if (kind === 'me') {
      const parts = bean.blend.parts.filter((p) => p.beanId && Number(p.g) > 0);
      if (!parts.length) return toast('섞은 원두와 무게를 하나 이상 넣어 주세요.');
      if (new Set(parts.map((p) => p.beanId)).size !== parts.length) return toast('같은 원두가 두 줄에 있습니다. 한 줄로 합쳐 주세요.');
      bean.blend = { by: 'me', parts };
      bean.purchased = null; // 양 = 섞은 무게 합(core/schema.js beanStock)
    } else if (kind === 'roaster') {
      const parts = bean.blend.parts.filter((p) => ['country', 'region', 'variety', 'process'].some((k) => (p[k] ?? '').trim()));
      if (!parts.length) return toast('블렌드 구성(국가 등)을 하나 이상 넣어 주세요.');
      bean.blend = { by: 'roaster', parts };
    } else bean.blend = null;
    // 블렌드면 싱글 오리진 산지 칸은 비운다(숨긴 칸의 옛 값이 공유 글에 섞여 나가지 않게)
    if (kind !== 'single') Object.assign(bean, { country: '', region: '', producer: '', variety: '', process: '' });
    bean.name = (bean.nameAuto ? autoName() : bean.name ?? '').trim();
    if (!bean.name) return toast(bean.nameAuto ? (kind === 'single' ? '국가·지역 같은 항목을 넣거나, 이름을 직접 적어 주세요.' : '구성을 넣거나, 이름을 직접 적어 주세요.') : '원두 이름을 넣어 주세요.');
    if (bean.status !== startStatus) bean.consumedAt = bean.status === 'consumed' ? new Date().toISOString() : null;
    store.put('beans', bean);
    const st = beanStock(bean, store.brews(), store.list('beans'));
    logEvent('bean.save', { beanId: bean.id, name: bean.name, nameAuto: bean.nameAuto, status: bean.status, totalG: st.totalG, remainingG: st.remainingG, kind, parts: bean.blend?.parts.length ?? 0 });
    if (existing && bean.status !== startStatus) logEvent('bean.status', { beanId: bean.id, status: bean.status, remainingG: st.remainingG, via: 'form' });
    // 준비 화면에서 등록하러 왔으면 방금 등록한 원두를 골라 두고 돌아간다
    if (sessionStorage.getItem('nb.returnTo') === '#/prep') {
      sessionStorage.removeItem('nb.returnTo');
      const d = loadDraft();
      if (d) saveDraft({ ...d, beanId: bean.status === 'consumed' ? d.beanId : bean.id, beanName: '' });
      location.hash = '#/prep';
    } else {
      location.hash = '#/beans';
    }
  }

  drawName();
  drawNotes();
  drawStock();
  drawRoasted();
  drawStatus();
  drawDecaf();
  drawProfile();
  drawParts();
  // 9/26 전 원두: 단어만 있고 숫자가 없으면 그 단어를 알린다(숫자를 지어 채우지 않는다). 슬라이더를 만지면 숨는다.
  const oldRoast = bean.roastLevel == null && bean.roast ? h('div', { class: 'hint' }, `지금 값: ${bean.roast}(숫자 없이 적은 옛 값). 슬라이더로 고르면 숫자로 바뀝니다.`) : null;
  const screen = h(
    'div',
    { class: 'screen' },
    h('h1', null, existing ? '원두 수정' : '원두 등록'),
    existing || !store.list('beans').length ? null : h('button', { type: 'button', class: 'wide', onClick: copyFromPrevious }, '이전 원두 내용 가져오기'),
    aiSection,
    section(
      null,
      field('종류', kindChips),
      field('이름 *', nameBox),
      kind === 'me' ? null : field('로스터리', text('roaster')),
      ...(kind === 'single'
        ? [
            field('국가', text('country', '예: 에티오피아', drawNotes)),
            field('지역', text('region', '예: 예가체프')),
            field('농장·생산자', text('producer')),
            field('품종', text('variety')),
            field('가공방식', choiceList({ options: usedProcesses, labels: processLabels, value: bean.process || null, onChange: (v) => { bean.process = v; drawName(); drawNotes(); } })),
          ]
        : [
            field(
              kind === 'roaster' ? '블렌드 구성' : '섞은 원두',
              partsBox,
              kind === 'roaster' ? '로스터리가 적은 산지별 구성입니다. 비율을 모르면 비워 두세요.' : '미리 섞어 담아 둔 원두입니다. 섞은 무게만큼 그 원두들의 남은 양에서 빼고, 이 블렌드는 섞은 무게 합을 양으로 갖습니다.',
            ),
          ]),
      // 배전도(선택, 9/26 — 0.5 단위 0.5~10): 다음 추출 제안에서 강배전(8.5 이상)의 쓴맛을 한 단계 낮춰 본다(core/compass.js)
      h(
        'div',
        { class: 'field' },
        numberSlider({
          label: h('div', { class: 'field-label' }, '배전도'),
          ...ROAST_LEVEL,
          value: bean.roastLevel,
          ticks: ROAST_LEVEL_TICKS,
          format: (v) => `${v} · ${roastWordOf(v)}`,
          onChange: (v) => {
            bean.roastLevel = v;
            bean.roast = v == null ? '' : roastWordOf(v);
            oldRoast?.classList.add('hidden');
          },
        }),
        oldRoast,
        // 설정 「보조 설명」을 끄면 숨는다(9/26 사용자 요청)
        h('div', { class: 'hint sub-hint' }, '「다크 로스트」는 강배전과 같은 말입니다.'),
      ),
      decafBox,
      field('노트', notesBox),
      field('로스터리 맛 지표', profileBox),
    ),
    section(
      '보관',
      kind === 'me' ? null : field('구매 무게', h('div', { class: 'row amount' }, amountInput, unitSelect)),
      stockBox,
      kind === 'me' ? null : field('제조일(로스팅일)', roastedBox),
      field(kind === 'me' ? '섞은 날' : '개봉일', dateStepper({ value: bean.openedOn, onChange: (v) => (bean.openedOn = v) })),
      existing ? field('상태', statusBox) : null,
    ),
    measures.length ? section('분쇄 측정', h('div', { class: 'hint' }, '이 원두로 잰 측정입니다(원두마다 같은 클릭에서도 분쇄가 달라 원두별로 모읍니다).'), ...measures.map((m) => measureListItem(m))) : null,
    section(null, field('메모', h('textarea', { rows: 2, value: bean.memo ?? '', onInput: (e) => (bean.memo = e.target.value) }))),
    h('button', { class: 'primary big wide', onClick: save }, '저장'),
  );
  return screen;
}

// 블렌드 템플릿 등록·수정(9/26 사용자 결정 — 추출 직전에 섞는 것은 «비율»만 따로 등록하고, 추출 준비에서 고르면 원두량을 비율대로 나눈다.
// 미리 섞어 담아 둔 원두는 원두 등록의 「내가 섞은 블렌드」). 비율은 합이 100 이 아니어도 된다(2 : 1 처럼).
export function blendFormScreen(id) {
  const existing = id === 'new' ? null : store.get('blends', id);
  if (id !== 'new' && !existing) return h('div', { class: 'screen' }, '블렌드 템플릿을 찾을 수 없습니다.');
  const t = existing ? structuredClone(existing) : createBlend({ parts: [{ beanId: null, name: '', ratio: 1 }, { beanId: null, name: '', ratio: 1 }] });
  const nameBox = h('div', { class: 'stack' });
  const partsBox = h('div', { class: 'stack' });
  const pctSpans = [];
  const drawPct = () => pctSpans.forEach(([p, span]) => (span.textContent = ratioPct(t.parts.filter((x) => x.beanId), p) != null && p.beanId ? `${ratioPct(t.parts.filter((x) => x.beanId), p)}%` : ''));

  function drawName() {
    fill(
      nameBox,
      toggle({
        checked: t.nameAuto,
        label: '자동으로 짓기',
        sub: { on: '섞는 원두 이름을 « + »로 잇습니다.', off: '이름을 직접 적습니다.' },
        onChange: (v) => {
          t.nameAuto = v;
          if (!v && !t.name) t.name = templateAutoName(t);
          drawName();
        },
      }),
      t.nameAuto
        ? h('div', { class: 'field-value' }, templateAutoName(t) || h('span', { class: 'muted' }, '원두를 고르면 채워집니다'))
        : h('input', { type: 'text', value: t.name ?? '', placeholder: '예: 아침 블렌드', onInput: (e) => (t.name = e.target.value) }),
    );
  }

  function drawParts() {
    pctSpans.length = 0;
    // 다 쓴 원두는 이미 고른 것만 보인다. 미리 섞은 블렌드도 원두로 고를 수 있다(병에서 덜어 섞는 경우).
    const options = (p) => store.list('beans').filter((b) => b.status !== 'consumed' || b.id === p.beanId).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    fill(
      partsBox,
      ...t.parts.map((p, i) => {
        const pct = h('span', { class: 'hint' });
        pctSpans.push([p, pct]);
        return h(
          'div',
          { class: 'blend-row' },
          h('div', { class: 'row-line' }, h('span', { class: 'field-label' }, `원두 ${i + 1}`),
            t.parts.length > 1 ? h('button', { type: 'button', class: 'chip-x inline', 'aria-label': '이 줄 빼기', onClick: () => { t.parts.splice(i, 1); drawName(); drawParts(); } }, h('span', { 'aria-hidden': 'true' }, '×')) : null),
          h('select', { onChange: (e) => { const b = store.get('beans', e.target.value); p.beanId = b?.id ?? null; p.name = b?.name ?? ''; drawName(); drawPct(); } },
            h('option', { value: '', selected: !p.beanId }, '원두 고르기'),
            ...options(p).map((b) => h('option', { value: b.id, selected: b.id === p.beanId }, b.name))),
          h('div', { class: 'row amount' }, h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: p.ratio ?? '', placeholder: '비율', onInput: (e) => { p.ratio = e.target.value === '' ? null : Number(e.target.value); drawPct(); } }), h('span', { class: 'unit' }, '비율'), pct),
        );
      }),
      t.parts.length < MAX_PARTS ? h('button', { type: 'button', class: 'inline-btn', onClick: () => { t.parts.push({ beanId: null, name: '', ratio: 1 }); drawParts(); } }, '＋ 원두 더하기') : null,
    );
    drawPct();
  }

  function save() {
    const parts = t.parts.filter((p) => p.beanId && Number(p.ratio) > 0).map((p) => ({ beanId: p.beanId, name: store.get('beans', p.beanId)?.name ?? p.name, ratio: Number(p.ratio) }));
    if (parts.length < 2) return toast('원두를 둘 이상 고르고 비율을 넣어 주세요.');
    if (new Set(parts.map((p) => p.beanId)).size !== parts.length) return toast('같은 원두가 두 줄에 있습니다. 한 줄로 합쳐 주세요.');
    t.parts = parts;
    t.name = (t.nameAuto ? templateAutoName(t) : t.name ?? '').trim();
    if (!t.name) return toast('이름을 넣어 주세요.');
    store.put('blends', t);
    logEvent('blend.save', { blendId: t.id, name: t.name, parts: parts.map((p) => ({ beanId: p.beanId, ratio: p.ratio })) });
    back(t.id);
  }
  // 준비 화면에서 왔으면 이 템플릿을 골라 두고 돌아간다(지웠으면 고른 것을 푼다)
  function back(pickId) {
    if (sessionStorage.getItem('nb.returnTo') === '#/prep') {
      sessionStorage.removeItem('nb.returnTo');
      const d = loadDraft();
      if (d) saveDraft(pickId ? { ...d, blendId: pickId, beanId: null, beanName: '' } : d.blendId === t.id ? { ...d, blendId: null } : d);
      location.hash = '#/prep';
    } else location.hash = '#/beans';
  }
  async function remove() {
    const used = store.brews().filter((b) => b.bean?.blendId === t.id).length;
    const k = await modal({
      title: '블렌드 템플릿을 지울까요?',
      body: used ? `이 템플릿으로 섞은 기록 ${used}건은 그대로 남습니다(그때 이름·원두별 무게 그대로).` : '템플릿만 지웁니다.',
      actions: [{ key: 'no', label: '닫기' }, { key: 'yes', label: '지우기', primary: true }],
    });
    if (k !== 'yes') return;
    store.remove('blends', t.id);
    logEvent('blend.delete', { blendId: t.id, name: t.name, brews: used });
    toast('지웠습니다.');
    back(null);
  }

  drawName();
  drawParts();
  return h(
    'div',
    { class: 'screen' },
    h('h1', null, existing ? '블렌드 템플릿 수정' : '블렌드 템플릿 등록'),
    h('div', { class: 'hint' }, '추출할 때 가진 원두를 이 비율로 섞습니다. 추출 준비에서 고르면 원두량을 비율대로 나눠 원두마다 남은 양에서 뺍니다.'),
    section(null, field('이름 *', nameBox), field('섞는 원두와 비율', partsBox, '예: 2 : 1 이면 원두 18g 을 12g · 6g 으로 나눕니다.')),
    section(null, field('메모', h('textarea', { rows: 2, value: t.memo ?? '', onInput: (e) => (t.memo = e.target.value) }))),
    h('button', { class: 'primary big wide', onClick: save }, '저장'),
    existing ? h('button', { type: 'button', class: 'wide quiet', onClick: remove }, '템플릿 지우기') : null,
  );
}
