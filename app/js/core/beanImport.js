// 로스터리 설명(상세 페이지·봉투 캡처)을 AI 로 원두 칸에 채우기(사용자 결정 9/26 — 로스터리마다 형식과 표현 단어가 달라
// 글자 인식으로는 정확도를 보장할 수 없어 AI 방식으로). 레시피 가져오기와 같은 흐름이다:
// [프롬프트 복사] → 캡처와 함께 AI 앱에 보냄 → 답(JSON)을 붙여 넣기·파일 → 검사 → 칸마다 골라 채우기(저장은 원두 화면 [저장]).
// 표현 맞추기(로스터리마다 다른 척도·항목 이름·배전 표기 → 앱 형식)는 AI 가 하고, 규칙은 프롬프트(beanPrompt)에 적는다.
// 앱은 받은 값이 형식·범위에 맞는지만 검사하고, 뜻을 새로 만들지 않는다.

import { readLooseJson, fieldReaders } from './looseJson.js';
import { ROASTS, PROFILE_SCALES, roastWordOf, roastLabel, profileLine } from './schema.js';
import { ROAST_WORD_LEVEL } from './migrate.js';
import { partsLine, MAX_PARTS } from './blend.js';

export const BEAN_FORMAT = 'nextbrew-bean';
export const BEAN_FORMAT_VERSION = 1;

// 형식 예시(프롬프트에 그대로 들어가고, 테스트가 이 예시를 검사해 오류 0 인지 본다)
export const BEAN_EXAMPLE = {
  format: BEAN_FORMAT,
  version: BEAN_FORMAT_VERSION,
  roaster: '예시 로스터리',
  country: '에티오피아',
  region: '예가체프',
  producer: '첼바',
  variety: '에어룸',
  process: '워시드',
  blend: null,
  roast: '중약배전',
  roastLevel: null,
  decaf: false,
  notes: ['자스민', '레몬', '홍차'],
  profile: { scale: 5, items: [{ label: '산미', value: 4 }, { label: '단맛', value: 3.5 }, { label: '바디', value: 2 }] },
  roastedOn: null,
  uncertain: ['profile: 원문은 막대 그래프라 칸 수를 세어 적음'],
};

export function beanPrompt() {
  return `커피 원두 정보를 NextBrew 앱에 넣을 JSON 으로 옮겨 주세요.
원두 정보(로스터리 상세 페이지·봉투 사진이나 글)는 이 메시지에 첨부했습니다.

## 꼭 지켜 주세요
1. 원문에 없는 값은 지어내지 말아 주세요. 모르는 값은 null(목록이면 [])로 두고, 자신 없는 칸은 "uncertain"에 까닭과 원문 표기를 한 줄씩 적어 주세요.
2. 답은 JSON 하나만 코드 블록으로 주세요.

## 로스터리마다 다른 표현을 앱 형식으로 맞추는 규칙
- country: 나라 이름은 한국어로(Ethiopia → 에티오피아, Colombia → 콜롬비아).
- process: 흔한 한국어 표기로 — 워시드(washed·수세식), 내추럴(natural·건식), 허니(honey), 무산소 발효(anaerobic). 둘 이상이면 원문 순서대로(예: 무산소 내추럴).
- blend: 여러 산지 원두를 섞은 블렌드면 {"parts": [{"country", "region", "variety", "process", "pct"}]} 로 산지마다 한 줄씩(원문 순서) 적어 주세요. pct 는 원문에 비율(%)이 있을 때만, 없으면 null. 싱글 오리진이면 blend 는 null. 블렌드일 때 위의 country·region·producer·variety·process 는 null 로 두세요.
- roast: 원문 배전 표기를 약배전·중약배전·중배전·중강배전·강배전 중 하나로 — 라이트·시나몬 → 약배전, 미디엄 라이트 → 중약배전, 미디엄·시티 → 중배전, 미디엄 다크·풀시티 → 중강배전, 다크·프렌치·이탈리안 → 강배전. 판단이 어려우면 null 로 두고 uncertain 에 원문 표기를 적어 주세요.
- roastLevel: 원문에 배전을 숫자 단계로 적었을 때만 0.5~10(0.5 단위)으로 옮겨 주세요(10단계 중 6 → 6, 5단계 중 3 → 6). 숫자가 없으면 null.
- decaf: 디카페인이라고 적혀 있으면 true, 아닌 것이 분명하면 false, 알 수 없으면 null.
- notes: 로스터리가 적은 향미 노트를 원문 순서대로 한국어로(영어만 있으면 흔한 한국어 표기로, 예: Jasmine → 자스민).
- profile: 산미·단맛 같은 맛 지표가 숫자·별·점·막대로 있을 때만. 없으면 null.
  - scale: 원문 척도가 5점이면 5, 10점이면 10. 별·점·막대는 칸의 최대 개수가 척도(★★★☆☆ → scale 5, value 3). 「약·중·강」처럼 3단계 말이면 5점으로 1·3·5. 그 밖의 척도(예: 4점)는 5점으로 비율을 맞춰 0.5 단위로 반올림하고 uncertain 에 원문을 적어 주세요.
  - value: 0 ~ scale, 0.5 단위.
  - label: 앱 이름으로 — 산미(신맛·acidity), 단맛(sweetness), 바디(바디감·body·무게감·마우스필), 쓴맛(bitterness), 고소함(고소·nutty), 밸런스(균형·balance). 그 밖의 항목은 원문 이름 그대로(예: 향미, 여운, 클린컵).
- roastedOn: 로스팅 날짜가 있으면 YYYY-MM-DD, 없으면 null.

## 형식(format·version 은 그대로)
\`\`\`json
${JSON.stringify(BEAN_EXAMPLE, null, 2)}
\`\`\``;
}

