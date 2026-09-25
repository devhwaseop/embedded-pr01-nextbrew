// 작은 DOM 도우미와 공용 위젯. 디자인은 나중에 바꿀 예정이라 구조만 잡는다.

import { parseDay, formatDay, daysSince } from '../core/schema.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof el[k] !== 'function' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// 자식 바꾸기 — 앱은 replaceChildren 을 직접 쓰지 않고 이것만 쓴다(tests/app-files.test.mjs 가 막는다).
// DOM 의 replaceChildren 은 null 을 건너뛰지 않고 「null」 글자로 넣는다 — 9/24 세 번(원두 노트·타이머·준비 화면) 화면에 찍혔다.
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false).map((c) => (c instanceof Node ? c : String(c))));
  return el;
}

// 화면 이동·바깥 링크 버튼(사용자 요청 9/24 — 밑줄 글자 링크 대신 보조 버튼 모양으로 통일).
// 앱 안으로 가면 「›」, 바깥 사이트(새 창)면 「↗」 — 화살표는 화면 읽기 프로그램에 읽히지 않게 하고, 새 창은 글로 알린다.
export function linkButton({ href, label, external = false, returnToPrep = false }) {
  return h(
    'a',
    {
      class: 'button wide link-action',
      href,
      target: external ? '_blank' : null,
      rel: external ? 'noopener' : null,
      onClick: returnToPrep ? () => sessionStorage.setItem('nb.returnTo', '#/prep') : null,
    },
    h('span', null, label),
    h('span', { class: 'link-arrow', 'aria-hidden': 'true' }, external ? '↗' : '›'),
    external ? h('span', { class: 'sr-only' }, ' (새 창)') : null,
  );
}

// SVG 요소(타이머 링). 글은 모두 텍스트 노드로 넣는다 — 사용자가 적은 글이 HTML로 해석되지 않게.
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false)); // h() 처럼 빈 자리는 건너뛴다(그래프의 조건부 요소)
  return el;
}

// 핵심 단어 + 옅은 부가 설명(사용자 결정 9/24: 단어를 부각하고 설명은 눈에 덜 띄게)
export function term(label, sub) {
  return h('span', { class: 'term' }, label, sub ? h('span', { class: 'term-sub' }, sub) : null);
}
export const termOf = (w) => term(w.label, w.sub);

export function section(title, ...children) {
  return h('section', { class: 'card' }, title ? h('h2', null, title) : null, ...children);
}

export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

// 작은 태그 묶음(레시피의 핫/아이스·드리퍼·붓는 횟수 등)
export function tags(list) {
  return h('div', { class: 'tags' }, ...list.map((t) => h('span', { class: 'tag' }, t)));
}

// 숫자: − [입력] + (순서대로 올리고 내리기 + 직접 입력). prefix = 입력칸 앞 표시(비율의 「1:」)
export function stepper({ value, step = 1, min = 0, max = 9999, unit = '', prefix = '', onChange }) {
  const input = h('input', { type: 'number', inputMode: 'decimal', value: value ?? '', step, min, max, class: 'stepper-input' });
  const set = (v) => {
    if (v === '' || v == null || Number.isNaN(v)) {
      input.value = '';
      onChange(null);
      return;
    }
    const n = Math.min(max, Math.max(min, Math.round(v * 10) / 10));
    input.value = n;
    onChange(n);
  };
  input.addEventListener('change', () => set(input.value === '' ? null : Number(input.value)));
  const bump = (d) => set((input.value === '' ? Number(min) : Number(input.value)) + d);
  return h(
    'div',
    { class: 'stepper' },
    h('button', { type: 'button', onClick: () => bump(-step), 'aria-label': '줄이기' }, '−'),
    prefix ? h('span', { class: 'unit' }, prefix) : null,
    input,
    unit ? h('span', { class: 'unit' }, unit) : null,
    h('button', { type: 'button', onClick: () => bump(step), 'aria-label': '늘리기' }, '+'),
  );
}

