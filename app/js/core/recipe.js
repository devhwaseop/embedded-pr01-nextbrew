// 레시피 → 이번 추출 계획. 원두량을 넣으면 물·얼음·단계별 목표 g을 비율로 계산한다.
// 시각(startSec·endSec)은 원문 그대로 둔다. 원두량에 따라 시간을 바꾸는 검증된 공식이 없어서다
// (근거·원문 링크: docs/agent-notes/참고 출처 목록.md 「원두량 조정」).

// 단계 설명 고르기(사용자 결정 9/24): 직접 쓴 문장 → 레시피 원문 → 일반 설명 → 비움.
// customHints = 설정의 stepHints[레시피 id] = { 단계 번호: 문장 }
export const HINT_SOURCES = { custom: '내가 씀', recipe: '레시피 원문', general: '일반 설명', none: '없음' };
export function stepHint(recipe, index, customHints = null) {
  const mine = customHints?.[index]?.trim();
  if (mine) return { text: mine, source: 'custom' };
  const s = recipe.steps[index];
  if (s?.hint) return { text: s.hint, source: s.hintSource ?? 'recipe' };
  return { text: '', source: 'none' };
}

// waterG = 뜨거운 물을 직접 정한 값(선택). 비우면 원두량 × 레시피 비율. 단계 목표 g 은 어느 쪽이든 같은 % 로 나눈다.
// (준비 화면에서 원두량·뜨거운 물·비율을 다 조정할 수 있게 — 9/24. 화면은 비율을 저장하고 원두량 × 비율을 여기로 넘긴다)
export function buildPlan(recipe, doseG, customHints = null, { waterG = null } = {}) {
  const dose = Number(doseG) || recipe.refDoseG;
  const hotWaterG = waterG != null ? Math.round(waterG) : Math.round(dose * recipe.waterRatio);
  const iceG = Math.round(dose * (recipe.iceRatio ?? 0));
  const steps = recipe.steps.map((s, i) => ({
    index: i,
    kind: s.kind,
    label: s.label,
    hint: stepHint(recipe, i, customHints).text,
    hintSource: stepHint(recipe, i, customHints).source,
    startSec: s.startSec,
    // 마지막 단계는 반올림 오차 없이 전체 물량과 딱 맞춘다
    targetCumG: i === recipe.steps.length - 1 ? hotWaterG : Math.round(hotWaterG * s.cumPct),
  }));
  return {
    recipeId: recipe.id,
    doseG: dose,
    hotWaterG,
    iceG,
    tempC: recipe.tempC,
    dilutionG: recipe.dilutionG ?? 0,
    steps,
    endSec: recipe.endSec,
    pourSec: recipe.pourSec ?? null,
    ratioHot: hotWaterG / dose,
    ratioTotal: (hotWaterG + iceG) / dose,
    isRefDose: dose === recipe.refDoseG,
    waterFixed: waterG != null,
  };
}

// 레시피 태그(사용자 결정 9/24 — 언스페셜티 레시피 목록의 태그 참고): 핫/아이스 · 드리퍼 · 붓는 횟수(뜸 포함)
export function recipeTags(recipe) {
  return [recipe.style === 'iced' ? '아이스' : '핫', recipe.designedFor, `${recipe.steps.length}번 붓기`].filter(Boolean);
}

// 기준 원두량과 다를 때 «방향»만 알려준다. 단일 값은 내지 않는다(사용자 결정 9/23).
export function scaleAdvice(recipe, doseG) {
  const dose = Number(doseG);
  if (!dose || dose === recipe.refDoseG) return null;
  if (dose > recipe.refDoseG) {
    return {
      direction: 'up',
      text: `기준(${recipe.refDoseG}g)보다 원두가 많아 원두층이 두꺼워집니다. 물이 늦게 빠지면 분쇄를 굵게 하는 쪽으로 조정해 보세요.`,
    };
  }
  return {
    direction: 'down',
    text: `기준(${recipe.refDoseG}g)보다 원두가 적어 원두층이 얇아집니다. 물이 빨리 빠지면 분쇄를 가늘게 하거나 나눠 붓는 쪽을 고려해 보세요.`,
  };
}

export function formatRatio(r) {
  return `1:${(Math.round(r * 10) / 10).toString()}`;
}
