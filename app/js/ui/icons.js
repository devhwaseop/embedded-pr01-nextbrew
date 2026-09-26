// 아래 탭 아이콘(사용자 요청 9/24 — 「홈·기록·원두·설정」 글자를 아이콘으로).
// 출처: Lucide v0.544.0 (lucide-static) — house · history · bean · settings 의 경로를 그대로 옮겼다.
// 9/25: AI 공유 프롬프트의 복사 단추용 copy · check, 원두 탭 [원두 | 레시피] 전환의 레시피용 book-open 을 같은 버전에서 더했다.
// 9/26: [그라인더]·[드리퍼]·[서버] 칸은 사용자가 준 그림·사진 느낌으로 직접 그렸다(아래 grinder·dripper·server).
//
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part of Feather (MIT).
// All other copyright (c) for Lucide are held by Lucide Contributors 2025.
// Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted,
// provided that the above copyright notice and this permission notice appear in all copies.

import { svg } from './dom.js';

const PATHS = {
  home: [
    ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
    ['path', { d: 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
  ],
  history: [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M12 7v5l4 2' }],
  ],
  bean: [
    ['path', { d: 'M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402Z' }],
    ['path', { d: 'M5.341 10.62a4 4 0 1 0 5.279-5.28' }],
  ],
  copy: [
    ['rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  // 9/26 원두 탭 [서버] 칸: beaker(Lucide v0.544.0). [그라인더]는 사용자가 준 핸드밀 그림 느낌으로 직접 그렸다(Lucide 규격: 24px · 선 2 · 둥근 끝)
  grinder: [
    ['path', { d: 'M9 7.5V3.5h7.5' }], // 손잡이 축과 팔
    ['circle', { cx: 18, cy: 3.5, r: 1.5 }], // 손잡이 머리
    ['path', { d: 'M2.5 7.5h13' }], // 호퍼 테
    ['path', { d: 'M4 7.5a5 4.2 0 0 0 10 0' }], // 호퍼(원두 넣는 그릇)
    ['path', { d: 'M5.8 12.2h6.4' }], // 목
    ['path', { d: 'M6 12.2 4.6 20M12 12.2l1.4 7.8' }], // 몸통(아래로 넓어짐)
    ['path', { d: 'M3 20.5h12' }], // 받침
    ['ellipse', { cx: 9, cy: 16.4, rx: 1.4, ry: 2.1, 'stroke-width': 1.5 }], // 원두
    ['path', { d: 'M9.5 14.6c-.8.9-.1 1.8-.5 3.6', 'stroke-width': 1.2 }], // 원두 가운데 골
  ],
  // 9/26 사용자가 준 실사 사진 느낌으로 직접 그림(Lucide 규격). 드리퍼 = 하리오 V60 01 투명(원뿔·나선 결·손잡이·받침판·굽),
  // 서버 = 위는 곧고 아래로 퍼지는 유리 서버(따르는 입·꺾인 손잡이·커피 높이 선). beaker 는 서버 칸이 새 아이콘으로 바뀌어 뺐다.
  dripper: [
    ['path', { d: 'M2.5 4h15' }], // 테
    ['path', { d: 'M3 4.2 8.6 13M17 4.2 11.4 13' }], // 원뿔
    ['path', { d: 'M8.6 13h2.8M8.9 13v2M11.1 13v2' }], // 목
    ['path', { d: 'M2.5 15.6h15' }], // 받침판
    ['path', { d: 'M7.4 16v3.4h5.2V16' }], // 굽
    ['path', { d: 'M16.8 5.6c3.3-.6 5.2.8 4.5 3.3-.5 1.7-2.1 2.7-6 3.4' }], // 손잡이
    ['path', { d: 'M7 5.8c.6 2.2 1.6 4 3 5.4', 'stroke-width': 1.3 }], // 나선 결
    ['path', { d: 'M12.8 5.8c-.5 2-1 3.6-1.6 5', 'stroke-width': 1.3 }],
  ],
  server: [
    ['path', { d: 'M5.5 4.2h9.5v6.8l3.2 7.7a1 1 0 0 1-.9 1.4H3.2a1 1 0 0 1-.9-1.4l3.2-7.7Z' }], // 몸통
    ['path', { d: 'M5.5 4.2 3.6 3' }], // 따르는 입
    ['path', { d: 'M15 5.4h4.4a.9.9 0 0 1 .8 1.3L17.3 12.6' }], // 꺾인 손잡이
    ['path', { d: 'M4 14.6h12.4' }], // 커피 높이
  ],
  // 9/26 아래 탭 [원두] 자리(원두·레시피·그라인더·드리퍼·서버 다섯 칸을 묶는 탭): 서버 위에 드리퍼를 얹어 내리는 모습을 직접 그렸다.
  // 사용자가 고른 판 = ② 유리 서버 · 선 1.0(안쪽 결 0.7). 다른 아이콘(선 2)보다 선이 가늘어 WIDTH 로 따로 준다.
  brew: [
    ['ellipse', { cx: 10, cy: 3.2, rx: 6.3, ry: 1.3 }], // 드리퍼 테
    ['path', { d: 'M3.7 3.4 8.2 9M16.3 3.4 11.8 9' }], // 원뿔
    ['path', { d: 'M6.4 4.9c.8 1.5 1.8 2.8 2.9 3.8M9.3 5c.7 1.4 1.5 2.6 2.4 3.5M12.2 5c.4.9.9 1.7 1.4 2.4', 'stroke-width': 0.7 }], // 나선 결
    ['ellipse', { cx: 10, cy: 10, rx: 5.8, ry: 1 }], // 받침판
    ['path', { d: 'M5.5 12h9l1.6 7.4a1.3 1.3 0 0 1-1.3 1.6H5.2a1.3 1.3 0 0 1-1.3-1.6Z' }], // 유리 서버 몸통
    ['path', { d: 'M14.5 13h3.1a.8.8 0 0 1 .7 1.2l-1.9 3.6' }], // 꺾인 손잡이
    ['path', { d: 'M4.8 16.9h10.4' }], // 커피 높이
    ['path', { d: 'M10 12.8v1.4', 'stroke-width': 0.7 }], // 떨어지는 커피
  ],
  book: [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ],
  settings: [
    ['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
};

// 선 굵기가 기본(2)과 다른 아이콘
const WIDTH = { brew: 1 };

export function icon(name) {
  return svg(
    'svg',
    { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': WIDTH[name] ?? 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: WIDTH[name] ? 'icon icon-thin' : 'icon' },
    ...PATHS[name].map(([tag, attrs]) => svg(tag, attrs)),
  );
}