// 날짜 칸(사용자 요청 9/25): 숫자 칸과 같은 [−] 날짜 [+] 모양. −/+ 는 하루씩, 가운데를 누르면 기기의 달력이 뜬다.
// value = 'YYYY-MM-DD' 또는 null(비움). 비어 있을 때 −/+ 는 start(처음 값 = 오늘)에서 출발한다.
// 아래 줄에 오늘 기준으로 며칠 전·뒤인지와 [비우기](모르는 날짜·아직 안 뜯은 봉투)를 둔다.
export function today() {
  return formatDay(new Date());
}
export function dateStepper({ value, onChange, start = null, clearable = true }) {
  let v = value ?? null;
  const input = h('input', { type: 'date', class: 'stepper-input date-input', value: v ?? '' });
  const rel = h('span');
  const clear = clearable ? h('button', { type: 'button', class: 'inline-btn quiet' }, '비우기') : null;
  const paint = () => {
    const n = daysSince(v);
    rel.textContent = v == null ? '비어 있음 · −/+ 를 누르면 오늘부터' : n === 0 ? '오늘' : n > 0 ? `${n}일 전` : `${-n}일 뒤`;
    clear?.classList.toggle('hidden', v == null);
  };
  const set = (nv) => {
    v = nv;
    input.value = v ?? '';
    paint();
    onChange(v);
  };
  const shift = (days) => {
    const d = parseDay(v ?? start ?? today());
    d.setDate(d.getDate() + days);
    set(formatDay(d));
  };
  input.addEventListener('change', () => set(input.value || null));
  clear?.addEventListener('click', () => set(null));
  paint();
  return h(
    'div',
    { class: 'date-field' },
    h(
      'div',
      { class: 'stepper' },
      h('button', { type: 'button', onClick: () => shift(-1), 'aria-label': '하루 앞으로' }, '−'),
      input,
      h('button', { type: 'button', onClick: () => shift(1), 'aria-label': '하루 뒤로' }, '+'),
    ),
    h('div', { class: 'hint row-line' }, rel, clear),
  );
}

// 목록에서 고르기 + 「직접 입력…」
export function choiceList({ options, value, onChange, customLabel = '직접 입력…' }) {
  const opts = [...new Set([...options, ...(value && !options.includes(value) ? [value] : [])])];
  // 값이 없으면 첫 항목이 골라진 것처럼 보이지 않게 빈 칸을 둔다
  const blank = value == null ? h('option', { value: '', selected: true, disabled: true }, '선택') : null;
  const select = h('select', null, blank, ...opts.map((o) => h('option', { value: o, selected: o === value }, o)), h('option', { value: '__custom__' }, customLabel));
  const custom = h('input', { type: 'text', placeholder: '직접 입력', class: 'hidden' });
  select.addEventListener('change', () => {
    if (select.value === '__custom__') {
      custom.classList.remove('hidden');
      custom.focus();
    } else {
      custom.classList.add('hidden');
      onChange(select.value);
    }
  });
  custom.addEventListener('change', () => {
    const v = custom.value.trim();
    if (v) onChange(v);
  });
  return h('div', { class: 'choice' }, select, custom);
}

// 칩: multi=false 면 하나만, true 면 여러 개. 다시 누르면 해제.
// describe = { 선택지: 설명 } — 하나만 고르는 칩에서 «고른 것»의 설명을 아래에 옅게 보인다(사용자 결정 9/24). 바꾸면 설명도 바뀐다.
export function chips({ options, selected, multi = false, onChange, describe = null }) {
  let sel = multi ? new Set(selected ?? []) : selected ?? null;
  const wrap = h('div', { class: 'chips' });
  const draw = () => {
    fill(
      wrap,
      ...options.map((o) => {
        const on = multi ? sel.has(o) : sel === o;
        return h(
          'button',
          {
            type: 'button',
            class: `chip${on ? ' on' : ''}`,
            onClick: () => {
              if (multi) {
                if (sel.has(o)) sel.delete(o);
                else sel.add(o);
                onChange([...sel]);
              } else {
                sel = sel === o ? null : o;
                onChange(sel);
              }
              draw();
            },
          },
          o,
        );
      }),
    );
    if (desc) desc.textContent = (!multi && sel != null && describe[sel]) || '';
  };
  const desc = describe && !multi ? h('div', { class: 'choice-desc', 'aria-live': 'polite' }) : null;
  draw();
  return desc ? h('div', { class: 'chips-wrap' }, wrap, desc) : wrap;
}

// 칩 여러 개 고르기 + 목록에 없는 말을 직접 추가
export function tagEditor({ options, selected, onChange, placeholder = '직접 추가' }) {
  let sel = [...(selected ?? [])];
  const wrap = h('div');
  const draw = () => {
    const opts = [...new Set([...options, ...sel])];
    const input = h('input', { type: 'text', placeholder });
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      if (!sel.includes(v)) sel.push(v);
      onChange([...sel]);
      draw();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), add()));
    fill(
      wrap,
      chips({ options: opts, selected: sel, multi: true, onChange: (v) => { sel = v; onChange([...sel]); } }),
      h('div', { class: 'row' }, input, h('button', { type: 'button', onClick: add }, '추가')),
    );
  };
  draw();
  return wrap;
}

