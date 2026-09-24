// 프리셋 레시피. 값은 원문 그대로 옮기고, 원문 링크와 확인일을 함께 둔다.
//
// 레시피 형식 (core/recipe.js 가 이 형식을 읽는다)
//   refDoseG   원문이 정한 원두량(g). 원두량을 바꾸면 아래 비율로 다시 계산한다.
//   waterRatio 뜨거운 물 = 원두량 × waterRatio
//   iceRatio   얼음 = 원두량 × iceRatio (핫 레시피는 0)
//   steps[]    cumPct = 이 단계가 끝났을 때 누적 물이 뜨거운 물 전체의 몇 %인가 (0~1)
//              startSec = 원문이 정한 이 단계의 시작 시각(경과 초). 원두량을 바꿔도 시각은 그대로 둔다.
//              hint = 타이머에 회색으로 보이는 짧은 설명. hintSource 로 근거를 적는다:
//                     'recipe'  = 이 레시피 원문에 있는 말을 옮긴 것
//                     'general' = 레시피와 무관하게 통하는 설명(근거는 docs/agent-notes/참고 출처 목록.md)
//                     근거가 없으면 hint 를 두지 않는다. 사용자가 준비 화면에서 직접 쓴 문장이 있으면 그것이 먼저다.
//   pourMethod 원문이 권하는 붓는 모양(나선형·가운데 등). 원문에 없으면 null.
//   pourTips   원문의 붓기 관련 팁(모든 단계에 걸리는 것)
//   endSec     원문이 정한 전체 추출 목표 시각(경과 초)
//   pourSec    원문이 정한 «한 번 붓는 데 걸릴 시간»(초). 없으면 강조하지 않는다.

export const PRESETS = [
  {
    id: 'kurasu-japanese-iced',
    kind: 'preset',
    name: '쿠라스 재팬 아이스',
    style: 'iced',
    designedFor: 'Hario V60',
    source: {
      label: 'Kurasu Kyoto — Japanese brew guide on iced pour-over coffee (Kosuke, head roaster)',
      url: 'https://kurasu.kyoto/blogs/recipe/japanese-brew-guide-on-iced-pour-over-coffee',
      checkedAt: '2026-09-23',
    },
    refDoseG: 16,
    waterRatio: 150 / 16,
    iceRatio: 70 / 16,
    tempC: 91,
    grindNote: '중간보다 약간 가늘게 (원문: medium fine)',
    roastNote: '라이트 로스트 기준',
    // 원문은 첫 푸어를 "First pour"로 적는다. 다음 푸어까지 40초를 기다리는 구간이라 앱에서는 「뜸 들이기」로 표시한다.
    steps: [
      {
        kind: 'bloom',
        label: '뜸 들이기',
        cumPct: 40 / 150,
        startSec: 0,
        // 쿠라스 원문은 이 단계의 역할을 말하지 않는다. 뜸의 목적(고르게 적시기·가스 빼기)은 레시피와 무관한 일반 설명이다.
        hint: '원두를 고르게 적시고 가스를 빼는 단계입니다. 마른 곳이 남으면 물이 한쪽으로 쏠립니다.',
        hintSource: 'general',
      },
      {
        kind: 'pour',
        label: '1차 푸어',
        cumPct: 100 / 150,
        startSec: 40,
        // 원문에 이 푸어(원문의 두 번째 푸어)의 역할이 없어 비워 둔다. 「10초 안에」는 모든 푸어의 팁이라 pourTips 로 옮겼다(9/24).
      },
      {
        kind: 'pour',
        label: '2차 푸어',
        cumPct: 1,
        startSec: 70,
        // 원문: "Make the third pour nice and gentle. The purpose of the third pour onward is the adjustment of concentration level."
        hint: '부드럽게 붓습니다. 농도를 조절하는 푸어입니다.',
        hintSource: 'recipe',
      },
    ],
    endSec: 130,
    // 원문 "Try to finish each pour in 10 seconds" — 타이머가 단계 시작 후 이 시간 동안 목표 g을 강조한다
    pourSec: 10,
    // 원문 글과 영상 설명란에 붓는 모양(나선형·가운데 등)은 없다(9/24 확인). 붓기 관련 말은 아래 팁 두 개뿐이다.
    pourMethod: null,
    pourTips: ['모든 푸어를 10초 안에 끝냅니다.', '2차 푸어(원문의 세 번째 푸어)는 부드럽게 붓습니다.'],
    notes: ['얼음을 서버에 먼저 넣고 시작합니다.', '얼음이 다 녹은 뒤 마십니다.'],
    dilutionG: 0,
  },
];

export function findPreset(id) {
  return PRESETS.find((r) => r.id === id) ?? null;
}
