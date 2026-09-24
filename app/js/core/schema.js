// NextBrew 데이터 형식 — 기록(brew)·원두(bean)·그라인더(grinder)의 모양과 표시 규칙을 이 파일 한 곳에서 정한다.
// 다른 파일은 여기서 만든 객체를 쓰고, 필드를 새로 지어내지 않는다.

export const SCHEMA_VERSION = 1;

export function newId(prefix, now = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${now.toString(36)}${rand}`;
}

// ── 분쇄 표기 ──────────────────────────────────────────────
// 다이얼 110, 영점 -3 → 화면 "110(-3)", 실제 위치 107.
// 영점은 그라인더마다 저장하고, 기록에는 그때의 영점을 복사해 둔다(나중에 영점을 바꿔도 옛 기록은 그대로).
export function grindActual(dial, zeroOffset = 0) {
  if (dial == null) return null;
  return dial + (zeroOffset || 0);
}

export function formatGrind(dial, zeroOffset = 0) {
  if (dial == null) return '—';
  if (!zeroOffset) return String(dial);
  return `${dial}(${zeroOffset > 0 ? '+' : ''}${zeroOffset})`;
}

// ── 시간 표기 ──────────────────────────────────────────────
// 저장은 늘 초(숫자), 화면에서만 "m:ss". "1:55"(시간)와 "1:7.5"(비율)가 섞이는 일을 막기 위해서다.
export function formatSec(sec) {
  if (sec == null || Number.isNaN(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDelta(sec) {
  const s = Math.round(sec);
  return `${s > 0 ? '+' : s < 0 ? '−' : '±'}${Math.abs(s)}초`;
}

export function round1(x) {
  return Math.round(x * 10) / 10;
}

// ── 누른 시각 판정 ─────────────────────────────────────────
// 레시피 시각과 실제로 누른 시각의 차이. ±2초 이내는 사람 손의 편차로 보고 「제때」(비교표와 같은 기준). 단어는 사용자 결정 9/24.
export const TIME_TOLERANCE_SEC = 2;
export function timingVerdict(deltaSec) {
  const s = Math.round(deltaSec);
  if (Math.abs(s) <= TIME_TOLERANCE_SEC) return { kind: 'ok', text: '제때' };
  return s < 0 ? { kind: 'early', text: `${-s}초 일찍` } : { kind: 'late', text: `${s}초 늦게` };
}

// ── 설문 척도 ─────────────────────────────────────────────
// 강도: 왼쪽 끝이 「없음」인 한 방향 척도. null = 선택 안 함(가운데 값으로 저장하지 않는다).
export const INTENSITY_WORDS = ['없음', '약함', '보통', '강함', '매우 강함'];
// 만족도: 가운데가 「보통」인 양방향 척도.
export const LIKING_WORDS = ['매우 아쉬움', '아쉬움', '보통', '좋음', '매우 좋음'];

// 순서 = 사용자가 맛을 느끼는 순서(쓴맛 → 바디감 → 단맛 → 산미). 통상 순서가 아니라 개인화 기준(사용자 결정 9/24).
export const SURVEY_ITEMS = [
  { key: 'bitterness', label: '쓴맛', scale: 'intensity', kinds: [] },
  { key: 'body', label: '바디감', scale: 'intensity', kinds: ['부드러운', '시럽 같은', '기름진', '거친'] },
  { key: 'sweetness', label: '단맛', scale: 'intensity', kinds: [] },
  { key: 'acidity', label: '산미', scale: 'intensity', kinds: ['상큼한', '시큼한'] },
];

// 잡미: 강도 척도 대신 고르는 칩. 영문 통상어 + 괄호 한국어 묘사.
export const OFF_FLAVORS = [
  'Chalky (가루 섞인 느낌)',
  'Mouth-Drying (입안이 마르는)',
  'Metallic (금속성)',
  'Musty/Earthy (퀴퀴한·흙냄새)',
  'Chemical (화학적인)',
  'Woody (나무 같은)',
];

// 원두 노트 체감: 등록된 노트마다 셋 중 하나.
export const NOTE_PERCEPTION = ['느껴짐', '약하게', '안 느껴짐'];

// 내 표현 칩(향미 계열). 직접 입력도 받는다.
export const FLAVOR_CHIPS = ['꽃', '베리', '감귤', '말린 과일', '초콜릿·코코아', '견과', '캐러멜·흑설탕', '향신료', '곡물·구운'];

export function emptySurvey() {
  const items = {};
  for (const it of SURVEY_ITEMS) items[it.key] = { level: null, kinds: [], note: '' };
  return {
    items,
    offFlavors: [],
    offFlavorNote: '',
    notePerception: {}, // { '노트 이름': '느껴짐' | '약하게' | '안 느껴짐' }
    myNotes: [],
    liking: null,
    extraNote: '',
    answeredAt: null,
  };
}

// ── 준비 화면 선택지(초기 목록 — 조사 후 보강 예정, 직접 입력 가능) ──
export const DRIPPERS = ['Hario V60 02', 'Hario V60 MUGEN 02'];
export const FILTERS = ['표백 종이 필터', '무표백 종이 필터'];
export const POUR_METHODS = ['나선형', '센터 푸어', '원 푸어'];
export const PROCESS_TYPES = ['워시드', '내추럴']; // SCA 외재적 평가 양식의 유형. 그 밖은 직접 입력.
// 배전도(선택, 사용자 결정 9/24 — 언스페셜티 브루잉 가이드의 배전도 구분 참고). 다음 추출 제안에서 강배전의 쓴맛을 한 단계 낮춰 본다.
export const ROASTS = ['약배전', '중배전', '강배전'];
// 종료 상태는 key 로 저장한다. 화면 단어는 core/words.js END_STATE_WORDS.
export const END_STATES = ['drained', 'cutoff'];
// AI 공유 파일 형식. 기본값은 설정에서 고른다(처음 값 = md: AI에게 묻는 용도가 기본이라서).
export const SHARE_FORMATS = ['md', 'json'];
// AI 공유에 담을 기록: with = 비교 기록 함께(처음 기본), single = 이 기록만
export const SHARE_SCOPES = ['with', 'single'];

// ── 기록(brew) ────────────────────────────────────────────
// 추출 타이머 부분(timer)은 저장한 뒤 바꾸지 않는다. 결과 보정(result)과 설문(survey)만 고친다.
// id 는 추출을 시작할 때 만든다 — 시작·단계·취소 로그가 같은 id 로 묶이게 하기 위해서다.
export function createBrew({ id = null, recipe, plan, prep, timer, now = Date.now() }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: id ?? newId('brew', now),
    createdAt: new Date(now).toISOString(),
    recipe: {
      id: recipe.id,
      name: recipe.name,
      snapshot: structuredClone(recipe), // 레시피를 나중에 고쳐도 이 기록은 그때 그대로
    },
    bean: prep.bean ? { id: prep.bean.id ?? null, name: prep.bean.name } : null,
    conditions: {
      style: prep.style, // 'iced' | 'hot'
      doseG: plan.doseG,
      hotWaterG: plan.hotWaterG,
      iceG: plan.iceG,
      tempC: prep.tempC,
      grind: prep.grind, // { grinderId, grinderName, dial, zeroOffset, um }
      dripper: prep.dripper,
      filter: prep.filter,
      rinsed: prep.rinsed,
      pourMethod: prep.pourMethod,
    },
    timer, // core/timer.js summarize() 결과
    result: {
      endState: null,
      actualWaterG: null, // null = 계획대로
      actualPourMethod: null, // null = 계획대로
      dilutionG: plan.dilutionG ?? 0, // 가수(추출 후 추가한 물)
      serverWeightG: null, // 선택: 서버 총 무게(서버 자체 무게 + 커피 + 얼음). null = 재지 않음
      server: null, // 선택: 잰 서버 { id(등록한 서버면), name, tareG(서버 자체 무게) } — 등록값을 복사해 둔다
    },
    survey: null,
    updatedAt: new Date(now).toISOString(),
  };
}

export function createBean(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('bean', now),
    name: '',
    roaster: '',
    country: '',
    region: '',
    producer: '', // 농장·생산자
    variety: '', // 품종
    process: '', // 가공 방식
    roast: '', // 배전도(ROASTS 중 하나, 선택)
    notes: [], // 로스터리가 표기한 노트
    memo: '',
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}

// 서버 뺀 무게 = 서버 총 무게 − 서버 자체 무게. 둘 중 하나라도 없으면 null.
export function netServerWeight(result) {
  const total = result?.serverWeightG;
  const tare = result?.server?.tareG;
  if (total == null || tare == null) return null;
  return round1(total - tare);
}

// 서버(추출 받는 그릇): 이름과 자체 무게(g). 결과 화면에서 총 무게에서 빼는 데 쓴다.
export function createServer(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('server', now),
    name: '',
    tareG: null,
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}

export function createGrinder(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('grinder', now),
    name: '',
    zeroOffset: 0,
    umPerClick: null, // 한 클릭에 분쇄가 몇 µm 바뀌나(선택). 비우면 기록의 참고 µm 로 추정한다(core/compass.js)
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}