// 켜고 끄는 스위치(선택 항목을 쓸지 말지). 속은 체크박스라 키보드·화면 읽기 프로그램에서도 그대로 동작한다.
// 모양(사용자 결정 9/24 — 백업 B안): 이름 한 줄 + 아래 옅은 설명, 스위치는 오른쪽 끝(Apple HIG 목록 행 · Material 3 목록 보조 설명).
// sub = 문자열(늘 같은 설명) 또는 { on, off }(켜짐·꺼짐에 따라 바뀌는 설명 — Android setSummaryOn/Off 방식).
export function toggle({ checked, label, sub = null, onChange }) {
  const subText = (v) => (sub == null ? '' : typeof sub === 'string' ? sub : v ? sub.on : sub.off);
  const subEl = sub == null ? null : h('span', { class: 'switch-sub' }, subText(checked));
  const input = h('input', {
    type: 'checkbox',
    role: 'switch',
    checked: Boolean(checked),
    onChange: (e) => {
      if (subEl) subEl.textContent = subText(e.target.checked);
      onChange(e.target.checked);
    },
  });
  return h('label', { class: 'switch' }, h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), subEl), input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }));
}

// 뗄 때 실행하는 버튼(사용자 결정 9/24 — W3C WCAG 2.5.2 Pointer Cancellation).
// - 누를 때가 아니라 손을 뗄 때 onPress 를 부른다.
// - 누른 채 버튼 밖으로 밀면 「놓으면 취소」로 바뀌고, 그대로 떼면 실행하지 않고 onAbort 를 부른다.
// - 키보드(Enter·Space)는 click 으로만 들어오므로(detail 0) 그때만 click 을 쓴다.
// 슬라이더 칠하기: 손잡이 왼쪽을 앱 색으로 채운다(CSS 가 --p = 0~1 을 읽는다 — 9/25 슬라이더 모양을 직접 그리면서)
export function paintScale(range) {
  const n = Number(range.max) - Number(range.min);
  range.style.setProperty('--p', String(n > 0 ? (Number(range.value) - Number(range.min)) / n : 0));
}

// 단계 슬라이더(9/25 — 원두 배전도). 맛 설문의 슬라이더와 같은 배치: [이름 · 선택 안 함] / 슬라이더 / 눈금 / 고른 단어.
// value = 1부터 센 단계, null = 선택 안 함(가운데 값으로 저장하지 않는다). ticks = 눈금에 쓸 짧은 말(없으면 words).
export function levelSlider({ label, words, ticks = words, value, onChange }) {
  let level = value ?? null;
  const range = h('input', { type: 'range', min: 1, max: words.length, step: 1, value: level ?? Math.ceil(words.length / 2), class: 'scale', 'aria-label': words.join('·') });
  const word = h('div', { class: 'scale-word' });
  const off = h('button', { type: 'button', class: 'chip' }, '선택 안 함');
  const paint = () => {
    range.classList.toggle('off', level == null);
    off.classList.toggle('on', level == null);
    word.textContent = level == null ? '선택 안 함' : words[level - 1];
    paintScale(range);
  };
  const take = () => {
    level = Number(range.value);
    paint();
    onChange(level);
  };
  // 「선택 안 함」 상태에서 가운데를 그냥 눌러도 값이 들어가도록 click 도 받는다
  range.addEventListener('input', take);
  range.addEventListener('click', take);
  off.addEventListener('click', () => {
    level = null;
    paint();
    onChange(null);
  });
  paint();
  // --n = 단계 수: 눈금 단어를 슬라이더의 각 칸 위치에 맞추는 데 쓴다(CSS .scale-row)
  return h('div', { class: 'scale-row', style: `--n:${words.length}` }, h('div', { class: 'row between' }, label, off), range, h('div', { class: 'ticks' }, ...ticks.map((t) => h('span', null, t))), word);
}

// 뗄 때 실행하는 누름 영역(연타·실수 대책, 사용자 결정 9/24): 누르면 .pressing, 손가락을 밖으로 밀면 .abort 이고 놓으면 취소.
// 버튼(pressButton)과 타이머 원(9/25 — 원 전체를 눌러도 같은 동작)이 함께 쓴다.
// onDown(e) = 누른 순간(원의 물결 효과 등), onOutside(밖인가) = 밖으로 밀었다 돌아왔다 할 때, disabled() = 지금 막혀 있나
export function pressable(el, { onPress, onAbort, onDown, onOutside, disabled = () => el.disabled }) {
  let pid = null;
  let outside = false;
  const MARGIN = 8; // 가장자리에서 손가락이 조금 흔들린 것은 밖으로 보지 않는다
  const isInside = (e) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left - MARGIN && e.clientX <= r.right + MARGIN && e.clientY >= r.top - MARGIN && e.clientY <= r.bottom + MARGIN;
  };
  const reset = () => {
    pid = null;
    if (outside) onOutside?.(false);
    outside = false;
    el.classList.remove('pressing', 'abort');
  };
  el.addEventListener('pointerdown', (e) => {
    if (disabled() || e.button !== 0) return;
    pid = e.pointerId;
    outside = false;
    el.setPointerCapture?.(pid); // 밖으로 밀어도 계속 움직임을 받는다
    el.classList.add('pressing');
    onDown?.(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const o = !isInside(e);
    if (o === outside) return;
    outside = o;
    el.classList.toggle('abort', o);
    onOutside?.(o);
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pid) return;
    const aborted = outside;
    reset();
    if (aborted) onAbort?.();
    else onPress();
  });
  el.addEventListener('pointercancel', (e) => e.pointerId === pid && reset());
  return { pressing: () => pid != null };
}

