// 레시피 가져오기(사용자 결정 9/24): 앱이 준 프롬프트를 AI 에 붙여 넣고 레시피 원문을 주면, AI 가 아래 형식의 JSON 을 만든다.
// 사용자는 그 JSON 을 붙여 넣거나 파일로 올리고, 앱은 검사 → 미리 보기 → 저장한다.
//
// 설계(오류를 줄이려고)
// - AI 에게는 원문에 적힌 값(원두 g·물 g·누적 g·시작 초)만 받는다. 비율·단계 % 는 앱이 계산한다 — AI 는 산수에서 자주 틀린다.
// - 원문에 없는 값은 지어내지 말고 null + uncertain 에 이유. 필수값이 없으면 JSON 을 내기 전에 사용자에게 묻게 한다.
// - 앞뒤 설명 글·```json 블록 표시는 앱이 걸러 낸다. 숫자가 따옴표에 싸였거나 시간이 "1:10" 이면 고쳐 읽고 경고한다.
// - 프롬프트의 예시는 쿠라스 프리셋에서 만든다(toImportFormat). 테스트가 «예시 → 검사 → 변환 = 프리셋»을 확인해서
//   형식·검사기·프롬프트가 서로 어긋날 수 없게 한다.
// - 앱이 못 잡는 것: 형식은 맞는데 AI 가 원문 숫자를 잘못 옮긴 경우 → 미리 보기에서 원문과 대조하라고 안내한다.

import { newId } from './schema.js';

import { readLooseJson, fieldReaders } from './looseJson.js';

export const RECIPE_FORMAT = 'nextbrew-recipe';
export const RECIPE_FORMAT_VERSION = 1;
const MAX_STEPS = 12;

// 앱 안의 레시피(data/presets.js 형식) → 가져오기 형식. 프롬프트 예시, 저장한 레시피 수정 화면, 테스트에 쓴다.
// 단계 설명은 «원문에 있는 말»(hintSource 'recipe')만 옮긴다 — 일반 설명은 원문이 아니므로 예시에서도 비운다.
export function toImportFormat(r) {
  const hot = Math.round(r.refDoseG * r.waterRatio);
  return {
    format: RECIPE_FORMAT,
    version: RECIPE_FORMAT_VERSION,
    name: r.name,
    style: r.style,
    dripper: r.designedFor || null,
    source: { title: r.source?.label ?? null, url: r.source?.url ?? null, author: r.source?.author ?? null },
    doseG: r.refDoseG,
    hotWaterG: hot,
    iceG: Math.round(r.refDoseG * (r.iceRatio ?? 0)),
    tempC: r.tempC ?? null,
    grind: r.grindNote || null,
    roast: r.roastNote || null,
    steps: r.steps.map((s, i) => ({
      kind: s.kind,
      label: s.label,
      startSec: s.startSec,
      untilG: i === r.steps.length - 1 ? hot : Math.round(hot * s.cumPct),
      hint: s.hint && (s.hintSource ?? 'recipe') === 'recipe' ? s.hint : null,
    })),
    endSec: r.endSec,
    pourSec: r.pourSec ?? null,
    pourMethod: r.pourMethod ?? null,
    pourTips: r.pourTips ?? [],
    notes: r.notes ?? [],
    dilutionG: r.dilutionG ?? 0,
    uncertain: r.uncertain ?? [],
  };
}

// 직접 입력할 때의 빈 틀
export function blankRecipe() {
  return {
    format: RECIPE_FORMAT,
    version: RECIPE_FORMAT_VERSION,
    name: '',
    style: 'hot',
    dripper: null,
    source: { title: null, url: null, author: null },
    doseG: 15,
    hotWaterG: 250,
    iceG: 0,
    tempC: null,
    grind: null,
    roast: null,
    steps: [
      { kind: 'bloom', label: '뜸 들이기', startSec: 0, untilG: 50, hint: null },
      { kind: 'pour', label: '1차 푸어', startSec: 45, untilG: 250, hint: null },
    ],
    endSec: 180,
    pourSec: null,
    pourMethod: null,
    pourTips: [],
    notes: [],
    dilutionG: 0,
    uncertain: [],
  };
}

