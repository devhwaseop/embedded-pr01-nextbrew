// 아래 탭 슬라이드 전환(사용자 요청 9/25): 탭을 누르면 화면이 옆으로 미끄러지며 넘어간다.
// 탭 순서대로 화면을 옆으로 늘어놓고 한 줄로 밀어 옮긴다. 멀리 건너뛸수록 사이 화면을 더 빨리 지나간다
// — 1칸 280ms · 2칸 340ms · 3칸 380ms(한 칸 지나는 데 280 → 170 → 127ms). 안드로이드 ViewPager 로 탭을 건너뛸 때와 같은 느낌.
// 디자인 용어로는 Material 의 «shared axis(X축)» 전환이다. Material 은 아래 탭에 «fade through»(겹쳐 사라졌다 나타나기)를 권하지만,
// 방향이 보이는 슬라이드는 사용자 결정(9/25)이다(docs/agent-notes/참고 출처 목록.md 「화면 전환」).
// 원두 탭 안의 네 칸 [원두 | 레시피 | 그라인더 | 서버]은 아래 탭과 구분되게 «짧은 옆 밀기 + 겹침»(9/26 사용자 결정 A안 — shiftSegment).
// 「동작 줄이기」를 켠 사람에게는 옆으로 움직이지 않고 겹쳐 바꾸기(디졸브)만 한다 — iOS 가 동작 줄이기에서 쓰는 방식(9/26:
// 전에는 움직임을 통째로 껐는데, 동작 줄이기를 켠 아이폰에서 «애니메이션이 안 먹는다»로 보였을 수 있어 바꿨다). 넘기는 중에 또 누르면 앞의 전환은 바로 끝낸다.
// 넘기는 동안 보이는 것은 그림일 뿐이고(누르기가 통과한다), 실제 화면은 처음부터 새 화면이다.

import { h } from './dom.js';

export const SLIDE_MS = { 1: 280, 2: 340, 3: 380 };
export const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'; // Material 표준 곡선(천천히 출발 → 빠르게 → 천천히 멈춤)
let running = null;

export const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// 진행 중인 슬라이드를 바로 끝낸다(끌어 넘기기를 시작할 때 등)
export function finishSlide() {
  running?.finish();
}

// i·j = 이전·새 화면의 칸 번호, oldNode = 방금 떼어 낸 이전 화면, oldScrollY = 그때 스크롤,
// newNode = 새 화면(이미 앱에 붙어 있다 — 그림용으로 복제한다), renderAt(칸 번호) = 사이에 지나갈 화면을 만든다
export function slideTabs({ i, j, oldNode, oldScrollY, newNode, renderAt }) {
  finishSlide();
  if (i < 0 || j < 0 || i === j || !oldNode) return;
  if (reducedMotion()) return dissolve({ oldNode, oldScrollY });
  const lo = Math.min(i, j);
  const k = Math.abs(j - i);
  const panes = [];
  for (let t = lo; t <= lo + k; t++) {
    const node = t === i ? oldNode : t === j ? newNode.cloneNode(true) : renderAt(t);
    panes.push(h('div', { class: 'tab-slide-pane' }, h('div', { class: 'tab-slide-inner', style: `top:${t === i ? -oldScrollY : 0}px` }, node)));
  }
  const strip = h('div', { class: 'tab-slide-strip', style: `width:${(k + 1) * 100}vw` }, ...panes);
  const layer = h('div', { class: 'tab-slide', 'aria-hidden': 'true' }, strip);
  document.body.append(layer);
  const anim = strip.animate([{ transform: `translateX(${-(i - lo) * 100}vw)` }, { transform: `translateX(${-(j - lo) * 100}vw)` }], {
    duration: SLIDE_MS[k] ?? 400,
    easing: EASING,
  });
  running = anim;
  const done = () => {
    layer.remove();
    if (running === anim) running = null;
  };
  anim.finished.then(done, done);
}

// 옛 화면을 그림으로 겹쳐 두는 층(누르기는 통과 — 실제 화면은 이미 새 화면이다)
function overlay(oldNode, oldScrollY, cls) {
  const layer = h('div', { class: cls, 'aria-hidden': 'true' }, h('div', { class: 'tab-slide-inner', style: `top:${-oldScrollY}px` }, oldNode));
  document.body.append(layer);
  return layer;
}

// 겹쳐 바꾸기: 옛 화면이 150ms 동안 흐려지며 사라진다(동작 줄이기 — 위치는 움직이지 않는다)
export const DISSOLVE_MS = 150;
export function dissolve({ oldNode, oldScrollY }) {
  finishSlide();
  if (!oldNode) return;
  const layer = overlay(oldNode, oldScrollY, 'tab-fade');
  const anim = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DISSOLVE_MS, easing: 'linear', fill: 'forwards' });
  running = anim;
  const done = () => {
    layer.remove();
    if (running === anim) running = null;
  };
  anim.finished.then(done, done);
}

// 네 칸 전환(9/26 사용자 결정 A안): 칸 줄은 그대로 두고, 내용만 짧게(28px) 옆으로 밀리며 겹쳐 바뀐다.
// 나가는 내용은 앞 90ms 에 흐려지며 반대쪽으로, 들어오는 내용은 70ms 뒤부터 210ms 동안 나타난다(Material shared axis X 의 본래 모양 —
// 아래 탭의 «화면 전체가 넘어가는» 슬라이드와 구분된다). dir = +1(오른쪽 칸으로) · −1(왼쪽 칸으로).
export const SHIFT = { px: 28, outMs: 90, inDelay: 70, inMs: 210 };
export function shiftSegment({ dir, oldNode, oldScrollY, newNode }) {
  finishSlide();
  if (!oldNode) return;
  if (reducedMotion()) return dissolve({ oldNode, oldScrollY });
  oldNode.querySelector('.segment')?.style.setProperty('visibility', 'hidden'); // 칸 줄은 새 화면 것만 보인다
  const layer = overlay(oldNode, oldScrollY, 'tab-fade');
  const out = layer.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-SHIFT.px * dir}px)` }], { duration: SHIFT.outMs, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  const parts = [...newNode.children].filter((c) => !c.classList.contains('segment'));
  const ins = parts.map((p) => p.animate([{ opacity: 0, transform: `translateX(${SHIFT.px * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: SHIFT.inMs, delay: SHIFT.inDelay, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'backwards' }));
  const all = { finish: () => { out.finish(); ins.forEach((a) => a.finish()); } };
  running = all;
  const done = () => {
    layer.remove();
    if (running === all) running = null;
  };
  Promise.all([out.finished, ...ins.map((a) => a.finished)]).then(done, done);
}

// View Transitions 가 없는 브라우저(iOS 17 이하 사파리·홈 화면 앱 등)의 대신 움직임(9/26):
// 준비 → 타이머 → 결과 → 설문, 목록 ↔ 기록을 새 화면만 살짝 커지거나 작아지며 나타나게 한다(WAAPI — iOS 13.4 이상).
const ENTER = {
  'z-forward': [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }],
  'z-back': [{ opacity: 0, transform: 'scale(1.05)' }, { opacity: 1, transform: 'none' }],
  expand: [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }],
  collapse: [{ opacity: 0, transform: 'scale(1.03)' }, { opacity: 1, transform: 'none' }],
};
export function enterFallback(kind, node, { oldNode = null, oldScrollY = 0 } = {}) {
  if (!node) return;
  if (reducedMotion()) return dissolve({ oldNode, oldScrollY });
  node.animate(ENTER[kind] ?? ENTER.expand, { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
}
