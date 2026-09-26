// 드리퍼 특징을 AI 로 채우기(9/26 사용자 결정 — 기본 목록에 없는 드리퍼도 같은 형식으로 등록).
// 원두 가져오기(core/beanImport.js)와 같은 흐름: [프롬프트 복사] → 드리퍼 이름·사진과 함께 AI 앱에 → 답(JSON) 붙여 넣기 → 검사 → 칸마다 골라 채우기.
// AI 가 드리퍼 특징을 모르거나 치우쳐 알 수 있어(사용자 판단), 출처 주소를 함께 받고 모르는 칸은 null 로 받는다. 앱은 형식·범위만 검사한다.

import { readLooseJson, fieldReaders } from './looseJson.js';
import { DRIPPER_SHAPES, DRIPPER_METHODS } from '../data/drippers.js';

export const DRIPPER_FORMAT = 'nextbrew-dripper';
export const DRIPPER_FORMAT_VERSION = 1;

export const DRIPPER_EXAMPLE = {
  format: DRIPPER_FORMAT,
  version: DRIPPER_FORMAT_VERSION,
  brand: '예시 브랜드',
  model: '예시 드리퍼',
  size: '02',
  cups: '1~4잔',
  shape: 'cone',
  method: 'pour',
  holes: '큰 구멍 1개',
  ribs: '나선형 결',
  material: '세라믹',
  filter: '원뿔 종이 필터 02',
  note: '원뿔 60°',
  sources: [{ label: '제조사 상품 페이지', url: 'https://example.com/dripper' }],
  uncertain: ['ribs: 제조사 페이지에 결 모양 설명이 없어 판매처 설명을 따름'],
};

export function dripperPrompt(name = '') {
  return `커피 드리퍼의 특징을 NextBrew 앱에 넣을 JSON 으로 정리해 주세요.
드리퍼: ${name.trim() || '(이 메시지에 적거나 사진을 첨부했습니다)'}

## 꼭 지켜 주세요
1. 제조사 공식 자료(상품 페이지·설명서)를 먼저 찾아 보고, 찾은 페이지 주소를 "sources" 에 적어 주세요. 제조사 자료가 없으면 판매처 자료도 됩니다(그렇다고 label 에 적어 주세요).
2. 자료에 없는 값은 지어내지 말고 null 로 두세요. 자신 없는 칸은 "uncertain" 에 까닭을 한 줄씩 적어 주세요.
3. 답은 JSON 하나만 코드 블록으로 주세요.

## 칸
- shape: 드리퍼 안쪽 모양 — ${Object.entries(DRIPPER_SHAPES).map(([k, v]) => `${k}(${v})`).join(', ')} 중 하나, 모르면 null
- method: 추출 방식 — ${Object.entries(DRIPPER_METHODS).map(([k, v]) => `${k}(${v})`).join(', ')} 중 하나
- holes: 바닥 구멍(개수·크기·밸브), ribs: 안쪽 결·홈 모양, material: 재질(여러 가지면 이 드리퍼의 것), filter: 맞는 종이 필터
- size·cups: 모델 안의 크기 이름(01·02·155 등)과 잔 수·용량 — 자료 표기 그대로
- note: 그 밖의 특징 한 줄(자료에 있는 것만)

## 형식(format·version 은 그대로)
\`\`\`json
${JSON.stringify(DRIPPER_EXAMPLE, null, 2)}
\`\`\``;
}

export function readDripperText(text) {
  return readLooseJson(text, '드리퍼 정보를 다시 요청해 주세요');
}

