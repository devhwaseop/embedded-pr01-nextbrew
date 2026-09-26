// 아래 탭 아이콘(사용자 요청 9/24 — 「홈·기록·원두·설정」 글자를 아이콘으로).
// 출처: Lucide v0.544.0 (lucide-static) — house · history · bean · settings 의 경로를 그대로 옮겼다.
// 9/25: AI 공유 프롬프트의 복사 단추용 copy · check, 원두 탭 [원두 | 레시피] 전환의 레시피용 book-open 을 같은 버전에서 더했다.
// 9/26: [서버] 칸용 beaker(같은 버전), [그라인더] 칸은 직접 그린 핸드밀(아래 grinder).
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
  beaker: [['path', { d: 'M4.5 3h15' }], ['path', { d: 'M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3' }], ['path', { d: 'M6 14h12' }]],
  book: [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ],
  settings: [
    ['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
};

export function icon(name) {
  return svg(
    'svg',
    { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon' },
    ...PATHS[name].map(([tag, attrs]) => svg(tag, attrs)),
  );
}
