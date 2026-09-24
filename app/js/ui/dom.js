// 작은 DOM 도우미와 공용 위젯. 디자인은 나중에 바꿀 예정이라 구조만 잡는다.

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

// SVG 요소(타이머 링). 글은 모두 텍스트 노드로 넣는다 — 사용자가 적은 글이 HTML로 해석되지 않게.
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
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

// 숫자: − [입력] + (순서대로 올리고 내리기 + 직접 입력)
export function stepper({ value, step = 1, min = 0, max = 9999, unit = '', onChange }) {
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
    input,
    unit ? h('span', { class: 'unit' }, unit) : null,
    h('button', { type: 'button', onClick: () => bump(step), 'aria-label': '늘리기' }, '+'),
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
    wrap.replaceChildren(
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
    wrap.replaceChildren(
      chips({ options: opts, selected: sel, multi: true, onChange: (v) => { sel = v; onChange([...sel]); } }),
      h('div', { class: 'row' }, input, h('button', { type: 'button', onClick: add }, '추가')),
    );
  };
  draw();
  return wrap;
}

// 켜고 끄는 스위치(선택 항목을 쓸지 말지). 속은 체크박스라 키보드·화면 읽기 프로그램에서도 그대로 동작한다.
export function toggle({ checked, label, onChange }) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: Boolean(checked), onChange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', null, label));
}

// 뗄 때 실행하는 버튼(사용자 결정 9/24 — W3C WCAG 2.5.2 Pointer Cancellation).
// - 누를 때가 아니라 손을 뗄 때 onPress 를 부른다.
// - 누른 채 버튼 밖으로 밀면 「놓으면 취소」로 바뀌고, 그대로 떼면 실행하지 않고 onAbort 를 부른다.
// - 키보드(Enter·Space)는 click 으로만 들어오므로(detail 0) 그때만 click 을 쓴다.
export function pressButton({ label, className = '', onPress, onAbort }) {
  const text = h('span', null, label);
  const btn = h('button', { type: 'button', class: `press ${className}` }, text);
  let base = label;
  let pid = null;
  let outside = false;
  const MARGIN = 8; // 버튼 가장자리에서 손가락이 조금 흔들린 것은 밖으로 보지 않는다
  const isInside = (e) => {
    const r = btn.getBoundingClientRect();
    return e.clientX >= r.left - MARGIN && e.clientX <= r.right + MARGIN && e.clientY >= r.top - MARGIN && e.clientY <= r.bottom + MARGIN;
  };
  const reset = () => {
    pid = null;
    outside = false;
    btn.classList.remove('pressing', 'abort');
    text.textContent = base;
  };
  btn.addEventListener('pointerdown', (e) => {
    if (btn.disabled || e.button !== 0) return;
    pid = e.pointerId;
    outside = false;
    btn.setPointerCapture?.(pid); // 밖으로 밀어도 계속 움직임을 받는다
    btn.classList.add('pressing');
  });
  btn.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const o = !isInside(e);
    if (o === outside) return;
    outside = o;
    btn.classList.toggle('abort', o);
    text.textContent = o ? '놓으면 취소' : base;
  });
  btn.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pid) return;
    const aborted = outside;
    reset();
    if (aborted) onAbort?.();
    else onPress();
  });
  btn.addEventListener('pointercancel', (e) => e.pointerId === pid && reset());
  btn.addEventListener('click', (e) => e.detail === 0 && !btn.disabled && onPress());
  btn.setLabel = (t) => {
    base = t;
    if (pid == null) text.textContent = t;
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
