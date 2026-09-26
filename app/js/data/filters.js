// 필터 기본 목록(9/26 사용자 요청 — 유명 필터를 기본으로 두고 특징이 보이게). 추출 준비의 필터 칸에서 고르면 아래에 특징이 뜬다.
// 값은 제조사 페이지에 적힌 것만 옮겼다(2026-09-26 확인). 제조사가 스스로 한 말(맛·거르는 것)은 «제조사 설명»으로 밝힌다.
// 「표백 종이 필터」·「무표백 종이 필터」(core/schema.js FILTERS)는 제품이 아닌 종류라 그대로 둔다.
// 전체 출처 = docs/agent-notes/참고 출처 목록.md 「필터 기본 목록」.

const CHECKED = '2026-09-26';
const maker = (label, url) => ({ kind: 'maker', label, url, checkedAt: CHECKED });

export const FILTER_CATALOG = [
  {
    key: 'hario-v60', name: 'HARIO V60 종이 필터',
    shape: '원뿔', sizes: '01·02·03', material: '펄프(접착제 없음) · 흰색·자연 갈색',
    feature: 'V60 드리퍼에 맞춘 필터 — 흐름을 덜 막아 맑고 균형 있게(제조사 설명)',
    sources: [maker('HARIO USA — V60 Paper Filter for 02', 'https://www.hario-usa.com/products/copy-of-paper-filter-for-01-drippers')],
  },
  {
    key: 'cafec-abaca-plus', name: 'CAFEC Abaca+',
    shape: '원뿔·사다리꼴', sizes: 'Cup1·Cup4 · 101·102', material: '아바카(마닐라삼)와 목재 펄프',
    feature: '물이 가장 매끄럽고 고르게 흘러 추출 속도를 조절하기 쉽다(제조사 설명) · 모든 배전도',
    sources: [maker('CAFEC — FILTER PAPER', 'https://cafec-jp.com/products/filterpaper/')],
  },
  {
    key: 'cafec-t92', name: 'CAFEC T-92(약배전용)',
    shape: '원뿔', sizes: 'Cup1·Cup4', material: '종이(한쪽 면 크레이프)',
    feature: '종이 안에 물이 고여 향을 끌어낸다(제조사 설명)', roast: '약배전', tempC: 92,
    sources: [maker('CAFEC — FILTER PAPER', 'https://cafec-jp.com/products/filterpaper/')],
  },
  {
    key: 'cafec-t90', name: 'CAFEC T-90(중강배전용)',
    shape: '원뿔', sizes: 'Cup1·Cup4', material: '종이(양면 크레이프 — 높음)',
    feature: '끝까지 매끄럽게 흐른다(제조사 설명)', roast: '중강배전', tempC: 90,
    sources: [maker('CAFEC — FILTER PAPER', 'https://cafec-jp.com/products/filterpaper/')],
  },
  {
    key: 'cafec-t83', name: 'CAFEC T-83(강배전용)',
    shape: '원뿔', sizes: 'Cup1·Cup4', material: '종이(양면 크레이프 — 낮음)',
    feature: '처음엔 빠르고 나중엔 느리게 흘러 바디를 남긴다(제조사 설명)', roast: '강배전', tempC: 83,
    sources: [maker('CAFEC — FILTER PAPER', 'https://cafec-jp.com/products/filterpaper/')],
  },
  {
    key: 'kalita-wave', name: 'Kalita Wave 필터',
    shape: '웨이브(평바닥)', sizes: '155·185', material: null,
    feature: '물결 주름이 드리퍼 벽과 닿는 면을 줄여 물이 자유롭게 흐른다(제조사 설명)',
    sources: [maker('Kalita — Find Your Perfect Kalita Dripper', 'https://kalitaofficial.com/2025/12/10/find-your-perfect-kalita-dripper-a-comparison/')],
  },
  {
    key: 'chemex-bonded', name: 'CHEMEX Bonded 필터',
    shape: 'CHEMEX(원뿔로 접음)', sizes: '접힌 원형·사각, 반달', material: '다른 필터보다 20~30% 두꺼운 종이 · 흰색·자연 모두 표백제 없음',
    feature: '기름·쓴맛·산미·찌꺼기를 걸러 낸다(제조사 설명)',
    sources: [maker('CHEMEX — Bonded Natural Square Filters', 'https://chemexcoffeemaker.com/products/chemex-bonded-filters-pre-folded-squares-natural')],
  },
  {
    key: 'sibarist-fast', name: 'SIBARIST FAST',
    shape: '원뿔(UFO)·평바닥(FLAT)', sizes: null, material: null,
    feature: '더 곱게 갈고 빨리 흘려야 좋은, 밀도 높은 워시드 원두에 맞춘 필터(제조사 설명)',
    sources: [maker('SIBARIST — UFO', 'https://sibarist.coffee/products/ufo')],
  },
];

export function findFilter(name) {
  return FILTER_CATALOG.find((f) => f.name === name) ?? null;
}

// 추출 준비·공유 글에 쓰는 한 줄: 「원뿔 · 01·02·03 · … · 약배전 · 권장 92℃」
export function filterLine(f) {
  if (!f) return '';
  return [f.shape, f.sizes, f.feature, f.roast ? `${f.roast}에 권장 ${f.tempC}℃` : null].filter(Boolean).join(' · ');
}
