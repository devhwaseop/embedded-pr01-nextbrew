// AI 제안 가져오기(사용자 요청 9/25 — 레시피 가져오기처럼 AI 답을 JSON 으로 받아 다음 추출 값을 앱에 넣는다).
//
// 흐름(사용자 결정 9/25 「둘 다」):
//   ① AI 공유의 처음 프롬프트에 이 형식을 넣고, 결론이 나면 AI 가 한 번만 「앱에 넣을 결과를 드릴까요?」라고 묻게 한다.
//   ② 대화가 길어져 AI 가 형식을 잊었으면 기록 화면의 [결과 받기 프롬프트 복사]로 다시 요청한다.
//   ③ AI 가 준 JSON 을 기록 화면 「AI 제안」 칸에 붙여 넣거나 파일로 불러오면, 너그럽게 읽고(core/looseJson.js) 검사한 뒤 기록에 저장한다.
//   ④ 다음 추출 준비 화면에서 [AI 제안대로 맞추기]로 값을 채운다.
// 값은 «다음 추출에 쓸 값»(바꾼 뒤의 값)으로 받는다 — 「몇 클릭 굵게」처럼 차이로 받으면 그라인더마다 다이얼 방향이 달라 틀리기 쉽다.

import { readLooseJson, fieldReaders } from './looseJson.js';

export const ADVICE_FORMAT = 'nextbrew-advice';
export const ADVICE_FORMAT_VERSION = 1;
export const ADVICE_ITEMS = { grind: '분쇄', dose: '원두량', water: '뜨거운 물', temp: '물 온도', other: '그 밖' };
export const CONFIDENCE_WORDS = { low: '낮음', medium: '보통', high: '높음' };
// 다음 값의 허용 범위(레시피 가져오기와 같은 범위) · 이만큼 넘게 바뀌면 AI 가 잘못 옮겼을 수 있어 경고한다
const RANGE = { grindDial: [0, 999], doseG: [1, 100], hotWaterG: [10, 3000], tempC: [50, 100] };
const BIG_JUMP = { grindDial: 20, doseG: 3, tempC: 5 };
const NEXT_WORDS = { grindDial: '분쇄 다이얼', doseG: '원두량', hotWaterG: '뜨거운 물', tempC: '물 온도' };

// 이 기록의 지금 값(비교·경고의 기준)
export function currentValues(brew) {
  const c = brew?.conditions ?? {};
  return {
    grindDial: c.grind?.dial ?? null,
    doseG: c.doseG ?? null,
    hotWaterG: brew?.result?.actualWaterG ?? c.hotWaterG ?? null,
    tempC: c.tempC ?? null,
  };
}

// 프롬프트에 넣는 예시(값은 예시). 테스트가 «예시 → 검사 → 오류 0»을 확인한다.
export const ADVICE_EXAMPLE = {
  format: ADVICE_FORMAT,
  version: ADVICE_FORMAT_VERSION,
  brewId: 'brew_예시',
  summary: '단맛은 괜찮았지만 끝에 시큼함이 남아 조금 덜 추출된 것으로 보입니다.',
  good: ['바디감이 적당함'],
  issues: ['산미가 시큼함(강함)'],
  next: { grindDial: 110, doseG: 16, hotWaterG: 150, tempC: 92 },
  changes: [
    { item: 'grind', text: '시큼함이 강해(맛 설문 산미) 다이얼을 112 → 110 으로 조금 가늘게' },
    { item: 'temp', text: '같은 이유로 물 온도를 91 → 92℃ 로 1도 올림' },
  ],
  questions: [],
  confidence: 'medium',
};

