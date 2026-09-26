// 드리퍼 기본 목록(9/26 사용자 결정 — 유명 드리퍼를 모두 기본으로 두고, AI·직접 입력과 같은 형식으로 쓴다).
// 까닭(사용자): 형식을 통일하려는 것과, AI 가 드리퍼 특징을 모르거나 치우쳐 알 수 있어서.
// 값은 출처 페이지에 적힌 것만 옮겼다(2026-09-26 확인). 페이지에 없는 칸은 null — 지어 채우지 않는다.
// 출처 종류: maker = 제조사 페이지, seller = 판매처 페이지(제조사 페이지가 열리지 않거나 그 값이 없을 때 — 화면에 그렇게 밝힌다).
// 전체 출처·확인 내용은 docs/agent-notes/참고 출처 목록.md 「드리퍼 기본 목록」.

export const DRIPPER_SHAPES = { cone: '원뿔', flat: '평바닥', wedge: '사다리꼴', mixed: '원뿔·평바닥 겸용' };
export const DRIPPER_METHODS = { pour: '투과(부어 흘려 내림)', immersion: '침지(담갔다가 내림)', both: '투과·침지 겸용' };
export const SOURCE_KINDS = { maker: '제조사 자료', seller: '판매처 자료', ai: 'AI 답', user: '직접 입력' };

const CHECKED = '2026-09-26';
const maker = (label, url) => ({ kind: 'maker', label, url, checkedAt: CHECKED });
const seller = (label, url) => ({ kind: 'seller', label, url, checkedAt: CHECKED });

