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
  serverTotal: { label: '서버 총 무게', sub: '서버 + 커피 원액' },
  // 아이스는 서버에 얼음이 들어 있으므로 원액 무게에 얼음이 함께 잡힌다
  netWeight: { label: '커피 원액 무게', sub: '서버 제외 · 아이스는 얼음 포함' },
  target: { label: '저울 누적 목표' },
  grindDial: { label: '분쇄 크기 (Click)', sub: '그라인더 다이얼 눈금' },
  grind: { label: '분쇄 크기' },
  pourMethod: { label: '드립 방법(기준)' },
  offFlavor: { label: '잡미' },
  notePerception: { label: '원두 노트', sub: '원두 노트가 느껴졌나요?' },
  myNotes: { label: '느낀 향과 맛', sub: '직접 느낀 향과 맛을 적어주세요.' },
};

// 종료 상태: 저장은 key 로 한다(단어를 바꿔도 옛 기록이 깨지지 않게). 9/24 전 기록의 한국어 값도 읽는다.
export const END_STATE_WORDS = {
  drained: { label: '모두 내려감', sub: '추출수가 모두 내려간 뒤 끝냈습니다.' },
  cutoff: { label: '강제 종료', sub: '추출수가 남은 채 시간이 되어 끊었습니다.' },
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
