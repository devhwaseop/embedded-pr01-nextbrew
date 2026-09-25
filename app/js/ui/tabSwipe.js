// 아래 탭 네 화면을 손가락으로 끌어 넘기기(사용자 요청 9/25).
// 가로로 10px 넘게, 세로보다 1.2배 넘게 움직이면 끌기를 시작하고 화면이 손가락을 따라온다(옆 탭 화면이 함께 보인다).
// 놓을 때 화면 폭의 25% 넘게 끌었거나 빠르게 튕겼으면(0.4px/ms) 넘기고, 아니면 제자리로 돌아간다. 끝 탭에서 더 끌면 고무줄처럼 버틴다.
// 세로로 먼저 움직이면 손대지 않는다(스크롤). 입력칸·슬라이더·탭 막대에서 시작한 끌기는 받지 않는다.
//
// 가장자리 제외(사용자 지시 9/25 — 폰의 시스템 제스처와 겹치지 않게): 네 모서리 근처에서 시작한 끌기는 받지 않는다.
//   좌우 40px: 안드로이드 제스처 탐색의 뒤로 가기 폭 — 기본 30dp × 민감도 최대 1.33배 ≈ 40dp(AOSP), 아이폰 Safari 가장자리 뒤로 가기
//   아래 48px + 안전 영역: 안드로이드 홈·최근 앱 제스처(내비 바 48dp, AOSP), 아이폰 홈 인디케이터(safe-area-inset-bottom)
//   위 24px + 안전 영역: 알림창 끌어내리기(상태 표시줄)
// 웹앱은 시스템이 쓰는 실제 폭을 읽을 수 없어(안드로이드 앱의 WindowInsets API 에 해당하는 것이 없음) 위 기본값의 최댓값으로 잡았다.

import { h } from './dom.js';
import { EASING, finishSlide, reducedMotion } from './tabSlide.js';

export const EDGE = { side: 40, top: 24, bottom: 48 };
export const START_PX = 10;
export const COMMIT = { ratio: 0.25, velocity: 0.4 }; // 폭의 25% · 0.4px/ms

// 시작점이 가장자리 제외 구역인가. inset = 안전 영역(px, 노치·홈 인디케이터)
export function startsInEdge(x, y, width, height, inset = { top: 0, bottom: 0, left: 0, right: 0 }) {
  return x < EDGE.side + inset.left || x > width - EDGE.side - inset.right || y < EDGE.top + inset.top || y > height - EDGE.bottom - inset.bottom;
}

// 놓았을 때: 넘길까(go) 돌아갈까(back). dx = 끈 거리(+ 오른쪽), v = 속도(px/ms), hasTarget = 그쪽에 탭이 있나
export function swipeDecision(dx, v, width, hasTarget) {
  if (!hasTarget || dx === 0) return 'back';
  if (Math.abs(dx) > width * COMMIT.ratio) return 'go';
  if (Math.abs(v) > COMMIT.velocity && Math.sign(v) === Math.sign(dx)) return 'go';
  return 'back';
}