// sizes = [[크기 이름, 잔 수·용량(출처에 있을 때만, 없으면 null)]]
export const DRIPPER_CATALOG = [
  {
    key: 'hario-v60', brand: 'HARIO', model: 'V60',
    sizes: [['01', '1~2잔'], ['02', '1~4잔'], ['03', '1~6잔']],
    shape: 'cone', method: 'pour',
    holes: '큰 구멍 1개', ribs: '위까지 올라가는 결(종이와 벽 사이로 공기가 빠짐)',
    materials: ['플라스틱', '세라믹', '내열 유리', '금속'],
    filter: 'V60 종이 필터(같은 크기)',
    note: '원뿔 60°',
    sources: [maker('HARIO — V60 series', 'https://global.hario.com/v60/v60series.html'), maker('HARIO Europe — V60 Glass Dripper(크기별 잔 수)', 'https://www.hario-europe.com/products/hario-v60-dripper-glass')],
  },
  {
    key: 'hario-switch', brand: 'HARIO', model: 'V60 스위치',
    sizes: [['02', '완성 200mL'], ['03', null]],
    shape: 'cone', method: 'both',
    holes: '스테인리스 공이 막고, 단추를 누르면 내려감', ribs: null,
    materials: ['내열 유리(실리콘 받침)', '세라믹'],
    filter: 'V60 종이 필터(같은 크기)',
    note: '물을 담가 두었다가 단추로 내리는 침지, V60 처럼 흘려 내리는 투과 둘 다',
    sources: [maker('HARIO Europe — V60 Immersion Dripper Switch', 'https://www.hario-europe.com/products/v60-immersion-dripper-switch'), maker('HARIO USA — V60 SWITCH', 'https://www.hario-usa.com/products/switch-immersion-dripper')],
  },
  {
    key: 'hario-mugen', brand: 'HARIO', model: 'V60 MUGEN',
    sizes: [['02', '1~2잔']],
    shape: 'cone', method: 'pour',
    holes: null, ribs: '별 모양 홈(종이가 벽에 붙어 천천히 내려감)',
    materials: ['플라스틱(AS 수지)', '세라믹'],
    filter: 'V60 종이 필터 02',
    note: '한 번에 천천히 부어 내리는 드리퍼(원 푸어)',
    sources: [maker('HARIO Europe — V60 One Pour Dripper MUGEN', 'https://www.hario-europe.com/products/v60-one-pour-dripper-mugen')],
  },
  {
    key: 'kalita-wave', brand: 'Kalita', model: 'Wave',
    sizes: [['155', '1~2잔'], ['185', '2~4잔']],
    shape: 'flat', method: 'pour',
    holes: '구멍 3개', ribs: null,
    materials: ['유리', '스테인리스', '세라믹(185)'],
    filter: 'Kalita Wave 필터(같은 크기) — 주름이 벽과 닿는 면을 줄임',
    note: null,
    sources: [maker('Kalita — Find Your Perfect Kalita Dripper', 'https://kalitaofficial.com/2025/12/10/find-your-perfect-kalita-dripper-a-comparison/')],
  },
  {
    key: 'kalita-10x', brand: 'Kalita', model: '102·103',
    sizes: [['102', '2~4잔'], ['103', '4~7잔']],
    shape: 'wedge', method: 'pour',
    holes: '구멍 3개', ribs: null,
    materials: ['플라스틱', '세라믹'],
    filter: 'Kalita 102·103 필터(같은 크기)',
    note: '추출이 조금 길다(제조사 설명)',
    sources: [maker('Kalita — Find Your Perfect Kalita Dripper', 'https://kalitaofficial.com/2025/12/10/find-your-perfect-kalita-dripper-a-comparison/')],
  },
  {
    key: 'melitta-aroma', brand: 'Melitta', model: '아로마필터',
    sizes: [['1×1', null], ['1×2', null], ['1×4', null]],
    shape: null, method: 'pour',
    holes: '추출구 1개', ribs: '안쪽 홈(추출 시간·물 흐름 조절)',
    materials: ['AS 수지'],
    filter: 'Melitta 종이 필터(같은 크기)',
    note: '물을 한 번에 부어도 되게 만든 드리퍼(제조사 설명)',
    sources: [maker('Melitta Japan — アロマフィルター', 'https://www.melitta.co.jp/melitta_hh/pourover/aromafilter/')],
  },
  {
    key: 'origami', brand: 'ORIGAMI', model: 'Dripper',
    sizes: [['S', '2잔'], ['M', '4잔']],
    shape: 'mixed', method: 'pour',
    holes: '구멍 1개(지름 25mm)', ribs: '20골(공기 통로)',
    materials: ['세라믹(미노야키)'],
    filter: 'ORIGAMI 필터(Cup2·Cup4) · Kalita Wave(155·185) · V60(01·02) — 원뿔 필터면 원뿔, 웨이브 필터면 평바닥',
    note: null,
    sources: [seller('Kurasu — ORIGAMI Dripper(제조사 사이트 origami-inc.jp 는 인증서 만료로 열리지 않음)', 'https://kurasu.kyoto/products/origami-dripper')],
  },
  {
    key: 'chemex-classic', brand: 'CHEMEX', model: 'Classic',
    sizes: [['3컵', '15oz'], ['6컵', '30oz'], ['8컵', '40oz'], ['10컵', '50oz']],
    shape: null, method: 'pour',
    holes: null, ribs: null,
    materials: ['붕규산 유리(나무 손잡이·가죽 끈)'],
    filter: 'CHEMEX Bonded 필터(접힌 원형·사각, 반달)',
    note: '드리퍼와 서버가 한 몸',
    sources: [maker('CHEMEX — Classic Series Info and Support', 'https://chemexcoffeemaker.com/pages/classic-series-product-support')],
  },
  {
    key: 'kono-meimon', brand: 'KONO', model: '명문(名門)',
    sizes: [['2인용', null], ['4인용', null]],
    shape: 'cone', method: 'pour',
    holes: null, ribs: '아래쪽 절반에만 있는 홈',
    materials: ['아크릴 수지(내열 90℃)'],
    filter: 'KONO 종이 필터(같은 크기)',
    note: null,
    sources: [maker('珈琲サイフオン — 名門2人用フィルター(재질)', 'https://coffee-syphon.co.jp/meimon_filter/221094'), seller('Kurasu — KONO Meimon Dripper(모양·홈)', 'https://kurasu.kyoto/products/kono-meimon-2-person-dripper-clear-2-person-4-person')],
  },
  {
    key: 'clever', brand: 'CLEVER', model: 'Dripper',
    sizes: [['기본', '실사용 500mL']],
    shape: null, method: 'immersion',
    holes: '바닥 밸브 — 컵·서버에 올리면 열림', ribs: null,
    materials: ['트라이탄(BPA 없음)'],
    filter: '#4 종이 필터',
    note: '담가 두었다가 컵·서버에 올려 내리는 침지',
    sources: [maker('CLEVER — CLEVER Dripper', 'https://cleverbrewing.coffee/products/clever-dripper')],
  },
  {
    key: 'cafec-flower', brand: 'CAFEC', model: 'Flower Dripper',
    sizes: [['Cup1', '1잔'], ['Cup4', '2~4잔']],
    shape: 'cone', method: 'pour',
    holes: null, ribs: '꽃잎 모양 홈(종이와 벽 사이 공기층)',
    materials: ['트라이탄'],
    filter: 'CAFEC 원뿔 종이 필터',
    note: '원뿔 60°',
    sources: [maker('CAFEC — DRIPPER', 'https://cafec-jp.com/products/dripper/')],
  },
  {
    key: 'april', brand: 'April', model: 'Brewer(플라스틱)',
    sizes: [['기본', null]],
    shape: 'flat', method: 'pour',
    holes: null, ribs: null,
    materials: ['폴리카보네이트'],
    filter: 'Kalita Wave 155·185 · April 필터 · Saint Anthony F70',
    note: '평바닥이 흐름을 조절(판매처 설명)',
    sources: [seller('The Roasters Pack — April Dripper(Plastic V2)(제조사 aprilcoffeeroasters.com 상품 페이지가 열리지 않음)', 'https://us.theroasterspack.com/products/april-dripper-plastic')],
  },
  {
    key: 'orea-v4', brand: 'OREA', model: 'Brewer V4',
    sizes: [['Narrow', '원두 28g까지'], ['Wide', '원두 36g까지']],
    shape: 'flat', method: 'pour',
    holes: '바닥 4종 교체(Classic·Open·Fast·APEX)', ribs: null,
    materials: ['폴리프로필렌(스테인리스 받침)'],
    filter: 'Wave 185 · 평바닥 필터 · 원뿔 필터(APEX 바닥)',
    note: 'APEX 바닥은 원뿔과 평바닥 사이',
    sources: [seller('The Roasters Pack — Orea V4 Brewer', 'https://us.theroasterspack.com/products/orea-v4-brewer')],
  },
];

