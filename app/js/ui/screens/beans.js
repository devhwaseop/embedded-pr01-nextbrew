// 원두 목록 · 원두 등록
// 항목은 SCA 외재적 평가 양식의 재배·가공 항목(국가·지역·생산자·품종·가공방식)을 참고했다 — 사용자 확인 예정.
// 노트 추천은 이전에 등록한 같은 산지·가공 원두에서만 가져온다(core/suggest.js).
// 9/25 사용자 요청: 이름 자동 조합(직접 적기 스위치) · 배전도 슬라이더 · 구매 무게(단위 선택) · 제조일·개봉일 ·
//   기록으로 남은 원두 추정 · 10g 이하 알림 · 「소모」 상태(목록에서 흐리게, 준비 화면 목록에서 뺀다).

import { h, fill, section, field, choiceList, tagEditor, toast, toggle, numberSlider, chips, stepper, dateStepper, today } from '../dom.js';
import { store } from '../../core/store.js';
import {
  createBean, beanAutoName, beanNameIsAuto, beanStock, roastedFromBestBefore, shiftMonths, formatDay,
  PROCESS_TYPES, ROAST_LEVEL, ROAST_LEVEL_TICKS, roastWordOf, roastLabel, PROFILE_SCALES, PROFILE_ITEMS, BEAN_UNITS, DEFAULT_SHELF_MONTHS, LOW_BEAN_G,
} from '../../core/schema.js';
import { DECAF_HELP } from '../../core/words.js';
import { beanFacts } from '../../core/facts.js';
import { suggestNotes } from '../../core/suggest.js';
import { logEvent } from '../../core/log.js';
import { loadDraft, saveDraft } from './brew.js';
import { icon } from '../icons.js';

// 원두 탭 위의 [원두 | 레시피 | 그라인더 | 서버] 전환 — 추출에 쓰는 «저장 항목»을 한 탭에
// (9/25 원두·레시피, 9/26 설정에서 그라인더·서버를 옮겨 네 칸 — 사용자 요청). 칸마다 아이콘 위·이름 아래.
// 각 칸은 주소(#/beans · #/recipes · #/grinders · #/servers)로 가서, 옮길 때 옆으로 넘어간다(main.js · ui/tabSlide.js).
export const SEGMENT_ITEMS = [
  ['beans', '#/beans', 'bean', '원두'],
  ['recipes', '#/recipes', 'book', '레시피'],
  ['grinders', '#/grinders', 'grinder', '그라인더'],
  ['servers', '#/servers', 'beaker', '서버'],
];
export function beansSegment(active) {
  const seg = ([key, href, name, label]) =>
    h('a', { href, class: `seg${key === active ? ' on' : ''}`, role: 'tab', 'aria-selected': String(key === active) }, icon(name), h('span', null, label));
  return h('div', { class: 'segment', role: 'tablist', 'aria-label': '원두 · 레시피 · 그라인더 · 서버' }, ...SEGMENT_ITEMS.map(seg));
}

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// 상태 바꾸기(사용 중 ↔ 소모). via = 어디서 눌렀나(home|list|form). 저장소의 원두에 상태만 바꿔 쓴다(수정 중인 다른 칸은 건드리지 않음)
export function setBeanStatus(bean, status, via) {
  const st = beanStock(bean, store.brews());
  store.put('beans', { ...bean, status, consumedAt: status === 'consumed' ? new Date().toISOString() : null });
  logEvent('bean.status', { beanId: bean.id, status, remainingG: st.remainingG, via });
}

// 남은 원두가 10g 이하(추정)일 때의 알림 — 그 자리에서 「소모」로 바꿀 수 있다
export function lowBeanNotice(bean, brews, via) {
  const st = beanStock(bean, brews);
  return h(
    'div',
    { class: 'notice warn notice-row' },
    h('div', null, `「${bean.name}」 남은 원두 약 ${Math.max(0, st.remainingG)}g(추정)`, h('span', { class: 'term-sub' }, '다 쓰셨으면 소모로 바꿔 주세요.')),
    h('button', { type: 'button', onClick: () => { setBeanStatus(bean, 'consumed', via); toast('소모로 바꿨습니다.'); rerender(); } }, '소모로 바꾸기'),
  );
}

function beanRow(b, brews) {
  const st = beanStock(b, brews);
  // 이름이 좁아지지 않게 날짜·남은 양은 이름 아래 줄에 두고, 오른쪽에는 상태 표시만 둔다
  const meta = [b.roaster, roastLabel(b), b.decaf ? '디카페인' : null].filter(Boolean).join(' · ');
  const facts = b.status === 'consumed' ? '' : beanFacts(b, brews).join(' · ');
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
    ...active.filter((b) => beanStock(b, brews).low).map((b) => lowBeanNotice(b, brews, 'list')),
    ...active.map((b) => beanRow(b, brews)),
    all.length ? null : h('div', { class: 'hint' }, '등록한 원두가 없습니다.'),
    used.length ? section('다 쓴 원두', ...used.map((b) => beanRow(b, brews))) : null,
  );
}