// 안전 영역(env(safe-area-inset-*))을 px 로 읽는다 — CSS 에만 있는 값이라 보이지 않는 요소에 걸어 잰다
let probe = null;
function safeInsets() {
  if (!probe) {
    probe = h('div', { style: 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' });
    document.body.append(probe);
  }
  const s = getComputedStyle(probe);
  return { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
}

// tabIndexOf(주소) = 아래 탭 번호(탭 첫 화면이 아니면 -1), count = 탭 수, renderAt(번호) = 그 탭 화면, go(번호) = 그 탭으로 이동,
// onDrag(번호 + 끈 비율) = 탭 막대 표시를 손가락에 맞춰 옮긴다
export function enableTabSwipe({ tabIndexOf, count, renderAt, go, onDrag }) {
  let g = null;
  let layer = null;

  const screenEl = () => document.querySelector('#app > .screen');
  const pane = (node, side) => h('div', { class: 'swipe-pane', 'data-side': side }, h('div', { class: 'tab-slide-inner', style: 'top:0' }, node));

  function begin() {
    finishSlide();
    g.mode = 'drag';
    g.el = screenEl();
    g.w = window.innerWidth;
    g.left = g.i > 0 ? pane(renderAt(g.i - 1), 'left') : null;
    g.right = g.i < count - 1 ? pane(renderAt(g.i + 1), 'right') : null;
    layer = h('div', { class: 'swipe-layer', 'aria-hidden': 'true' }, g.left, g.right);
    document.body.append(layer);
    if (g.el) g.el.style.willChange = 'transform';
  }

  function place(dx, animate, ms) {
    const t = animate ? `transform ${ms}ms ${EASING}` : 'none';
    if (g.el) {
      g.el.style.transition = t;
      g.el.style.transform = `translateX(${dx}px)`;
    }
    for (const [p, base] of [[g.left, -g.w], [g.right, g.w]]) {
      if (!p) continue;
      p.style.transition = t;
      p.style.transform = `translateX(${base + dx}px)`;
    }
  }

  function clear() {
    layer?.remove();
    layer = null;
    const el = g?.el;
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    }
  }

  // 끌기를 마친 직후의 클릭(버튼·목록 줄)은 막는다 — 끄는 도중 손가락 아래 있던 것이 눌리지 않게
  function swallowNextClick() {
    const stop = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || g) return;
      const i = tabIndexOf(location.hash || '#/');
      if (i < 0) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable], .nav, .no-swipe, .modal-back, .tab-slide')) return;
      if (startsInEdge(e.clientX, e.clientY, window.innerWidth, window.innerHeight, safeInsets())) return;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, i, mode: 'pending', samples: [] };
    },
    { passive: true },
  );

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (g.mode === 'pending') {
        if (Math.abs(dy) > START_PX && Math.abs(dy) >= Math.abs(dx)) {
          g = null; // 세로 → 스크롤에 맡긴다
          return;
        }
        if (!(Math.abs(dx) > START_PX && Math.abs(dx) > Math.abs(dy) * 1.2)) return;
        begin();
      }
      // 끝 탭 바깥쪽으로는 고무줄처럼 1/4 만 따라온다
      const edge = (dx > 0 && !g.left) || (dx < 0 && !g.right);
      g.dx = edge ? dx * 0.25 : dx;
      g.samples.push([e.timeStamp, dx]);
      if (g.samples.length > 6) g.samples.shift();
      place(g.dx, false);
      onDrag?.(g.i - g.dx / g.w);
    },
    { passive: true },
  );

  function end(e, cancelled) {
    if (!g || e.pointerId !== g.id) return;
    const cur = g;
    if (cur.mode !== 'drag') {
      g = null;
      return;
    }
    swallowNextClick();
    const [t0, x0] = cur.samples[0] ?? [e.timeStamp, 0];
    const [t1, x1] = cur.samples[cur.samples.length - 1] ?? [e.timeStamp, 0];
    const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
    const dir = cur.dx < 0 ? 1 : -1; // 왼쪽으로 끌면 다음 탭
    const decision = cancelled ? 'back' : swipeDecision(cur.dx, v, cur.w, dir > 0 ? Boolean(cur.right) : Boolean(cur.left));
    const target = decision === 'go' ? -dir * cur.w : 0;
    const ms = reducedMotion() ? 0 : Math.round(Math.max(120, Math.min(280, (Math.abs(target - cur.dx) / cur.w) * 280)));
    place(target, ms > 0, ms);
    onDrag?.(decision === 'go' ? cur.i + dir : cur.i, ms);
    setTimeout(() => {
      if (decision === 'go') go(cur.i + dir); // 새 화면이 그려지면서 끌던 화면·옆 화면은 main.js 가 치운다(clearSwipe)
      else clear();
      if (g === cur) g = null;
    }, ms);
  }
  window.addEventListener('pointerup', (e) => end(e, false));
  window.addEventListener('pointercancel', (e) => end(e, true));

  // 새 화면을 그린 직후 main.js 가 부른다 — 끌어 넘긴 흔적(옆 화면 그림)을 치운다
  return {
    clearSwipe() {
      layer?.remove();
      layer = null;
    },
  };
}
