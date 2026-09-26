// 붓는 방법 설명(9/26 사용자 요청 — 추출 준비에서 고를 때마다 붓는 모습과 추출 특징이 바뀌어 보이게).
// 붓는 모습은 제조사 안내, 추출 특징은 로스터리·업계 매체 글에서 옮겼다(제조사 자료가 아니라 화면에 «참고 글»로 밝힌다).
// 「원 푸어」는 한 번에 이어 붓기(one pour)로 본다 — 앱 기본 드리퍼 MUGEN(원 푸어 드리퍼)에 맞춰 둔 말이다(9/26 에이전트 해석, 사용자 확인 전).
// 전체 출처 = docs/agent-notes/참고 출처 목록.md 「붓는 방법」.

const CHECKED = '2026-09-26';
const src = (kind, label, url) => ({ kind, label, url, checkedAt: CHECKED });
const HARIO = src('maker', 'HARIO — Paper Filter Pour Over', 'https://global.hario.com/coffeelife/paper-drip.html');
const MUGEN = src('maker', 'HARIO — V60 One Pour Dripper MUGEN', 'https://global.hario.com/product/coffee/dripper/VDMU.html');
const ACHILLES = src('article', 'Achilles Coffee Roasters — Pour-Over Agitation Explained', 'https://achillescoffeeroasters.com/blogs/specialty-coffee-blog/pour-over-coffee-agitation-explained');
const PDG = src('article', 'Perfect Daily Grind — What Is Agitation', 'https://perfectdailygrind.com/2017/08/what-is-agitation-how-does-it-make-my-filter-coffee-better/');

export const POUR_GUIDE = {
  나선형: {
    how: '가운데에서 시작해 원을 그리며 붓습니다. HARIO 는 가운데에서 지름 25mm 원을 그리듯 붓고, 몇 잔이든 3분 안에 끝내라고 안내합니다.',
    effect: '물이 가루 위로 넓게 퍼져 고르게 젖습니다. 대신 원의 크기·속도·높이·물줄기가 함께 바뀌기 쉬워 매번 똑같이 붓기 어렵고, 종이 벽에 바로 부으면 물이 가루를 비켜 흐를 수 있습니다. 붓는 속도로 맛의 진하기를 조절할 수 있습니다(HARIO).',
    sources: [HARIO, ACHILLES],
  },
  '센터 푸어': {
    how: '가운데 한 곳에만 물줄기를 떨어뜨려 붓습니다.',
    effect: '힘이 한 곳에 모여 다루기 쉽고 벽 쪽 가루를 덜 흔듭니다. 대신 가운데가 깊게 파이거나 바깥쪽 가루가 덜 섞일 수 있습니다.',
    sources: [ACHILLES],
  },
  '원 푸어': {
    how: '물을 나누지 않고 한 번에 이어서 붓습니다(원 = one). HARIO MUGEN 처럼 한 번 붓기에 맞춘 드리퍼가 있습니다.',
    effect: 'MUGEN 은 종이가 벽에 붙어 천천히 내려가게 만들어 한 번 붓기로 내립니다(HARIO). 여러 번 나눠 붓기(펄스)는 벽에 말라붙는 가루를 줄이는 데 도움이 된다고 하니, 한 번에 부을 때는 벽에 가루가 남는지 보세요.',
    sources: [MUGEN, PDG],
  },
};

export const GUIDE_SOURCE_WORDS = { maker: '제조사 안내', article: '참고 글' };