export function beanFormScreen(id) {
  const existing = id === 'new' ? null : store.get('beans', id);
  if (id !== 'new' && !existing) return h('div', { class: 'screen' }, '원두를 찾을 수 없습니다.');
  // 9/25 전에 등록한 원두는 nameAuto 가 없어 «직접»으로 연다(직접 적은 이름을 지킨다)
  const bean = existing ? { ...createBean({ id: existing.id }), ...structuredClone(existing), nameAuto: beanNameIsAuto(existing) } : createBean();
  // 새 원두는 제조일·개봉일을 오늘로 채워 둔다(사용자 요청 9/25 — 오늘에서 며칠 옮기는 것이 빠르다). 모르면 [비우기].
  // 이미 등록한 원두의 빈 날짜는 채우지 않는다 — 다른 칸만 고쳐 저장해도 날짜가 생기는 일을 막으려고(−/+ 는 오늘부터 움직인다).
  if (!existing) {
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

  const text = (key, placeholder = '', after = null) =>
    h('input', { type: 'text', value: bean[key] ?? '', placeholder, onInput: (e) => { bean[key] = e.target.value; drawName(); after?.(); } });

  function drawName() {
    fill(
      nameBox,
      toggle({
        checked: bean.nameAuto,
        label: '자동으로 짓기',
        sub: { on: '국가·지역·생산자·품종·가공방식을 이어 붙입니다.', off: '이름을 직접 적습니다.' },
        onChange: (v) => {
          bean.nameAuto = v;
          // 직접으로 바꾸면 지금 조합을 입력칸에 채워 두고 고치게 한다
          if (!v && !bean.name) bean.name = beanAutoName(bean);
          drawName();
        },
      }),
      bean.nameAuto
        ? h('div', { class: 'field-value' }, beanAutoName(bean) || h('span', { class: 'muted' }, '국가·지역 등을 넣으면 채워집니다'))
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
    const st = beanStock(bean, store.brews());
    fill(
      stockBox,
      st.totalG == null
        ? h('div', { class: 'hint' }, '구매 무게를 넣으면 기록으로 남은 원두를 셉니다.')
        : h(
            'div',
            { class: st.low ? 'notice warn' : 'hint' },
            `구매 ${st.totalG}g − 기록 ${st.brews}건 ${st.usedG}g = 남은 약 ${Math.max(0, st.remainingG)}g(추정)`,
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

  function save() {
    bean.name = (bean.nameAuto ? beanAutoName(bean) : bean.name ?? '').trim();
    if (!bean.name) return toast(bean.nameAuto ? '국가·지역 같은 항목을 넣거나, 이름을 직접 적어 주세요.' : '원두 이름을 넣어 주세요.');
    if (bean.status !== startStatus) bean.consumedAt = bean.status === 'consumed' ? new Date().toISOString() : null;
    store.put('beans', bean);
    const st = beanStock(bean, store.brews());
    logEvent('bean.save', { beanId: bean.id, name: bean.name, nameAuto: bean.nameAuto, status: bean.status, totalG: st.totalG, remainingG: st.remainingG });
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
  // 9/26 전 원두: 단어만 있고 숫자가 없으면 그 단어를 알린다(숫자를 지어 채우지 않는다). 슬라이더를 만지면 숨는다.
  const oldRoast = bean.roastLevel == null && bean.roast ? h('div', { class: 'hint' }, `지금 값: ${bean.roast}(숫자 없이 적은 옛 값). 슬라이더로 고르면 숫자로 바뀝니다.`) : null;
  return h(
    'div',
    { class: 'screen' },
    h('h1', null, existing ? '원두 수정' : '원두 등록'),
    section(
      null,
      field('이름 *', nameBox),
      field('로스터리', text('roaster')),
      field('국가', text('country', '예: 에티오피아', drawNotes)),
      field('지역', text('region', '예: 예가체프')),
      field('농장·생산자', text('producer')),
      field('품종', text('variety')),
      field('가공방식', choiceList({ options: usedProcesses, labels: processLabels, value: bean.process || null, onChange: (v) => { bean.process = v; drawName(); drawNotes(); } })),
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
      field('구매 무게', h('div', { class: 'row amount' }, amountInput, unitSelect)),
      stockBox,
      field('제조일(로스팅일)', roastedBox),
      field('개봉일', dateStepper({ value: bean.openedOn, onChange: (v) => (bean.openedOn = v) })),
      existing ? field('상태', statusBox) : null,
    ),
    section(null, field('메모', h('textarea', { rows: 2, value: bean.memo ?? '', onInput: (e) => (bean.memo = e.target.value) }))),
    h('button', { class: 'primary big wide', onClick: save }, '저장'),
  );
}
