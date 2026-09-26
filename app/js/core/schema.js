// NextBrew 데이터 형식 — 기록(brew)·원두(bean)·그라인더(grinder)의 모양과 표시 규칙을 이 파일 한 곳에서 정한다.
// 다른 파일은 여기서 만든 객체를 쓰고, 필드를 새로 지어내지 않는다.

// 2 = 드리퍼 등록(기록에 dripperId)·배전도 숫자(roastLevel)·분쇄 측정 모음(9/26). 옛 문서는 불러올 때 올린다(core/migrate.js)
export const SCHEMA_VERSION = 2;

export function newId(prefix, now = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${now.toString(36)}${rand}`;
}

// ── 분쇄 표기 ──────────────────────────────────────────────
// 그라인더 표시값 110, 영점 -3 → 화면 "110(-3)", 영점 반영값 107(용어 9/26 사용자 결정).
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

// 화면·공유에 보이는 숫자(9/26 사용자 요청): 소수 셋째 자리에서 반올림해 둘째 자리까지만 — 16.1 + 0.2 = 16.300000000000004 같은 끝없는 소수가 보이지 않게.
// 뒤에 0 은 붙이지 않는다(16.5 → 16.5, 250 → 250). 값이 없으면 그대로 돌려준다.
export function n2(x) {
  return typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : x;
}

export function round1(x) {
  return Math.round(x * 10) / 10;
}

// ── 고친 시각을 겹쳐 본 타이머(사용자 요청 9/25·9/26 — 누른 시각은 모두 나중에 고칠 수 있다) ──
// 앱은 늦게·일찍 누른 것을 알아챌 수 없어서, 못 누른 경우만이 아니라 모든 단계를 사후에 고친다(사용자 정정 9/26).
// 타이머 기록(timer)은 저장한 뒤 바꾸지 않는다. 결과의 두 값을 겹쳐 본다:
//   startShiftSec = [시작]을 늦게(+)·일찍(−) 누른 만큼 — 모든 누른 시각을 그만큼 옮긴다(붓기 시작이 0초)
//   stepFix = { 단계 번호: 고친 «그 단계가 끝난» 초 } — 옮긴 뒤 값 위에 단계별로 덮어쓴다
// 화면·비교·그래프·AI 공유는 모두 이것을 읽는다. 바뀐 단계는 corrected = true.
export function timerOf(b) {
  const fix = b?.result?.stepFix ?? {};
  const shift = b?.result?.startShiftSec ?? 0;
  if (!shift && !Object.keys(fix).length) return b.timer;
  const moved = (t) => (t == null ? t : round1(t + shift));
  const ends = b.timer.steps.map((s, i) => fix[i] ?? moved(s.actualEndSec));
  const steps = b.timer.steps.map((s, i) => ({
    ...s,
    actualStartSec: i === 0 ? s.actualStartSec : ends[i - 1],
    actualEndSec: ends[i],
    corrected: fix[i] != null || (shift !== 0 && s.actualEndSec != null),
  }));
  return { ...b.timer, steps, totalSec: ends[ends.length - 1] };
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
// 잡미는 안 고르면 «없음»이다(9/26 사용자 판단 — 산미처럼 «약함»과 헷갈릴 값이 없어, 안 고른 것과 없음이 같은 뜻). 「없음」 칩은 두지 않는다.
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
export const DRIPPERS = ['Hario V60 02', 'Hario V60 MUGEN 02']; // 앱 기본 드리퍼 이름 — 특징은 data/drippers.js DRIPPER_SEEDS 로 기본 목록과 잇는다(9/26)
export const FILTERS = ['표백 종이 필터', '무표백 종이 필터'];
export const POUR_METHODS = ['나선형', '센터 푸어', '원 푸어'];
export const PROCESS_TYPES = ['워시드', '내추럴']; // SCA 외재적 평가 양식의 유형. 그 밖은 직접 입력.
// 배전도(선택). 9/25 사용자 요청으로 3단계 → 5단계 슬라이더. 국내 로스터리가 봉투에 흔히 쓰는 말이다.
// 「다크 로스트」는 강배전의 영어 표현이라 따로 두지 않는다(docs/agent-notes/참고 출처 목록.md 「배전도」).
// 9/24 전 기록의 약배전·중배전·강배전은 이 목록에 그대로 있어 옛 값이 깨지지 않는다.
// 다음 추출 제안은 강배전일 때만 쓴맛을 한 단계 낮춰 본다(core/compass.js).
export const ROASTS = ['약배전', '중약배전', '중배전', '중강배전', '강배전'];
export const ROAST_TICKS = ['약', '중약', '중', '중강', '강'];
// 9/26 사용자 요청: 배전도를 0.5 단위 0.5~10 숫자로 고른다(roastLevel). 단어(roast)는 숫자에서 정한다 — 5단계 띠:
//   0.5~2 약배전 · 2.5~4 중약배전 · 4.5~6 중배전 · 6.5~8 중강배전 · 8.5~10 강배전(다음 추출 제안이 보는 값은 그대로 단어다).
// 숫자 없이 단어만 있는 9/26 전 원두는 단어를 그대로 두고 보인다(숫자를 지어 채우지 않는다).
export const ROAST_LEVEL = { min: 0.5, max: 10, step: 0.5 };
export const ROAST_LEVEL_TICKS = ROASTS.map((w, i) => [i * 2 + 1.25, ROAST_TICKS[i]]); // 띠 가운데에 단어
export function roastWordOf(level) {
  if (level == null) return '';
  return ROASTS[Math.min(4, Math.max(0, Math.ceil(level / 2) - 1))];
}
// 목록·공유에 보일 배전도: 「중배전 5.5/10」 · 옛 원두는 「중배전」
// 옛 단어에서 옮긴 숫자(roastLevelFrom 'word' — core/migrate.js)는 「약」을 붙여 정확한 값이 아님을 보인다
export function roastLabel(bean) {
  if (bean?.roastLevel != null) return `${roastWordOf(bean.roastLevel)} ${bean.roastLevelFrom === 'word' ? '약 ' : ''}${bean.roastLevel}/10`;
  return bean?.roast || '';
}

// 로스터리 맛 지표(9/26 사용자 요청): 봉투·상세 페이지의 「산미 3.5 · 단맛 4」 같은 표기. 로스터리마다 5점·10점으로 달라
// 척도를 함께 적는다(roasterProfile = { scale: 5|10, items: [{ label, value(0~scale, 0.5 단위) }] }). 별·점 표기는 개수를 적는다.
export const PROFILE_SCALES = [5, 10];
export const PROFILE_ITEMS = ['산미', '단맛', '바디', '쓴맛', '고소함', '밸런스'];
export function profileLine(p) {
  if (!p?.items?.length) return '';
  return p.items.map((it) => `${it.label} ${it.value}/${p.scale}`).join(' · ');
}
// 종료 상태는 key 로 저장한다. 화면 단어는 core/words.js END_STATE_WORDS.
export const END_STATES = ['drained', 'cutoff'];
// AI 공유 파일 형식. 기본값은 설정에서 고른다(처음 값 = md: AI에게 묻는 용도가 기본이라서).
export const SHARE_FORMATS = ['md', 'json'];
// AI 공유에 담을 기록: with = 비교 기록 함께(처음 기본), single = 단일 기록만
export const SHARE_SCOPES = ['with', 'single'];

// ── 비활성화(9/27 사용자 결정) ────────────────────────────────
// 지우지 않고 목록·비교에서만 뺀다. inactive = null(활성) | { at, reason?, note? }.
// 대상: 추출 기록(사유를 고르거나 적는다) · 드리퍼 · 그라인더 · 서버 · 분쇄 측정 · 블렌드 템플릿.
// 원두는 봉투 「모두 소비됨」이, AI 제안은 [맞추기] 단추가 같은 역할을 해서 두지 않는다. 레시피는 순서 바꾸기로 대신한다.
// 비활성 기록도 원두 남은 양에는 그대로 센다(실제로 쓴 원두라서).
export const INACTIVE_REASONS = { failed: '실패한 추출', test: '시험 추출', wrongEntry: '잘못 적은 기록' };
export const isActive = (doc) => !doc?.inactive;
export function inactiveMark({ reason = null, note = '' } = {}, now = Date.now()) {
  return { at: new Date(now).toISOString(), reason: reason && INACTIVE_REASONS[reason] ? reason : null, note: (note ?? '').trim() };
}
// 「시험 추출 · 물이 한쪽으로 쏠림」 — 사유가 없으면 빈 글
export function inactiveLine(doc) {
  const x = doc?.inactive;
  if (!x) return '';
  return [x.reason ? INACTIVE_REASONS[x.reason] : null, x.note || null].filter(Boolean).join(' · ');
}
// 고르는 목록: 활성인 것 + 지금 골라 둔 것(비활성이어도 — 이미 고른 것을 몰래 바꾸지 않게)
export function activeChoices(list, keepId = null) {
  return (list ?? []).filter((x) => isActive(x) || (keepId && x.id === keepId));
}

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
    // 블렌드 템플릿으로 섞었으면(9/26) blendId·parts[{ id, name, ratio, g }]가 붙는다(core/blend.js)
    // 봉투(9/26 B안): bagId(가리킴) + age(그때 일수 { roast, room, frozen, open, estimated } — 그때 값)
    bean: prep.bean ? { id: prep.bean.id ?? null, name: prep.bean.name, ...(prep.bean.blendId ? { blendId: prep.bean.blendId, parts: prep.bean.parts } : {}), ...(prep.bean.bagId ? { bagId: prep.bean.bagId, age: prep.bean.age ?? null } : {}) } : null,
    conditions: {
      style: prep.style, // 'iced' | 'hot'
      doseG: plan.doseG,
      hotWaterG: plan.hotWaterG,
      iceG: plan.iceG, // 실제로 넣은 얼음(준비 화면에서 잰 값)
      iceTargetG: plan.iceTargetG ?? plan.iceG, // 레시피가 권한 얼음(원두량 × 레시피 비율) — 모자란 만큼 가수로 채운다(9/25)
      tempC: prep.tempC,
      grind: prep.grind, // { grinderId, grinderName, dial, zeroOffset, um }
      dripper: prep.dripper, // 이름(드리퍼를 지웠을 때 남는 마지막 이름) — 표시는 등록값을 따른다
      dripperId: prep.dripperId ?? null, // 9/26 등록 드리퍼 ID
      filter: prep.filter,
      rinsed: prep.rinsed,
      pourMethod: prep.pourMethod,
      grindBeanState: prep.grindBeanState ?? null, // 갈 때 원두 상태 frozen|room(9/26 — 냉동한 적이 있는 봉투일 때 사용자가 고름)
    },
    timer, // core/timer.js summarize() 결과
    result: {
      endState: null,
      actualWaterG: null, // null = 계획대로
      actualPourMethod: null, // null = 계획대로
      dilutionG: plan.dilutionG ?? 0, // 가수(추출 후 추가한 물). 처음 값 = 계획(레시피 가수 + 얼음이 모자란 만큼)
      serverWeightG: null, // 선택: 가수 전 총무게(서버 자체 무게 + 커피 + 얼음). null = 재지 않음
      serverAfterG: null, // 선택: 가수 후 총무게(서버 포함). 가수 전과 함께 있으면 가수 = 둘의 차이(9/25)
      serverOff: false, // 「서버 무게 재기」를 끈 기록. 처음 값은 켜짐(9/25 사용자 요청)
      server: null, // 선택: 잰 서버 { id(등록한 서버면), name, tareG(서버 자체 무게) } — 등록값을 복사해 둔다
    },
    survey: null,
    followedAdvice: prep.followedAdvice ?? null, // 9/26 이 추출이 따른 AI 제안(core/adviceImport.js followRecord) — 없으면 null
    inactive: null, // 9/27 비활성화 { at, reason(INACTIVE_REASONS 키|null), note } — 비교·제안에서 빠진다(isActive)
    updatedAt: new Date(now).toISOString(),
  };
}

export function createBean(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('bean', now),
    name: '',
    nameAuto: true, // 이름 = 국가·지역·생산자·품종·가공방식을 이어 붙인 것(9/25 사용자 요청, 처음 값). false = 직접 적은 이름
    roaster: '',
    country: '',
    region: '',
    producer: '', // 농장·생산자
    variety: '', // 품종
    process: '', // 가공방식
    roast: '', // 배전도 단어(ROASTS 중 하나, 선택) — roastLevel 이 있으면 거기서 정한다
    roastLevel: null, // 배전도 숫자 0.5~10(0.5 단위, 9/26)
    decaf: false, // 디카페인(9/26) — 추출 준비에서 분쇄·원두량 보조 안내
    roasterProfile: null, // 로스터리 맛 지표(9/26) { scale, items: [{ label, value }] }
    notes: [], // 로스터리가 표기한 노트
    blend: null, // 9/26 블렌드 — null = 싱글 오리진, { by: 'roaster'|'me', parts } (core/blend.js)
    memo: '',
    // 구매 무게·제조일·개봉일·상태는 봉투(createBag)에 둔다(9/26 B안 — 같은 원두를 여러 봉 산다)
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}

// ── 원두 이름·남은 양·날짜(9/25 사용자 요청) ─────────────────────
// 원두 품명은 흔히 «국가 지역 생산자 품종 가공방식» 순으로 붙인다(예: 에티오피아 예가체프 첼바 G1 워시드).
export function beanAutoName(b) {
  return [b.country, b.region, b.producer, b.variety, b.process].map((v) => (v ?? '').trim()).filter(Boolean).join(' ');
}
// 9/25 전에 등록한 원두는 nameAuto 가 없다 — 직접 적은 이름을 지키려고 «직접»으로 본다
export function beanNameIsAuto(b) {
  return b.nameAuto === true;
}

// 구매 무게 단위. oz·lb 는 국제 상용 단위의 정의값(1 oz = 28.349523125 g, 1 lb = 453.59237 g).
export const BEAN_UNITS = { g: { label: 'g', grams: 1 }, kg: { label: 'kg', grams: 1000 }, oz: { label: 'oz', grams: 28.349523125 }, lb: { label: 'lb', grams: 453.59237 } };
export function purchasedGrams(b) {
  const p = b?.purchased;
  if (!p || p.amount == null || !BEAN_UNITS[p.unit]) return null;
  return round1(p.amount * BEAN_UNITS[p.unit].grams);
}

// ── 원두 봉투(9/26 사용자 결정 B안) ─────────────────────────────
// 원두 = 제품 정보(이름·산지·가공·배전도·노트 …), 봉투 = 실제로 산 한 봉(무게·제조일·보관 상태·개봉일·얼린 날·꺼낸 날).
// 같은 원두를 여러 봉 샀으면 봉투만 늘린다. 「소분」 항목은 따로 두지 않는다 — 봉투마다 무게를 적고 [이 봉투 복사해 추가](사용자 제안대로 간소화).
// 남은 양은 봉투마다 센다: 구매 무게 − 이 봉투로 내린 기록의 원두량 − 이 봉투에서 덜어 섞은 무게(블렌드). 기록 없이 쓴 양·흘린 양은 모른다(추정).
export const LOW_BEAN_G = 10; // 이 값 이하이면 «거의 다 씀» 알림(사용자 요청 9/25)
export const BAG_STATES = { inUse: '사용 중', inUseFrozen: '사용 중(냉동)', stored: '보관 중(실온)', frozen: '보관 중(냉동)', consumed: '모두 소비됨' };
export const BAG_PICK_ORDER = ['inUse', 'inUseFrozen', 'stored', 'frozen']; // 준비 화면이 봉투를 자동으로 고르는 순서(사용 중 → 보관 중)
export const inFreezer = (bag) => bag?.state === 'frozen' || bag?.state === 'inUseFrozen';
const opened = (state) => state === 'inUse' || state === 'inUseFrozen';

export function createBag(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('bag', now),
    beanId: null,
    purchased: null, // 구매 무게 { amount, unit(BEAN_UNITS 키) } — 남은 양의 출발점
    roastedOn: null, // 제조일(로스팅일) 'YYYY-MM-DD'
    roastedOnFrom: null, // 소비기한에서 거꾸로 셌으면 { bestBefore, months } — 화면에 «추정»
    state: 'stored', // BAG_STATES 키
    openedOn: null, // 개봉일
    freezes: [], // 냉동실에 있던 기간 [{ on, off }] — off = null 이면 아직 냉동실. 다시 얼리면 한 줄 더
    consumedAt: null, // 모두 소비됨으로 바꾼 때
    stateBefore: null, // 모두 소비됨 전 상태(되돌릴 때)
    note: '',
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}

// 상태를 바꾸며 날짜를 맞춘다(봉투 객체를 바꾼다): 개봉 → 개봉일(비었으면), 냉동실에 넣음 → 얼린 날, 꺼냄 → 꺼낸 날,
// 모두 소비됨 → 소비한 때와 전 상태. day = 'YYYY-MM-DD'(보통 오늘), nowIso = 소비한 때
export function setBagState(bag, next, day, nowIso = new Date().toISOString()) {
  const prev = bag.state;
  if (!BAG_STATES[next] || next === prev) return bag;
  if (next === 'consumed') return Object.assign(bag, { state: next, stateBefore: prev, consumedAt: nowIso });
  const from = prev === 'consumed' ? bag.stateBefore ?? 'inUse' : prev;
  if (prev === 'consumed') Object.assign(bag, { consumedAt: null, stateBefore: null });
  if (opened(next) && !bag.openedOn) bag.openedOn = day;
  const wasIn = inFreezer({ state: from });
  const nowIn = inFreezer({ state: next });
  bag.freezes = [...(bag.freezes ?? [])];
  if (!wasIn && nowIn) bag.freezes.push({ on: day, off: null });
  if (wasIn && !nowIn) {
    const last = bag.freezes[bag.freezes.length - 1];
    if (last && !last.off) bag.freezes[bag.freezes.length - 1] = { ...last, off: day };
  }
  bag.state = next;
  return bag;
}

// 두 날('YYYY-MM-DD') 사이 날 수
export function daysBetween(a, b) {
  const x = parseDay(a);
  const y = parseDay(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
}
const dayOf = (ms) => formatDay(new Date(ms));
// 봉투 일수(9/26 사용자 결정 — 로스팅 후 일수를 실온·냉동으로 나눠 적는다, 환산 비율은 두지 않는다):
// { roast(로스팅 후), frozen(냉동실에 있던 날), room(= roast − frozen), open(개봉 후), estimated(제조일을 소비기한에서 셈) }
// 모두 소비됨이면 그때에서 멈춘다. at = 기준 시각(기록이면 그 추출 시각)
export function bagDays(bag, at = Date.now()) {
  if (!bag) return null;
  const endMs = bag.state === 'consumed' && bag.consumedAt ? Math.min(Date.parse(bag.consumedAt), at) : at;
  const end = dayOf(endMs);
  const roast = bag.roastedOn ? daysBetween(bag.roastedOn, end) : null;
  const frozen = (bag.freezes ?? []).reduce((sum, f) => {
    if (!f.on || f.on > end) return sum;
    const d = daysBetween(f.on, f.off && f.off < end ? f.off : end);
    return sum + (d > 0 ? d : 0);
  }, 0);
  const open = bag.openedOn && bag.openedOn <= end ? daysBetween(bag.openedOn, end) : null;
  return { roast: roast != null && roast >= 0 ? roast : null, frozen, room: roast != null && roast >= 0 ? Math.max(0, roast - frozen) : null, open, estimated: Boolean(bag.roastedOnFrom) };
}

export function bagStock(bag, brews, beans = []) {
  const total = purchasedGrams(bag);
  let usedG = 0;
  let count = 0;
  for (const x of brews ?? []) {
    if (x.bean?.bagId === bag.id) {
      usedG += Number(x.conditions?.doseG) || 0;
      count += 1;
    } else {
      const part = x.bean?.parts?.find((p) => p.bagId === bag.id);
      if (part) {
        usedG += Number(part.g) || 0;
        count += 1;
      }
    }
  }
  // 이 봉투에서 덜어 미리 섞은 블렌드(원두 등록의 「내가 섞은 블렌드」)
  const mixedG = round1((beans ?? []).filter((o) => o.blend?.by === 'me').reduce((a, o) => a + (o.blend.parts ?? []).filter((p) => p.bagId === bag.id).reduce((s2, p) => s2 + (Number(p.g) || 0), 0), 0));
  usedG = round1(usedG);
  const remainingG = total == null ? null : round1(total - usedG - mixedG);
  return { totalG: total, usedG, brews: count, mixedG, remainingG, low: remainingG != null && remainingG <= LOW_BEAN_G && bag.state !== 'consumed' };
}

// 이 원두의 봉투들(자동으로 고르는 순서 → 같은 상태면 제조일이 이른 것 먼저)
export function beanBags(beanId, bags) {
  const rank = (g) => (g.state === 'consumed' ? 9 : BAG_PICK_ORDER.indexOf(g.state));
  return (bags ?? []).filter((g) => g.beanId === beanId).sort((a, b) => rank(a) - rank(b) || String(a.roastedOn ?? '').localeCompare(String(b.roastedOn ?? '')));
}
// 준비 화면이 자동으로 고를 봉투: 사용 중 → 사용 중(냉동) → 보관 중(실온) → 보관 중(냉동)
export function activeBag(beanId, bags) {
  return beanBags(beanId, bags).find((g) => g.state !== 'consumed') ?? null;
}
// 원두 전체: 봉투마다 남은 양 + 상태별 봉투 수. 봉투가 모두 «모두 소비됨»이면 consumed(소비된 원두 칸으로)
export function beanStock(bean, brews, beans = [], bags = []) {
  const mine = beanBags(bean.id, bags).map((g) => ({ bag: g, ...bagStock(g, brews, beans) }));
  const live = mine.filter((e) => e.bag.state !== 'consumed');
  const known = live.filter((e) => e.remainingG != null);
  const counts = {};
  for (const e of mine) counts[e.bag.state] = (counts[e.bag.state] ?? 0) + 1;
  return {
    bags: mine,
    counts,
    remainingG: known.length ? round1(known.reduce((a, e) => a + Math.max(0, e.remainingG), 0)) : null,
    brews: mine.reduce((a, e) => a + e.brews, 0),
    consumed: mine.length > 0 && !live.length,
    low: live.some((e) => e.low),
  };
}

// 날짜: 'YYYY-MM-DD' 를 그 나라 시간의 자정으로 읽는다(UTC 로 읽으면 하루가 밀린다)
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function formatDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function daysSince(day, now = Date.now()) {
  const d = parseDay(day);
  if (!d) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((today - d) / 86400000);
}
// 소비기한에서 제조일을 거꾸로 센다. 기간은 로스터리마다 다르다(6개월~2년 — 참고 출처 목록 「원두 소비기한」). 처음 값 12개월.
export const DEFAULT_SHELF_MONTHS = 12;
export function shiftMonths(day, months) {
  const d = parseDay(day);
  if (!d) return null;
  const r = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  // 달 끝 보정: 3/31 에서 1개월 전이 3/3 이 되지 않게(날짜가 넘치면 그 달 마지막 날)
  if (r.getDate() !== d.getDate()) r.setDate(0);
  return formatDay(r);
}
export function roastedFromBestBefore(bestBefore, months = DEFAULT_SHELF_MONTHS) {
  if (!months) return null;
  return shiftMonths(bestBefore, -months);
}

// 서버 뺀 무게 = 서버 총 무게 − 서버 자체 무게. 둘 중 하나라도 없으면 null.
export function netServerWeight(result) {
  const total = result?.serverWeightG;
  const tare = result?.server?.tareG;
  if (total == null || tare == null) return null;
  return round1(total - tare);
}

// 가수 = 가수 후 총무게 − 가수 전 총무게(둘 다 서버 포함이라 서버 무게는 지워진다). 둘 중 하나라도 없으면 null.
export function measuredDilution(result) {
  if (result?.serverWeightG == null || result?.serverAfterG == null) return null;
  return round1(result.serverAfterG - result.serverWeightG);
}

// 가수와 원두·물 비율(9/25 사용자 요청).
// 물 합계 = 실제 부은 뜨거운 물 + 넣은 얼음 + 가수.  계획 합계 = 계획 뜨거운 물 + 레시피가 권한 얼음 + 레시피 가수.
// 얼음은 추출이 아니라 식히고 묽히는 몫이라, 얼음이 모자라거나 물을 덜 부었으면 그만큼을 추출 뒤 가수로 채우면 계획 비율이 된다.
// needG = 계획 비율이 되려면 가수가 모두 몇 g 이어야 하나(음수면 가수 없이도 이미 계획보다 연하다), moreG = 지금 가수에서 더 넣을 양.
export function dilutionView(b) {
  const c = b.conditions;
  const r = b.result ?? {};
  const iced = c.style !== 'hot';
  const hot = r.actualWaterG ?? c.hotWaterG;
  const ice = iced ? c.iceG ?? 0 : 0;
  const iceTarget = iced ? c.iceTargetG ?? c.iceG ?? 0 : 0;
  // 가수는 result.dilutionG 가 원본이다(9/26 — 무게 칸끼리 서로 따라 바뀌게 하면서). 9/26 전 기록은 두 무게가 있으면 그 차이.
  const legacy = r.lastWeighed == null ? measuredDilution(r) : null;
  const dilutionG = legacy ?? r.dilutionG ?? 0;
  // 추출 뒤 더 넣은 얼음(아이스, 켰을 때만) — 녹으면 물이 되므로 비율에 넣는다
  const iceAddedG = iced && r.iceAddedOn ? r.iceAddedG ?? 0 : 0;
  const targetWaterG = c.hotWaterG + iceTarget + (b.recipe?.snapshot?.dilutionG ?? 0);
  const needG = round1(targetWaterG - hot - ice);
  const now = hot + ice + dilutionG + iceAddedG;
  return {
    dilutionG,
    iceAddedG,
    measured: legacy != null || (r.lastWeighed === 'after' && r.serverWeightG != null && r.serverAfterG != null),
    waterNowG: round1(now),
    ratioNow: now / c.doseG,
    targetWaterG,
    ratioTarget: targetWaterG / c.doseG,
    needG,
    moreG: round1(needG - dilutionG - iceAddedG),
  };
}

// 추출 뒤 무게 칸 연동(사용자 요청 9/26): 가수 전 총무게 + 가수 = 가수 후 총무게, 가수 후 총무게 + 추가 얼음 = 얼음 넣은 뒤 총무게.
// 어느 칸을 고쳐도 나머지가 따라 바뀌고 칸은 사라지지 않는다. 마지막에 손댄 쪽(lastWeighed · iceLastWeighed)이 원본이다:
//   가수를 고치면 가수 후 총무게를 계산, 가수 후 총무게를 고치면 가수를 계산. 가수 전 총무게를 나중에 넣으면 원본 쪽을 지킨다.
// 돌려주는 것은 바꿀 칸들 { 칸: 값 } — 부르는 쪽이 저장한다.
export function linkWeights(result, key, value, { iceOn = false } = {}) {
  const r = { ...result, [key]: value };
  if (key === 'dilutionG') r.lastWeighed = 'dilution';
  if (key === 'serverAfterG' && value != null) r.lastWeighed = 'after';
  if (key === 'iceAddedG') r.iceLastWeighed = 'ice';
  if (key === 'serverAfterIceG' && value != null) r.iceLastWeighed = 'after';
  const A = r.serverWeightG;
  if (A != null) {
    if (r.lastWeighed === 'after' && r.serverAfterG != null) r.dilutionG = Math.max(0, round1(r.serverAfterG - A));
    else r.serverAfterG = round1(A + (r.dilutionG ?? 0));
  }
  if (iceOn && r.serverAfterG != null) {
    if (r.iceLastWeighed === 'after' && r.serverAfterIceG != null) r.iceAddedG = Math.max(0, round1(r.serverAfterIceG - r.serverAfterG));
    else r.serverAfterIceG = round1(r.serverAfterG + (r.iceAddedG ?? 0));
  }
  const changed = {};
  for (const k of ['serverWeightG', 'dilutionG', 'serverAfterG', 'iceAddedG', 'serverAfterIceG', 'lastWeighed', 'iceLastWeighed']) {
    if (r[k] !== result[k]) changed[k] = r[k];
  }
  return changed;
}

// 서버(추출 받는 그릇): 이름과 자체 무게(g). 결과 화면에서 총 무게에서 빼는 데 쓴다.
export function createServer(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('server', now),
    name: '',
    tareG: null,
    inactive: null, // 9/27 비활성화 { at } — 결과 화면의 서버 목록에서 빠진다
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}

// 서버 지우기(9/27 사용자 결정): 그 서버를 쓴 기록은 서버 ID 만 떼고 이름·자체 무게를 그대로 둔다 —
// 「등록 없이 무게만 적기」로 적은 것과 같아져 결과 수정에서 고칠 수 있고, 등록 서버를 고쳐도 더는 따라가지 않는다.
// → 바꾼 기록들(사본). 원본 기록은 건드리지 않는다.
export function detachServer(brews, serverId) {
  return (brews ?? [])
    .filter((b) => serverId && b.result?.server?.id === serverId)
    .map((b) => {
      const c = structuredClone(b);
      c.result.server = { ...c.result.server, id: null, fromServerId: serverId };
      return c;
    });
}

// 드리퍼(9/26 신설): 이름만. 기록은 ID 로 가리키고 이름은 등록값을 따른다(core/migrate.js syncRefs)
// 드리퍼(9/26): 기본 목록(data/drippers.js)·AI 답·직접 입력 모두 같은 칸을 쓴다(사용자 결정 — 형식 통일). 모르는 칸은 null.
export function createDripper(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('dripper', now),
    name: '',
    catalogKey: null, // 기본 목록에서 왔으면 그 키
    brand: null,
    model: null,
    size: null, // 01·02·155 처럼 모델 안의 크기
    cups: null, // 잔 수·용량(출처 표기 그대로)
    shape: null, // DRIPPER_SHAPES 키
    method: null, // DRIPPER_METHODS 키
    holes: null,
    ribs: null,
    material: null, // 이 드리퍼의 재질(기본 목록에 여러 가지면 고른 것)
    filter: null,
    note: '', // 특징·메모
    sources: [], // [{ kind(maker|seller|ai|user), label, url, checkedAt }]
    inactive: null, // 9/27 비활성화 { at } — 추출 준비의 드리퍼 목록에서 빠진다
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}

// 분쇄 측정(9/26 — 원두마다 분쇄가 다르다고 보아 원두별로 모은다): { beanId, grinderId, 측정 값…, photo(계정 저장일 때만) }.
// 기록에는 사진을 뺀 사본과 measurementId 를 둔다(사진은 이 문서에만 — Firestore 문서 한도 1MiB).
export function createMeasurement(fields = {}, now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id ?? newId('measure', now),
    beanId: null,
    grinderId: null,
    inactive: null, // 9/27 비활성화 { at } — 추출 준비의 「이 원두 측정」 안내에서 빠진다(지우기 대신)
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
    inactive: null, // 9/27 비활성화 { at } — 추출 준비의 그라인더 목록에서 빠진다
    ...fields,
    updatedAt: new Date(now).toISOString(),
  };
}
