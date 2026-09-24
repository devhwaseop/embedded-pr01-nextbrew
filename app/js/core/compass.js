// 맛 → 다음 추출 조정 제안 (커피 컴퍼스 방식, 사용자 결정 9/24 — 언스페셜티 브루잉 가이드 후보 5·6·7)
//
// 근거(docs/agent-notes/참고 출처 목록.md 「커피 컴퍼스」)
// - 방향과 조정: Barista Hustle «The Coffee Compass»(2021) — 가로축 과소추출↔과다추출, 세로축 진함↔연함.
//   더 추출 = 더 가늘게(또는 더 길게), 덜 추출 = 더 굵게. 원두를 줄이려면 물은 그대로 두고 원두를 줄인다(늘릴 때는 반대).
//   원판의 맛 단어: 과소추출 쪽 Sour·Salty·Vegetal·Nutty, 과다추출 쪽 Bitter·Dry·Powdery·Astringent,
//   진함 쪽 Heavy·Bulky·Harsh, 연함 쪽 Watery·Thin·Tea-like.
// - 한 번에 움직이는 단위(분쇄 30µm · 원두 0.5g): 언스페셜티 브루잉 가이드의 조정 단위를 따랐다. 규칙(어느 맛을 어디에 놓는가)은
//   옮기지 않았고, 아래 대응은 우리 설문 항목에 맞춰 새로 정한 것이다(평가 대상 — 써 보고 조정).
//
// 설문 값: 강도 level 1~5 = INTENSITY_WORDS(없음·약함·보통·강함·매우 강함), 선택 안 함 = null.
// 부호: extraction 음수 = 과소추출(더 추출해야 함), 양수 = 과다추출. strength 양수 = 진함, 음수 = 연함.

export const COMPASS_STEP = { grindUm: 30, doseG: 0.5 };
const MAX_EXTRACTION = 3;
const MAX_STRENGTH = 2;

// 추출 방향과 무관한 잡미 — 원문: 조정을 따라 해도 남으면 추출이 아니라 원두·로스팅(또는 물·도구) 문제일 가능성이 크다
const TAINTS = ['Metallic', 'Chemical', 'Musty/Earthy', 'Woody'];
const offKey = (s) => s.split(' (')[0];

const clamp = (v, m) => Math.max(-m, Math.min(m, v));

export function readCompass(survey, { roast = null } = {}) {
  if (!survey) return null;
  const it = survey.items ?? {};
  const cues = [];
  const add = (axis, dir, text) => cues.push({ axis, dir, text });

  // 과소추출: 시큼함(Sour)
  // dir 은 방향이자 무게(몇 단계)다
  const acid = it.acidity ?? {};
  if ((acid.kinds ?? []).includes('시큼한')) add('extraction', acid.level >= 4 ? -2 : -1, `산미가 시큼함${acid.level >= 4 ? '(강함 이상)' : ''}`);
  // 과다추출: 쓴맛(Bitter). 강배전은 쓴맛이 원두 성격이라 한 단계 낮춰 본다(가정 — 평가 대상)
  const bitter = it.bitterness?.level ?? null;
  const dark = roast === '강배전';
  if (bitter != null && bitter >= (dark ? 5 : 4)) {
    add('extraction', dark ? 1 : bitter - 3, `쓴맛이 ${bitter >= 5 ? '매우 강함' : '강함'}${dark ? '(강배전이라 한 단계 낮춰 봄)' : ''}`);
  }
  // 과다추출: 입안이 마름(Dry·Astringent), 가루 섞인 느낌(Powdery)
  const offs = (survey.offFlavors ?? []).map(offKey);
  if (offs.includes('Mouth-Drying')) add('extraction', 1, '입안이 마르는 잡미');
  if (offs.includes('Chalky')) add('extraction', 1, '가루 섞인 느낌');

  // 진함·연함: 바디감(Heavy ↔ Thin·Watery)
  const body = it.body?.level ?? null;
  if (body != null && body >= 5) add('strength', 1, '바디감이 매우 강함');
  if (body != null && body <= 2) add('strength', -1, `바디감이 ${body === 1 ? '없음' : '약함'}`);

  const sum = (axis) => cues.filter((c) => c.axis === axis).reduce((a, c) => a + c.dir, 0);
  const underCues = cues.some((c) => c.axis === 'extraction' && c.dir < 0);
  const overCues = cues.some((c) => c.axis === 'extraction' && c.dir > 0);
  const mixed = underCues && overCues; // 시큼함과 쓴맛·마름이 함께 — 방향이 엇갈려 분쇄는 움직이지 않는다
  let extraction = mixed ? 0 : sum('extraction');
  // 단맛이 약하면(없음·약함) 이미 정해진 방향으로 한 단계 더 — 단맛은 양쪽 모두에서 줄어 방향을 정하지는 못한다
  const sweet = it.sweetness?.level ?? null;
  const sweetLow = sweet != null && sweet <= 2;
  if (extraction !== 0 && sweetLow) {
    extraction += Math.sign(extraction);
    add('extraction', Math.sign(extraction), '단맛이 약함(같은 방향으로 한 단계 더)');
  }
  const answered = Object.values(it).some((v) => v?.level != null) || offs.length > 0;
  return {
    extraction: clamp(extraction, MAX_EXTRACTION),
    strength: clamp(sum('strength'), MAX_STRENGTH),
    cues,
    mixed,
    taints: offs.filter((o) => TAINTS.includes(o)),
    liked: survey.liking != null && survey.liking >= 4,
    answered,
    roast,
  };
}