export function pressButton({ label, className = '', onPress, onAbort }) {
  const text = h('span', null, label);
  const btn = h('button', { type: 'button', class: `press ${className}` }, text);
  let base = label;
  const p = pressable(btn, { onPress, onAbort, onOutside: (o) => (text.textContent = o ? '놓으면 취소' : base) });
  btn.addEventListener('click', (e) => e.detail === 0 && !btn.disabled && onPress()); // 키보드(Enter·Space)
  btn.setLabel = (t) => {
    base = t;
    if (!p.pressing()) text.textContent = t;
  };
  return btn;
}

// Google 로그인 버튼 — Google 「Sign in with Google」 브랜딩 가이드의 밝은 테마(흰 바탕, 테두리 #747775, 글자 #1F1F1F)와
// 표준 색 G 로고. 로고 경로는 Google 이 gstatic 에 올린 Firebase UI 공식 파일(logo_googleg_48dp)을 그대로 옮겼다(9/24).
// 가이드의 글꼴(Google Sans Medium)은 앱에 없어 시스템 글꼴 500 으로 대신한다. 로고의 크기·색은 바꾸지 않는다(가이드).
const G_LOGO = [
  ['#4285F4', 'M117.6,61.3636364 C117.6,57.1090909 117.218182,53.0181818 116.509091,49.0909091 L60,49.0909091 L60,72.3 L92.2909091,72.3 C90.9,79.8 86.6727273,86.1545455 80.3181818,90.4090909 L80.3181818,105.463636 L99.7090909,105.463636 C111.054545,95.0181818 117.6,79.6363636 117.6,61.3636364 L117.6,61.3636364 Z'],
  ['#34A853', 'M60,120 C76.2,120 89.7818182,114.627273 99.7090909,105.463636 L80.3181818,90.4090909 C74.9454545,94.0090909 68.0727273,96.1363636 60,96.1363636 C44.3727273,96.1363636 31.1454545,85.5818182 26.4272727,71.4 L6.38181818,71.4 L6.38181818,86.9454545 C16.2545455,106.554545 36.5454545,120 60,120 L60,120 Z'],
  ['#FBBC05', 'M26.4272727,71.4 C25.2272727,67.8 24.5454545,63.9545455 24.5454545,60 C24.5454545,56.0454545 25.2272727,52.2 26.4272727,48.6 L26.4272727,33.0545455 L6.38181818,33.0545455 C2.31818182,41.1545455 0,50.3181818 0,60 C0,69.6818182 2.31818182,78.8454545 6.38181818,86.9454545 L26.4272727,71.4 L26.4272727,71.4 Z'],
  ['#EA4335', 'M60,23.8636364 C68.8090909,23.8636364 76.7181818,26.8909091 82.9363636,32.8363636 L100.145455,15.6272727 C89.7545455,5.94545455 76.1727273,0 60,0 C36.5454545,0 16.2545455,13.4454545 6.38181818,33.0545455 L26.4272727,48.6 C31.1454545,34.4181818 44.3727273,23.8636364 60,23.8636364 L60,23.8636364 Z'],
];
export function googleButton({ label = 'Google 계정으로 로그인', onClick }) {
  const logo = svg('svg', { viewBox: '0 0 118 120', width: '18', height: '18.3', 'aria-hidden': 'true', class: 'g-logo' }, ...G_LOGO.map(([fill, d]) => svg('path', { d, fill })));
  return h('button', { type: 'button', class: 'google-btn', onClick }, logo, h('span', null, label));
}

// 글 복사: 성공하면 true. 클립보드가 막힌 브라우저면 false — 부르는 쪽이 글을 보여 주고 길게 눌러 복사하게 한다.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

// 간단한 팝업. actions: [{ key, label, primary }] → 누른 key 를 돌려준다(바깥을 누르면 null).
export function modal({ title, body, actions }) {
  return new Promise((resolve) => {
    const close = (key) => {
      back.remove();
      resolve(key);
    };
    const back = h(
      'div',
      { class: 'modal-back', onClick: (e) => e.target === back && close(null) },
      h(
        'div',
        { class: 'modal' },
        title ? h('h3', null, title) : null,
        body ? h('p', null, body) : null,
        h('div', { class: 'row' }, ...actions.map((a) => h('button', { type: 'button', class: a.primary ? 'primary' : '', onClick: () => close(a.key) }, a.label))),
      ),
    );
    document.body.append(back);
  });
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