export function findCatalog(key) {
  return DRIPPER_CATALOG.find((c) => c.key === key) ?? null;
}

// 기본 목록 한 줄 → 드리퍼 칸 값(등록 형식). 재질은 여러 가지라 골랐을 때만 넣는다.
export function catalogFields(key, size, material = null) {
  const c = findCatalog(key);
  if (!c) return null;
  const s = c.sizes.find(([n]) => n === size) ?? c.sizes[0];
  return {
    catalogKey: c.key,
    brand: c.brand,
    model: c.model,
    size: s[0],
    cups: s[1],
    shape: c.shape,
    method: c.method,
    holes: c.holes,
    ribs: c.ribs,
    material: material ?? (c.materials.length === 1 ? c.materials[0] : null),
    filter: c.filter,
    note: c.note ?? '',
    sources: structuredClone(c.sources),
  };
}

export function catalogName(key, size) {
  const c = findCatalog(key);
  return c ? [c.brand, c.model, size && size !== '기본' ? size : null].filter(Boolean).join(' ') : '';
}

// 앱이 처음에 만들어 두던 드리퍼(9/26 전 DRIPPERS) — 이름은 그대로 두고 기본 목록과 잇는다(core/migrate.js)
export const DRIPPER_SEEDS = [
  { name: 'Hario V60 02', key: 'hario-v60', size: '02' },
  { name: 'Hario V60 MUGEN 02', key: 'hario-mugen', size: '02' },
];
