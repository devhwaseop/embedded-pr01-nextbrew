// 화면 단어(사용자 결정 9/24). 한 곳에서 정하고 화면·비교표·AI 공유 파일이 같이 쓴다.
// label = 눈에 띄게 보일 짧은 핵심 단어, sub = 옅고 작게 붙는 부가 설명, help = 필요할 때만 한 줄 더.

export const WORDS = {
  dilution: { label: '가수', sub: '추출 후 추가한 물' },
  // 근거: Intelligentsia·Stumptown 추출 가이드 — 종이 맛을 씻어 내고 드리퍼를 데우며, 헹군 물은 버린다(docs/agent-notes/참고 출처 목록.md)
  // 「안 함」 설명 근거: Counter Culture — 물만 부어 맛을 보고 종이 맛이 나지 않으면 건너뛰어도 된다
  rinse: {
    label: '린싱',
    sub: '필터 헹굼',
    on: '뜨거운 물로 필터를 적셔 종이 맛을 씻어 내고 드리퍼를 데웁니다. 헹군 물은 버립니다.',
    off: '헹구지 않고 추출합니다. 필터에 물만 부어 봐서 종이 맛이 나지 않으면 건너뛰어도 됩니다.',
  },
  // 가수 전·후 총무게(사용자 요청 9/25): 둘 다 서버를 올린 채 잰 저울 값. 둘이 있으면 가수 = 후 − 전
  serverTotal: { label: '가수 전 총무게', sub: '서버 포함 저울 값' },
  serverAfter: { label: '가수 후 총무게', sub: '서버 포함 · 가수 전 총무게 + 가수' },
  // 추출 뒤 더 넣은 얼음(아이스, 사용자 요청 9/26 — 가수 아래, 처음엔 꺼짐). 안 적었으면 «안 넣음»이 아니라 «모름»으로 공유한다
  iceAdded: { label: '추가 얼음', sub: '추출 뒤 더 넣은 얼음' },
  serverAfterIce: { label: '얼음 넣은 뒤 총무게', sub: '서버 포함 · 가수 후 총무게 + 추가 얼음' },
  resultNote: { label: '추가 입력', sub: '추출에 대해 더 적어 둘 것' },
  // 아이스는 서버에 얼음이 들어 있으므로 원액 무게에 얼음이 함께 잡힌다
  netWeight: { label: '커피 원액 무게', sub: '서버 제외 · 아이스는 얼음 포함' },
  target: { label: '저울 누적 목표' },
  // 흔히 쓰는 1:15 같은 표기(사용자 요청 9/24) — 보조 설명이 아니라 독립 항목으로 둔다(사용자 정정 9/24).
  // 아이스는 뜨거운 물 기준이고, 얼음까지 넣은 비율은 따로 적는다
  ratio: { label: '원두와 물의 비율' },
  grindDial: { label: '분쇄 크기 (Click)', sub: '그라인더 표시값' },
  grind: { label: '분쇄 크기' },
  pourMethod: { label: '드립 방법(기준)' },
  offFlavor: { label: '잡미' },
  notePerception: { label: '원두 노트', sub: '원두 노트가 느껴졌나요?' },
  myNotes: { label: '느낀 향과 맛', sub: '직접 느낀 향과 맛을 적어주세요.' },
};

// 조사 고르기: 끝 글자에 받침이 있으면 a(을·은·이), 없으면 b(를·는·가). 단계 이름처럼 바뀌는 말 뒤에 쓴다(9/26 「1차 푸어을」 고침)
export function josa(word, a, b) {
  const code = String(word ?? '').trim().slice(-1).charCodeAt(0);
  const has = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${word}${has ? a : b}`;
}

// 종료 상태: 저장은 key 로 한다(단어를 바꿔도 옛 기록이 깨지지 않게). 9/24 전 기록의 한국어 값도 읽는다.
export const END_STATE_WORDS = {
  // 기준(9/25 사용자 질문): 물줄기가 방울로 바뀌면 원두 위의 물이 다 빠진 것이다. 그 뒤 떨어지는 방울은 «모두 내려감»에 들어간다.
  drained: { label: '모두 내려감', sub: '물줄기가 방울로 바뀐 뒤 드리퍼를 뗐습니다.' },
  cutoff: { label: '강제 종료', sub: '물줄기가 이어지거나 물이 고인 채로 드리퍼를 뗐습니다.' },
};

// AI 공유에 담을 기록(사용자 요청 9/24: 설문 뒤 공유 화면에서 이 기록만 고를 수 있게)
export const SHARE_SCOPE_WORDS = {
  with: { label: '비교 기록 함께', sub: '직전 추출과, 레시피·원두가 같은 최근 추출을 함께 담습니다.' },
  single: { label: '이 기록만', sub: '이번 추출 하나만 담습니다.' },
};

// AI 공유 파일 형식(사용자 기준 9/23: 데이터로 저장 → JSON, AI 질문용 → MD)
export const SHARE_FORMAT_WORDS = {
  md: { label: 'MD', sub: 'AI에게 질문할 때 붙여 넣기 좋은 글 형식입니다.' },
  json: { label: 'JSON', sub: '데이터로 보관하거나 다시 가져오기 좋은 형식입니다.' },
};
const LEGACY_END_STATES = { '다 빠짐': 'drained', '물이 남은 채 종료': 'cutoff' };
export function endStateKey(v) {
  return v == null ? null : LEGACY_END_STATES[v] ?? v;
}
export function endStateLabel(v) {
  const k = endStateKey(v);
  return k == null ? null : END_STATE_WORDS[k]?.label ?? String(v);
}

// 디카페인 보조 설명(9/26 사용자 요청 — 가공 특성상 더 짙게 볶이는 구조·향미 변화·분쇄 차이. 출처: docs/agent-notes/참고 출처 목록.md 「디카페인」)
// 연구로 확인된 것(색·질량 손실·분쇄 입자)과 로스터리 안내 글 수준인 것(원두량)을 갈라 적는다.
export const DECAF_HELP = [
  '카페인을 빼는 과정(생두를 물에 불렸다가 다시 말림)에서 생두 구조가 바뀝니다. 볶을 때 수분이 일찍 빠져 열을 빨리 받습니다.',
  '같은 조건으로 볶아도 색이 더 짙게 나옵니다 — 봉투의 배전도보다 강배전처럼 보일 수 있고, 색만으로는 볶음 정도를 가늠하기 어렵습니다.',
  '카페인과 함께 향미 성분 일부가 빠져, 같은 산지의 일반 원두보다 향이 약하거나 밋밋하게 느껴질 수 있습니다.',
  '같은 그라인더 표시값에서 더 곱게 갈리고 미분이 많습니다(연구: 가운데 입자 크기 8~38µm 작음, 미분 최대 4%p 많음).',
];
// 추출 준비의 보조: 분쇄는 위 연구 차이의 가운데쯤(약 20µm) 굵게, 원두량은 로스터리 안내 글의 0.5~1g 중 작은 쪽
export const DECAF_ASSIST = { grindUm: 20, doseG: 0.5 };