// AI 답에서 JSON 부분만 꺼낸다: ```json 블록이 있으면 그 안, 없으면 첫 { 부터 마지막 } 까지.
// 그대로 안 읽히면 AI 가 자주 내는 특수문자를 고쳐 다시 읽는다(둥근 따옴표 “ ” ‘ ’, 마지막 쉼표, // 주석) — 고친 것은 fixes 로 알린다.
// 반환: { raw(읽은 객체), fixes[] }
export function readRecipeText(text) {
  return readLooseJson(text, '아래 「직접 입력」으로 채워 주세요');
}

// 검사 + 변환. 반환: { recipe(저장할 모양, 오류가 있으면 null), errors[], warnings[], clean }
// clean = 고쳐 읽은 값(15g → 15, "0:45" → 45)을 넣은 가져오기 형식 — 화면이 폼 칸을 이 값으로 다시 채운다. 못 고친 값은 원래 글 그대로 둔다.
export function validateRecipeImport(raw, { now = Date.now(), existingNames = [] } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { recipe: null, errors: ['JSON 이 객체({ … })가 아닙니다.'], warnings, clean: null };

  const { num, text, list, inRange } = fieldReaders(err, warn);

  if (raw.format !== RECIPE_FORMAT) err(`format: "${RECIPE_FORMAT}" 이어야 합니다(지금 ${JSON.stringify(raw.format)}). 앱의 프롬프트로 만든 JSON 인지 확인해 주세요.`);
  if (raw.version !== RECIPE_FORMAT_VERSION) {
    if (typeof raw.version === 'number' && raw.version > RECIPE_FORMAT_VERSION) err(`version: ${raw.version} — 이 앱보다 새 형식입니다.`);
    else warn(`version: ${JSON.stringify(raw.version)} 을 ${RECIPE_FORMAT_VERSION} 로 보고 읽었습니다.`);
  }

  const name = text(raw.name, 'name(레시피 이름)', 40, { required: true });
  if (name && existingNames.includes(name)) warn(`name: 「${name}」 이름의 레시피가 이미 있습니다. 저장하면 같은 이름이 둘이 됩니다.`);
  const style = raw.style === 'hot' || raw.style === 'iced' ? raw.style : null;
  if (!style) err(`style: "hot" 또는 "iced" 여야 합니다(지금 ${JSON.stringify(raw.style)}).`);
  const dripper = text(raw.dripper, 'dripper(드리퍼)', 40);

  const src = raw.source && typeof raw.source === 'object' ? raw.source : {};
  let url = text(src.url, 'source.url', 500);
  if (url && !/^https?:\/\//i.test(url)) {
    warn(`source.url: http 로 시작하지 않아 링크로 쓰지 않습니다(${url}).`);
    url = null;
  }
  const title = text(src.title, 'source.title', 120);
  const author = text(src.author, 'source.author', 60);
  if (!url && !title) warn('source: 출처(제목·주소)가 없습니다. 나중에 어디서 온 레시피인지 알기 어렵습니다.');

  const doseG = inRange(num(raw.doseG, 'doseG'), 'doseG(원두량)', 1, 100, '원두량(g)');
  if (doseG == null) err('doseG(원두량): 숫자가 필요합니다. 원문에 비율만 있으면 AI 에게 원두량을 알려 주고 다시 만들어 달라고 하세요.');
  const hotWaterG = inRange(num(raw.hotWaterG, 'hotWaterG'), 'hotWaterG(뜨거운 물)', 10, 3000, '뜨거운 물(g)');
  if (hotWaterG == null) err('hotWaterG(뜨거운 물 합계): 숫자가 필요합니다.');
  let iceG = num(raw.iceG, 'iceG') ?? 0;
  inRange(iceG, 'iceG(얼음)', 0, 2000, '얼음(g)');
  if (style === 'iced' && !iceG) warn('iceG: 아이스인데 얼음이 0g 입니다. 원문에 얼음 양이 있는지 확인해 주세요.');
  if (style === 'hot' && iceG) {
    warn(`iceG: 핫 레시피인데 얼음 ${iceG}g 이 있어 0 으로 두었습니다.`);
    iceG = 0;
  }
  const tempC = inRange(num(raw.tempC, 'tempC'), 'tempC(물 온도)', 50, 100, '물 온도(℃)');
  if (raw.tempC == null) warn('tempC: 물 온도가 없습니다. 준비 화면에서 직접 넣어 주세요.');

  // 단계: 시작 초는 0 부터 커지고, 누적 g 도 커지며, 마지막 누적 = 뜨거운 물 합계
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  if (!rawSteps.length) err('steps(붓는 단계): 한 단계 이상 있어야 합니다.');
  if (rawSteps.length > MAX_STEPS) err(`steps: ${rawSteps.length}단계 — ${MAX_STEPS}단계까지만 받습니다.`);
  const steps = rawSteps.slice(0, MAX_STEPS).map((s, i) => {
    const at = `steps[${i}](${i + 1}번째 단계)`;
    const o = s && typeof s === 'object' ? s : {};
    const kind = o.kind === 'bloom' || o.kind === 'pour' ? o.kind : null;
    if (!kind) err(`${at}.kind: "bloom" 또는 "pour" 여야 합니다(지금 ${JSON.stringify(o.kind)}).`);
    if (kind === 'bloom' && i > 0) warn(`${at}.kind: 뜸(bloom)은 보통 첫 단계입니다.`);
    return {
      kind: kind ?? 'pour',
      label: text(o.label, `${at}.label`, 20, { required: true }) ?? `${i + 1}단계`,
      startSec: num(o.startSec, `${at}.startSec`, { time: true }),
      untilG: num(o.untilG, `${at}.untilG`),
      hint: text(o.hint, `${at}.hint`, 120),
    };
  });
  steps.forEach((s, i) => {
    const at = `steps[${i}](${i + 1}번째 단계)`;
    if (s.startSec == null) err(`${at}.startSec: 시작 시각(초)이 필요합니다.`);
    else if (i === 0 && s.startSec !== 0) err(`${at}.startSec: 첫 단계는 0초여야 합니다(타이머는 첫 물을 붓는 순간 0초). 지금 ${s.startSec}.`);
    else if (i > 0 && steps[i - 1].startSec != null && s.startSec <= steps[i - 1].startSec) err(`${at}.startSec: ${s.startSec} — 앞 단계(${steps[i - 1].startSec})보다 커야 합니다.`);
    if (s.untilG == null) err(`${at}.untilG: 이 단계가 끝날 때의 누적 물(g)이 필요합니다.`);
    else if (s.untilG <= 0) err(`${at}.untilG: 0보다 커야 합니다.`);
    else if (i > 0 && steps[i - 1].untilG != null && s.untilG <= steps[i - 1].untilG) err(`${at}.untilG: ${s.untilG} — 앞 단계(${steps[i - 1].untilG})보다 커야 합니다. 매번 붓는 양이 아니라 «누적» 무게로 적는 형식입니다.`);
  });
  const last = steps[steps.length - 1];
  if (last && last.untilG != null && hotWaterG != null && Math.abs(last.untilG - hotWaterG) > 0.5) {
    err(`steps 마지막 untilG(${last.untilG})가 hotWaterG(${hotWaterG})와 같아야 합니다 — 마지막 단계가 끝나면 뜨거운 물을 다 부은 것이기 때문입니다.`);
  }

  const endSec = num(raw.endSec, 'endSec', { time: true });
  if (endSec == null) err('endSec(추출 종료 목표 시각): 초 숫자가 필요합니다. 원문의 총 추출 시간을 넣어 주세요.');
  else if (last?.startSec != null && endSec <= last.startSec) err(`endSec: ${endSec} — 마지막 단계 시작(${last.startSec})보다 커야 합니다.`);
  else inRange(endSec, 'endSec', 10, 3600, '종료 시각(초)');
  const pourSec = num(raw.pourSec, 'pourSec');
  inRange(pourSec, 'pourSec(한 번 붓는 시간)', 1, 120, '붓는 시간(초)');
  const dilutionG = num(raw.dilutionG, 'dilutionG') ?? 0;
  inRange(dilutionG, 'dilutionG(가수)', 0, 2000, '가수(g)');
  const uncertain = list(raw.uncertain, 'uncertain', 20, 200);
  if (uncertain.length) warn(`AI 가 애매하다고 적은 것 ${uncertain.length}개 — 아래 「원문에서 확인할 것」을 봐 주세요.`);

  const known = new Set(['format', 'version', 'name', 'style', 'dripper', 'source', 'doseG', 'hotWaterG', 'iceG', 'tempC', 'grind', 'roast', 'steps', 'endSec', 'pourSec', 'pourMethod', 'pourTips', 'notes', 'dilutionG', 'uncertain']);
  const extra = Object.keys(raw).filter((k) => !known.has(k));
  if (extra.length) warn(`모르는 항목은 무시했습니다: ${extra.join(', ')}`);

  const pourTips = list(raw.pourTips, 'pourTips');
  const notes = list(raw.notes, 'notes');
  const grind = text(raw.grind, 'grind', 80);
  const roast = text(raw.roast, 'roast', 40);
  const pourMethod = text(raw.pourMethod, 'pourMethod', 40);
  const keep = (v, orig) => (v != null ? v : orig ?? null); // 못 고친 값은 원래 글 그대로(사용자가 폼에서 고치게)
  const clean = {
    ...raw,
    format: RECIPE_FORMAT,
    version: RECIPE_FORMAT_VERSION,
    doseG: keep(doseG, raw.doseG),
    hotWaterG: keep(hotWaterG, raw.hotWaterG),
    iceG,
    tempC: keep(tempC, raw.tempC),
    endSec: keep(endSec, raw.endSec),
    pourSec: keep(pourSec, raw.pourSec),
    dilutionG,
    steps: rawSteps.slice(0, MAX_STEPS).map((o, i) => ({ ...o, startSec: keep(steps[i].startSec, o?.startSec), untilG: keep(steps[i].untilG, o?.untilG) })),
  };
  if (errors.length) return { recipe: null, errors, warnings, clean };

  // 앱 레시피 형식(data/presets.js 와 같은 모양)으로 — 비율·단계 % 는 여기서 계산한다
  const recipe = {
    id: newId('recipe', now),
    kind: 'user',
    name,
    style,
    designedFor: dripper ?? '',
    source: { label: title ?? author ?? name, url, author, checkedAt: new Date(now).toISOString().slice(0, 10) },
    refDoseG: doseG,
    waterRatio: hotWaterG / doseG,
    iceRatio: iceG / doseG,
    tempC,
    grindNote: grind ?? '',
    roastNote: roast,
    steps: steps.map((s, i) => ({
      kind: s.kind,
      label: s.label,
      cumPct: i === steps.length - 1 ? 1 : s.untilG / hotWaterG,
      startSec: s.startSec,
      ...(s.hint ? { hint: s.hint, hintSource: 'recipe' } : {}),
    })),
    endSec,
    pourSec: pourSec ?? null,
    pourMethod,
    pourTips,
    notes,
    dilutionG,
    uncertain,
    importedAt: new Date(now).toISOString(),
  };
  return { recipe, errors, warnings, clean };
}