// 처음 프롬프트와 결과 받기 프롬프트가 함께 쓰는 형식 설명
export function adviceFormatText() {
  return [
    `## 앱에 넣을 결과 형식 (${ADVICE_FORMAT} v${ADVICE_FORMAT_VERSION})`,
    '- JSON 하나만 코드 블록(```json … ```)에 넣어 주세요. 주석은 쓰지 말고, 숫자에는 단위를 붙이지 않습니다.',
    '- "brewId": 파일에 적힌 「이번 추출」의 기록 ID 를 그대로 적습니다.',
    '- "next": 다음 추출에 쓸 값입니다(바꿀 양이 아니라 바꾼 뒤의 값). 바꾸지 않는 값은 이번 값을 그대로, 모르면 null.',
    '  - "grindDial": 그라인더에 보이는 다이얼 숫자(파일의 분쇄 크기에서 괄호 앞 숫자, 영점을 더하기 전).',
    '  - "doseG": 원두량(g) · "hotWaterG": 뜨거운 물(g) · "tempC": 물 온도(℃).',
    `- "changes": 바꾸는 것마다 { "item": "${Object.keys(ADVICE_ITEMS).join('|')}", "text": "무엇을 왜 — 기록의 어떤 값이 근거인지" }.`,
    '- "summary": 이번 추출 평가 한두 문장 · "good"·"issues": 잘 된 점·아쉬운 점 목록.',
    '- "questions": 판단에 더 필요한 정보(없으면 []) · "confidence": "low"|"medium"|"high".',
    '',
    '예시(값은 예시입니다):',
    '```json',
    JSON.stringify(ADVICE_EXAMPLE, null, 2),
    '```',
  ].join('\n');
}

// 대화 끝에 따로 보내는 짧은 프롬프트(AI 가 형식을 잊었을 때)
export function adviceResultPrompt() {
  return ['지금까지의 결론을 NextBrew 앱에 넣을 수 있게 아래 형식의 JSON 하나로 주세요. 설명 글은 코드 블록 밖에 짧게만 써 주세요.', '', adviceFormatText()].join('\n');
}

export function readAdviceText(text) {
  return readLooseJson(text, '기록 화면의 [결과 받기 프롬프트 복사]로 AI 에게 다시 요청해 주세요');
}

