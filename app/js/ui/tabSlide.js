// 아래 탭 슬라이드 전환(사용자 요청 9/25): 탭을 누르면 화면이 옆으로 미끄러지며 넘어간다.
// 탭 순서대로 화면을 옆으로 늘어놓고 한 줄로 밀어 옮긴다. 멀리 건너뛸수록 사이 화면을 더 빨리 지나간다
// — 1칸 280ms · 2칸 340ms · 3칸 380ms(한 칸 지나는 데 280 → 170 → 127ms). 안드로이드 ViewPager 로 탭을 건너뛸 때와 같은 느낌.
// 디자인 용어로는 Material 의 «shared axis(X축)» 전환이다. Material 은 아래 탭에 «fade through»(겹쳐 사라졌다 나타나기)를 권하지만,
// 방향이 보이는 슬라이드는 사용자 결정(9/25)이다(docs/agent-notes/참고 출처 목록.md 「화면 전환」).
// 원두 탭 안의 [원두 | 레시피] 전환도 같은 방식으로 한 칸 넘긴다.
// 「동작 줄이기」를 켠 사람에게는 넘기는 움직임 없이 바로 바꾼다. 넘기는 중에 또 누르면 앞의 전환은 바로 끝낸다.
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
  if (i < 0 || j < 0 || i === j || !oldNode || reducedMotion()) return;
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