// AI 에 붙여 넣을 프롬프트. 예시는 앱에 들어 있는 쿠라스 프리셋에서 만든다.
export function recipePrompt(example) {
  return `커피 핸드드립 레시피를 NextBrew 앱에 넣을 JSON 으로 바꿔 주세요.
레시피 원문(글, 링크, 영상 설명 중 하나)은 이 메시지 맨 아래에 붙여 넣었습니다.

## 꼭 지켜 주세요
1. 원문에 없는 값은 지어내지 말아 주세요. 모르는 값은 null(목록이면 [])로 두고, 무엇을 왜 비웠는지 "uncertain"에 한 줄씩 적어 주세요.
2. 링크만 있는데 그 페이지를 직접 열어 읽을 수 없다면, 짐작해서 채우지 말고 원문 내용을 붙여 달라고 먼저 말해 주세요.
3. 필수값(원두량 doseG, 뜨거운 물 hotWaterG, 단계 steps, 종료 시각 endSec)을 원문에서 찾을 수 없으면 JSON 을 만들기 전에 저에게 먼저 물어봐 주세요.
   원문에 비율(예: 1:15)만 있고 원두량이 없으면 원두량을 물어본 뒤 hotWaterG = 원두량 × 15 로 계산해 주세요.
4. 답은 JSON 하나만 \`\`\`json 코드 블록 하나에 담아 주세요. 설명이 필요하면 코드 블록 밖에 짧게만 적어 주세요.
5. JSON 문법: 주석 금지, 마지막 쉼표 금지, 숫자는 따옴표 없이, 글은 큰따옴표로.

## 단위
- 무게는 g(물 1ml = 1g 으로 봅니다), 시간은 초(1분 10초 → 70), 온도는 ℃(화씨는 ℃로 바꿔 반올림).
- 시각(startSec, endSec)은 모두 «첫 물을 붓기 시작한 순간 = 0초» 기준의 경과 시간입니다.

## 항목 설명
- format: 항상 "${RECIPE_FORMAT}" / version: 항상 ${RECIPE_FORMAT_VERSION}
- name: 레시피 이름(한국어, 40자 이내). 예: "쿠라스 재팬 아이스"
- style: 얼음 위에 내리면 "iced", 아니면 "hot"
- dripper: 원문이 정한 드리퍼(예: "Hario V60"). 없으면 null
- source: 원문 제목(title), 주소(url, https 로 시작), 만든 사람(author). 모르면 null
- doseG: 원두량(g)
- hotWaterG: 붓는 뜨거운 물의 합계(g). 얼음과 추출 뒤에 더하는 물은 빼고 셉니다
- iceG: 서버에 미리 넣는 얼음(g). 핫이면 0
- tempC: 물 온도(℃). 없으면 null
- grind: 분쇄 크기 — 원문 표현을 살려 한국어로. 예: "중간보다 약간 가늘게 (원문: medium fine)". 없으면 null
- roast: 원문이 맞춘 배전도(예: "라이트 로스트"). 없으면 null
- steps: 붓는 단계 목록(순서대로)
  - kind: 원두를 적시고 기다리는 첫 붓기(뜸)면 "bloom", 나머지는 "pour"
  - label: 한국어 이름. 첫 단계가 뜸이면 "뜸 들이기", 그다음부터 "1차 푸어", "2차 푸어" … (뜸이 없으면 첫 단계가 "1차 푸어")
  - startSec: 이 단계를 붓기 시작하는 시각(초). 첫 단계는 0, 뒤로 갈수록 커집니다
  - untilG: 이 단계를 다 부었을 때 저울이 가리킬 «누적» 물 무게(g). 원문이 "50g 붓기"처럼 매번 붓는 양으로 적었으면 더해서 누적으로 바꿔 주세요. 마지막 단계의 untilG 는 hotWaterG 와 같아야 합니다
  - hint: 원문이 이 단계에 대해 말한 짧은 설명(한국어 한 문장). 원문에 없으면 null — 일반 상식으로 채우지 말아 주세요
- endSec: 추출을 마치는 목표 시각(물이 다 빠지는 때, 초). 범위(예: 2:30~3:00)면 늦은 쪽을 쓰고 uncertain 에 적어 주세요
- pourSec: 원문이 "매번 10초 안에 붓기"처럼 한 번 붓는 시간을 정했을 때만 그 초. 없으면 null
- pourMethod: 원문이 권하는 붓는 모양(예: "나선형", "센터 푸어"). 없으면 null
- pourTips: 모든 붓기에 걸리는 원문의 팁(한국어 문장 목록). 없으면 []
- notes: 그 밖에 원문이 말한 준비·마무리(예: "얼음을 서버에 먼저 넣고 시작합니다."). 없으면 []
- dilutionG: 추출 뒤에 더하는 물(가수, g). 없으면 0
- uncertain: 비웠거나 애매한 항목과 그 이유. 없으면 []

## 내기 전에 스스로 확인해 주세요
- steps 의 startSec 이 0 에서 시작해 계속 커지는지
- steps 의 untilG 가 계속 커지고, 마지막이 hotWaterG 와 같은지
- endSec 이 마지막 단계의 startSec 보다 큰지
- 원문에 없는 숫자를 넣지 않았는지

## 예시 — 쿠라스 교토 「재팬 아이스」(이 형식 그대로 써 주세요)
뜸 단계의 hint 가 null 인 것은 원문에 그 단계 설명이 없기 때문입니다.
\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

## 레시피 원문
(여기에 레시피 글이나 링크를 붙여 넣어 주세요)
`;
}