// 제안: grindUm 양수 = 굵게, 음수 = 가늘게. clicks 는 그라인더의 클릭당 µm 를 알 때만(양수 = 다이얼 숫자를 올림).
// doseDeltaG 는 물을 그대로 둔 채 원두를 얼마나 바꾸는지.
export function adviseNext(compass, { umPerClick = null } = {}) {
  if (!compass || !compass.answered) return null;
  const grindUm = compass.extraction * COMPASS_STEP.grindUm;
  const doseDeltaG = -compass.strength * COMPASS_STEP.doseG;
  const clicks = grindUm && umPerClick ? Math.round(grindUm / umPerClick) : null;
  const lines = [];
  if (grindUm) {
    const dir = grindUm < 0 ? '가늘게' : '굵게';
    const click = clicks ? ` · 약 ${Math.abs(clicks)}클릭 ${dir}` : '';
    lines.push(`분쇄를 약 ${Math.abs(grindUm)}µm ${dir}${click}`);
  }
  if (doseDeltaG) lines.push(`원두를 ${Math.abs(doseDeltaG)}g ${doseDeltaG > 0 ? '늘리기' : '줄이기'} (물은 그대로)`);
  if (compass.mixed) lines.push('시큼함과 쓴맛·마름이 함께 있어 방향이 엇갈립니다. 분쇄는 그대로 두고 한 번 더 내려 보세요.');
  const keep = !grindUm && !doseDeltaG && !compass.mixed;
  if (keep) {
    lines.push(
      compass.liked
        ? '걸리는 맛이 없고 만족도도 좋아 지금 설정을 유지합니다.'
        : '방향을 정할 단서(시큼함·쓴맛·마름·바디감)가 없어 조정을 제안하지 않습니다.',
    );
  } else if (compass.liked) {
    lines.push('만족도가 좋음 이상이라 바꾸지 않고 그대로 가도 됩니다.');
  }
  if (compass.taints.length) {
    lines.push(`${compass.taints.join('·')}은 추출 방향과 무관한 잡미라 계산에서 뺐습니다. 조정한 뒤에도 남으면 원두(가공·로스팅)나 물·도구 쪽일 수 있습니다.`);
  }
  return { grindUm, clicks, doseDeltaG, keep, lines };
}

// 클릭당 µm: 설정에 적은 값이 먼저, 없으면 이 그라인더 기록들의 (실제 클릭, 참고 µm)로 기울기를 구한다.
// 실제 클릭 = 다이얼 + 그때의 영점 — 영점을 바꿔도 같은 위치끼리 비교되게. 서로 다른 클릭이 둘 이상이어야 한다.
export function estimateUmPerClick(brews, grinderId) {
  const pts = brews
    .map((b) => b.conditions?.grind)
    .filter((g) => g && g.grinderId === grinderId && g.dial != null && g.um != null)
    .map((g) => [g.dial + (g.zeroOffset || 0), g.um]);
  if (new Set(pts.map((p) => p[0])).size < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const slope = sxy / sxx;
  if (!Number.isFinite(slope) || slope === 0) return null;
  return { value: Math.round(slope * 10) / 10, n };
}

export function umPerClickFor(grinder, brews) {
  if (!grinder) return null;
  if (grinder.umPerClick) return { value: grinder.umPerClick, source: 'manual' };
  const est = estimateUmPerClick(brews, grinder.id);
  return est ? { value: est.value, source: 'records', n: est.n } : null;
}

// 준비 화면용: 같은 레시피(원두를 골랐으면 같은 원두까지)의 가장 최근 «설문한» 기록
export function lastSurveyed(brews, { recipeId, beanId = null }) {
  return brews
    .filter((b) => b.survey && b.recipe.id === recipeId && (!beanId || b.bean?.id === beanId))
    .sort((a, b) => b.timer.startedAt - a.timer.startedAt)[0] ?? null;
}