export function readBeanText(text) {
  return readLooseJson(text, '원두 정보를 다시 요청해 주세요');
}

const snap = (v) => Math.round(v * 2) / 2;

// raw → { value(앱 칸 값), errors, warnings }. value 의 null = 원문에 없음(채우지 않음)
export function validateBeanImport(raw) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const { num, text, list, inRange } = fieldReaders(err, warn);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, errors: ['JSON 객체({ … })가 아닙니다.'], warnings };
  if (raw.format !== BEAN_FORMAT) warn(`format: "${raw.format ?? ''}" — 원두 정보 형식(${BEAN_FORMAT})이 아닐 수 있습니다.`);
  const v = {
    roaster: text(raw.roaster, 'roaster', 40),
    country: text(raw.country, 'country', 30),
    region: text(raw.region, 'region', 40),
    producer: text(raw.producer, 'producer', 60),
    variety: text(raw.variety, 'variety', 60),
    process: text(raw.process, 'process', 40),
    roast: null,
    roastLevel: null,
    decaf: null,
    notes: list(raw.notes, 'notes', 12, 30),
    blend: null,
    profile: null,
    roastedOn: null,
    uncertain: list(raw.uncertain, 'uncertain', 10, 200),
  };
  const r = text(raw.roast, 'roast', 10);
  if (r && !ROASTS.includes(r)) warn(`roast: "${r}" 는 앱의 배전도(${ROASTS.join('·')})가 아니라 비워 둡니다.`);
  else v.roast = r;
  const lvl = inRange(num(raw.roastLevel, 'roastLevel'), 'roastLevel', 0.5, 10, '배전도 숫자');
  if (lvl != null) {
    v.roastLevel = snap(lvl);
    if (v.roastLevel !== lvl) warn(`roastLevel: ${lvl} 를 0.5 단위 ${v.roastLevel} 로 맞췄습니다.`);
    if (v.roast && v.roast !== roastWordOf(v.roastLevel)) warn(`roast(${v.roast})와 roastLevel(${v.roastLevel} = ${roastWordOf(v.roastLevel)})이 달라 숫자를 따릅니다.`);
  }
  if (raw.decaf === true || raw.decaf === false) v.decaf = raw.decaf;
  else if (raw.decaf != null) warn(`decaf: "${raw.decaf}" 는 true·false 가 아니라 비워 둡니다.`);
  if (raw.profile != null) {
    const p = raw.profile;
    const scale = num(p?.scale, 'profile.scale');
    if (!PROFILE_SCALES.includes(scale)) err(`profile.scale: ${scale} — 5 나 10 이어야 합니다.`);
    else {
      const items = [];
      (Array.isArray(p.items) ? p.items : []).slice(0, 12).forEach((it, i) => {
        const label = text(it?.label, `profile.items[${i}].label`, 20);
        const val = inRange(num(it?.value, `profile.items[${i}].value`), `profile.items[${i}].value`, 0, scale, '값');
        if (!label || val == null) return;
        if (items.some((x) => x.label === label)) return warn(`profile: 「${label}」이 두 번 있어 앞의 것만 씁니다.`);
        items.push({ label, value: snap(val) });
      });
      if (items.length) v.profile = { scale, items };
    }
  }
  if (raw.blend != null) {
    const parts = [];
    const src = Array.isArray(raw.blend?.parts) ? raw.blend.parts : [];
    if (!src.length) warn('blend: parts 가 비어 있어 싱글 오리진으로 봅니다.');
    src.slice(0, MAX_PARTS).forEach((p, i) => {
      const part = {
        country: text(p?.country, `blend.parts[${i}].country`, 30),
        region: text(p?.region, `blend.parts[${i}].region`, 40),
        variety: text(p?.variety, `blend.parts[${i}].variety`, 60),
        process: text(p?.process, `blend.parts[${i}].process`, 40),
        pct: inRange(num(typeof p?.pct === 'string' ? p.pct.trim().replace(/%$/, '') : p?.pct, `blend.parts[${i}].pct`), `blend.parts[${i}].pct`, 0, 100, '비율(%)'), // 「50%」도 읽는다
      };
      if (!part.country && !part.region && !part.variety && !part.process) return warn(`blend.parts[${i}]: 산지 정보가 없어 뺍니다.`);
      parts.push(part);
    });
    if (src.length > MAX_PARTS) warn(`blend: 구성은 ${MAX_PARTS}개까지만 씁니다.`);
    if (parts.length) {
      v.blend = { parts };
      const pcts = parts.map((p) => p.pct);
      if (pcts.every((x) => x != null) && Math.abs(pcts.reduce((a, x) => a + x, 0) - 100) > 1) warn(`blend: 비율 합이 ${pcts.reduce((a, x) => a + x, 0)}% 입니다(100% 가 아님).`);
      if (parts.length === 1) warn('blend: 구성이 하나뿐입니다 — 싱글 오리진이면 blend 를 null 로 두는 편이 맞습니다.');
    }
  }
  if (raw.roastedOn != null) {
    if (typeof raw.roastedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.roastedOn)) v.roastedOn = raw.roastedOn;
    else warn(`roastedOn: "${raw.roastedOn}" 는 YYYY-MM-DD 가 아니라 비워 둡니다.`);
  }
  return { value: v, errors, warnings };
}