// 검사 → { advice, errors, warnings }. brew = 붙여 넣는 기록(없으면 brewId 대조와 크게 바뀐 값 경고를 건너뛴다).
export function validateAdvice(raw, { brew = null, now = Date.now() } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { advice: null, errors: ['JSON 이 객체({ … })가 아닙니다.'], warnings };
  const { num, text, list, inRange } = fieldReaders(err, warn);

  if (raw.format !== ADVICE_FORMAT) warn(`format: "${ADVICE_FORMAT}" 가 아닙니다(${JSON.stringify(raw.format ?? null)}). 앱의 프롬프트로 받은 답인지 확인해 주세요.`);
  if (typeof raw.version === 'number' && raw.version > ADVICE_FORMAT_VERSION) err(`version: ${raw.version} — 이 앱보다 새 형식입니다.`);

  const brewId = text(raw.brewId, 'brewId', 80);
  if (brew && brewId && brewId !== brew.id) err(`brewId: 다른 기록의 답입니다(${brewId}). 그 기록 화면에서 붙여 넣어 주세요.`);
  if (brew && !brewId) warn('brewId: 비어 있어 이 기록의 답인지 확인하지 못했습니다.');

  const next = {};
  const rawNext = raw.next && typeof raw.next === 'object' && !Array.isArray(raw.next) ? raw.next : null;
  if (!rawNext) err('next: 다음 추출 값({ grindDial, doseG, hotWaterG, tempC })이 없습니다.');
  const cur = currentValues(brew);
  for (const k of Object.keys(RANGE)) {
    let v = rawNext ? num(rawNext[k], `next.${k}`) : null;
    if (v != null && k === 'grindDial' && !Number.isInteger(v)) {
      warn(`next.grindDial: ${v} 를 ${Math.round(v)} 로 반올림했습니다(다이얼은 정수).`);
      v = Math.round(v);
    }
    next[k] = inRange(v, `next.${k}`, RANGE[k][0], RANGE[k][1], NEXT_WORDS[k]);
    if (brew && next[k] != null && cur[k] != null && BIG_JUMP[k] && Math.abs(next[k] - cur[k]) > BIG_JUMP[k]) {
      warn(`next.${k}: 이번 ${cur[k]} → ${next[k]} 로 크게 바뀝니다. AI 가 값을 잘못 옮기지 않았는지 확인해 주세요.`);
    }
  }
  if (brew && next.hotWaterG != null && cur.hotWaterG && Math.abs(next.hotWaterG - cur.hotWaterG) / cur.hotWaterG > 0.2) {
    warn(`next.hotWaterG: 이번 ${cur.hotWaterG}g → ${next.hotWaterG}g 로 20% 넘게 바뀝니다. 값을 확인해 주세요.`);
  }
  if (rawNext && Object.values(next).every((v) => v == null)) err('next: 값이 하나도 없습니다.');

  const changes = [];
  if (raw.changes != null && !Array.isArray(raw.changes)) err('changes: 목록([ … ])이어야 합니다.');
  for (const [i, c] of (Array.isArray(raw.changes) ? raw.changes : []).slice(0, 8).entries()) {
    if (!c || typeof c !== 'object') {
      err(`changes[${i}]: { item, text } 모양이어야 합니다.`);
      continue;
    }
    let item = typeof c.item === 'string' ? c.item.trim() : '';
    if (!(item in ADVICE_ITEMS)) {
      warn(`changes[${i}].item: "${c.item}" 를 「그 밖」으로 넣었습니다(${Object.keys(ADVICE_ITEMS).join('·')} 중 하나).`);
      item = 'other';
    }
    const t = text(c.text, `changes[${i}].text`, 300);
    if (!t) warn(`changes[${i}].text: 이유가 비어 있습니다.`);
    changes.push({ item, text: t ?? '' });
  }

  let confidence = typeof raw.confidence === 'string' ? raw.confidence.trim() : null;
  if (confidence && !(confidence in CONFIDENCE_WORDS)) {
    warn(`confidence: "${raw.confidence}" 는 low·medium·high 가 아니라 비웠습니다.`);
    confidence = null;
  }
  const known = new Set(['format', 'version', 'brewId', 'summary', 'good', 'issues', 'next', 'changes', 'questions', 'confidence', 'model']);
  const extra = Object.keys(raw).filter((k) => !known.has(k));
  if (extra.length) warn(`모르는 항목은 뺐습니다: ${extra.join(', ')}`);

  if (errors.length) return { advice: null, errors, warnings };
  return {
    advice: {
      format: ADVICE_FORMAT,
      version: ADVICE_FORMAT_VERSION,
      brewId: brew?.id ?? brewId,
      summary: text(raw.summary, 'summary', 400) ?? '',
      good: list(raw.good, 'good', 6, 200),
      issues: list(raw.issues, 'issues', 6, 200),
      next,
      changes,
      questions: list(raw.questions, 'questions', 5, 200),
      confidence,
      model: text(raw.model, 'model', 60),
      importedAt: new Date(now).toISOString(),
    },
    errors,
    warnings,
  };
}

// 준비 화면 [AI 제안대로 맞추기]: 제안이 달린 기록(from)에서 출발해 바꿀 값만 돌려준다(null 은 그대로).
// 다이얼은 같은 그라인더일 때만(다른 그라인더면 숫자의 뜻이 다르다). 물을 안 적었으면 그 기록의 물 그대로 → 비율 = 물 / 원두량.
export function advicePatch(advice, from, { grinderId = null } = {}) {
  const n = advice?.next ?? {};
  const c = from.conditions;
  const patch = {};
  const sameGrinder = grinderId && c.grind?.grinderId === grinderId;
  if (n.grindDial != null && sameGrinder) patch.dial = n.grindDial;
  const dose = n.doseG ?? c.doseG;
  const water = n.hotWaterG ?? currentValues(from).hotWaterG;
  if (n.doseG != null) patch.doseG = n.doseG;
  if (n.doseG != null || n.hotWaterG != null) {
    patch.ratio = water / dose;
    patch.iceG = null;
  }
  if (n.tempC != null) patch.tempC = n.tempC;
  return { patch, dialSkipped: n.grindDial != null && !sameGrinder };
}

// 준비 화면에 띄울 제안: 같은 레시피(원두를 골랐으면 같은 원두)의 가장 최근 «AI 제안이 있는» 기록
export function lastAdvised(brews, { recipeId, beanId = null }) {
  return brews.find((b) => b.aiAdvice && b.recipe.id === recipeId && (!beanId || b.bean?.id === beanId)) ?? null;
}