// raw → { value, errors, warnings }. value 의 null = 자료에 없음(채우지 않음)
export function validateDripperImport(raw) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const { text, list } = fieldReaders(err, warn);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, errors: ['JSON 객체({ … })가 아닙니다.'], warnings };
  if (raw.format !== DRIPPER_FORMAT) warn(`format: "${raw.format ?? ''}" — 드리퍼 정보 형식(${DRIPPER_FORMAT})이 아닐 수 있습니다.`);
  const pick = (v, path, words) => {
    if (v == null || v === '') return null;
    if (typeof v === 'string' && words[v]) return v;
    // 한국어 이름으로 온 것도 받아 준다(「원뿔」 → cone)
    const hit = Object.entries(words).find(([, label]) => typeof v === 'string' && label.startsWith(v.trim()));
    if (hit) {
      warn(`${path}: "${v}" 를 ${hit[0]} 로 읽었습니다.`);
      return hit[0];
    }
    warn(`${path}: "${v}" 는 ${Object.keys(words).join('·')} 가 아니라 비워 둡니다.`);
    return null;
  };
  const sources = [];
  (Array.isArray(raw.sources) ? raw.sources : []).slice(0, 5).forEach((x, i) => {
    const label = text(x?.label, `sources[${i}].label`, 120);
    const url = text(x?.url, `sources[${i}].url`, 300);
    if (url && !/^https?:\/\//.test(url)) return warn(`sources[${i}].url: 주소(http…)가 아니라 뺍니다.`);
    if (label || url) sources.push({ label: label ?? url, url });
  });
  if (!sources.length) warn('sources: 출처가 없습니다 — AI 가 기억으로 답했을 수 있어요. 값을 한 번 확인해 주세요.');
  const value = {
    brand: text(raw.brand, 'brand', 40),
    model: text(raw.model, 'model', 60),
    size: text(raw.size, 'size', 20),
    cups: text(raw.cups, 'cups', 40),
    shape: pick(raw.shape, 'shape', DRIPPER_SHAPES),
    method: pick(raw.method, 'method', DRIPPER_METHODS),
    holes: text(raw.holes, 'holes', 80),
    ribs: text(raw.ribs, 'ribs', 80),
    material: text(raw.material, 'material', 60),
    filter: text(raw.filter, 'filter', 120),
    note: text(raw.note, 'note', 200),
    sources,
    uncertain: list(raw.uncertain, 'uncertain', 10, 200),
  };
  return { value, errors, warnings };
}

// 채울 칸 목록 → [{ key, label, from, to, same, conflict }] — 원두 가져오기와 같은 모양(이미 적은 다른 값은 처음에 체크하지 않음)
export const DRIPPER_FIELDS = [
  ['brand', '브랜드'],
  ['model', '모델'],
  ['size', '크기'],
  ['cups', '잔 수·용량'],
  ['shape', '모양'],
  ['method', '추출 방식'],
  ['holes', '구멍'],
  ['ribs', '안쪽 결'],
  ['material', '재질'],
  ['filter', '필터'],
  ['note', '특징'],
];
export function dripperShow(key, v) {
  if (v == null || v === '') return '';
  if (key === 'shape') return DRIPPER_SHAPES[v] ?? String(v);
  if (key === 'method') return DRIPPER_METHODS[v] ?? String(v);
  return String(v);
}
export function dripperPatch(dripper, v) {
  return DRIPPER_FIELDS.filter(([k]) => dripperShow(k, v[k]) !== '').map(([key, label]) => {
    const from = dripperShow(key, dripper[key]);
    const to = dripperShow(key, v[key]);
    return { key, label, from, to, same: from === to, conflict: from !== '' && from !== to };
  });
}
// 고른 칸만 넣는다(드리퍼 객체를 바꾼다). 출처는 AI 답으로 들어온 것임을 남긴다.
export function applyDripperPatch(dripper, v, keys, now = new Date()) {
  for (const k of keys) dripper[k] = v[k];
  if (keys.length) {
    const day = now.toISOString().slice(0, 10);
    const got = v.sources.length ? v.sources.map((s) => ({ kind: 'ai', label: `AI 답 — ${s.label}`, url: s.url, checkedAt: day })) : [{ kind: 'ai', label: 'AI 답(출처 없음)', url: null, checkedAt: day }];
    dripper.sources = [...(dripper.sources ?? []), ...got];
  }
  return dripper;
}