// 원두 칸에 채울 목록 → [{ key, label, from(지금 보이는 값), to(가져올 값), same, conflict(지금 값이 있고 다름) }]
// 원문에 없는 칸(null·빈 목록)은 넣지 않는다. conflict 인 칸은 화면에서 처음에 체크하지 않는다(이미 적은 값을 지키려고).
export const BEAN_FIELDS = [
  ['roaster', '로스터리'],
  ['country', '국가'],
  ['region', '지역'],
  ['producer', '농장·생산자'],
  ['variety', '품종'],
  ['process', '가공방식'],
  ['blend', '블렌드 구성'],
  ['roast', '배전도'],
  ['decaf', '디카페인'],
  ['notes', '노트'],
  ['roasterProfile', '로스터리 맛 지표'],
  ['roastedOn', '제조일(로스팅일)'],
];
const show = (key, v) => {
  if (v == null || (Array.isArray(v) && !v.length) || v === '') return '';
  if (key === 'decaf') return v ? '예' : '아니오';
  if (key === 'notes') return v.join(', ');
  if (key === 'roasterProfile') return profileLine(v);
  if (key === 'blend') return partsLine(v.parts, { kind: v.by === 'me' ? 'grams' : 'origin' });
  return String(v);
};
export function beanPatch(bean, v) {
  const want = {
    roaster: v.roaster,
    country: v.country,
    region: v.region,
    producer: v.producer,
    variety: v.variety,
    process: v.process,
    blend: v.blend ? { by: 'roaster', parts: v.blend.parts } : null,
    roast: v.roastLevel != null ? roastLabel({ roastLevel: v.roastLevel }) : v.roast,
    decaf: v.decaf,
    notes: v.notes?.length ? v.notes : null,
    roasterProfile: v.profile,
    roastedOn: v.roastedOn,
  };
  const now = { ...bean, roast: roastLabel(bean), decaf: bean.decaf ? true : null }; // 옛 단어에서 옮긴 숫자는 「약」이 붙는다
  return BEAN_FIELDS.filter(([k]) => show(k, want[k]) !== '').map(([key, label]) => {
    const from = show(key, now[key]);
    const to = show(key, want[key]);
    return { key, label, from, to, same: from === to, conflict: from !== '' && from !== to };
  });
}

// 고른 칸만 원두에 넣는다(원두 객체를 바꾼다). 배전도: 숫자가 오면 숫자, 단어만 오면 옛 단어처럼 띠 가운데 숫자(roastLevelFrom 'word')
export function applyBeanPatch(bean, v, keys) {
  for (const k of keys) {
    if (k === 'roast') {
      if (v.roastLevel != null) Object.assign(bean, { roastLevel: v.roastLevel, roast: roastWordOf(v.roastLevel), roastLevelFrom: null });
      else if (v.roast) Object.assign(bean, { roast: v.roast, roastLevel: ROAST_WORD_LEVEL[v.roast], roastLevelFrom: 'word' });
    } else if (k === 'notes') bean.notes = [...new Set([...(bean.notes ?? []), ...v.notes])];
    else if (k === 'roasterProfile') bean.roasterProfile = structuredClone(v.profile);
    else if (k === 'blend') bean.blend = { by: 'roaster', parts: structuredClone(v.blend.parts) }; // 로스터리 블렌드(9/26)
    else if (k === 'decaf') bean.decaf = Boolean(v.decaf);
    else bean[k] = v[k];
  }
  return bean;
}
