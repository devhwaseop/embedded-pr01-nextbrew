// 그래프용 점 계산(화면과 무관한 순수 함수 — 테스트 대상). 사용자 결정 9/24: 언스페셜티 레시피 상세의 «누적 물량 그래프»·«단계 시간표»를 참고.
//
// 가로 = 경과 초, 세로 = 저울 누적 목표(g). 붓기는 단계 시작부터 pourSec 동안 고르게 붓는다고 보고 직선으로 잇는다
// (pourSec 가 없는 레시피는 다음 단계 시작까지 고르게). 이것은 타이머의 «지금쯤 저울 값»과 같은 기준선이다.
// 실제선은 저울을 잰 값이 아니다 — 같은 붓기를 «실제로 누른 시각»에 맞춰 옮긴 선이다. 화면에도 그렇게 밝힌다.

import { timerOf } from './schema.js';

function curve(segments, endSec) {
  const pts = [[0, 0]];
  let cum = 0;
  for (const { start, end, target, pourSec } of segments) {
    const pourEnd = pourSec != null ? Math.min(start + pourSec, end) : end;
    pts.push([start, cum], [pourEnd, target], [end, target]);
    cum = target;
  }
  if (endSec != null && endSec > pts[pts.length - 1][0]) pts.push([endSec, cum]);
  // 같은 점이 이어지면 하나로
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

// plan = core/recipe.js buildPlan() 결과
export function planPoints(plan) {
  const s = plan.steps;
  return curve(
    s.map((st, i) => ({ start: st.startSec, end: i === s.length - 1 ? plan.endSec : s[i + 1].startSec, target: st.targetCumG, pourSec: plan.pourSec })),
    plan.endSec,
  );
}

// 저장된 기록(brew)의 계획선 — timer.steps 에 계획 시각과 목표 g 이 함께 들어 있다
export function brewPlanPoints(b) {
  const pourSec = b.recipe.snapshot?.pourSec ?? null;
  return curve(
    timerOf(b).steps.map((s) => ({ start: s.plannedStartSec, end: s.plannedEndSec, target: s.targetCumG, pourSec })),
    b.timer.plannedTotalSec,
  );
}

// 실제로 누른 시각에 맞춘 선
export function brewActualPoints(b) {
  const pourSec = b.recipe.snapshot?.pourSec ?? null;
  return curve(
    timerOf(b).steps
      .filter((s) => s.actualStartSec != null && s.actualEndSec != null)
      .map((s) => ({ start: s.actualStartSec, end: s.actualEndSec, target: s.targetCumG, pourSec })),
    timerOf(b).totalSec,
  );
}

// 단계 시간표(가로 막대): 단계마다 [붓기 구간, 기다림 구간]
export function planBars(plan) {
  const s = plan.steps;
  return s.map((st, i) => {
    const end = i === s.length - 1 ? plan.endSec : s[i + 1].startSec;
    const pourEnd = plan.pourSec != null ? Math.min(st.startSec + plan.pourSec, end) : end;
    return { label: st.label, start: st.startSec, pourEnd, end, targetCumG: st.targetCumG };
  });
}

// 눈금: 30초 단위(3분이 넘으면 60초), 세로는 50g 단위(300g 이 넘으면 100g)
export function ticks(max, small, big, limit) {
  const step = max > limit ? big : small;
  const out = [];
  for (let v = 0; v <= max + 0.001; v += step) out.push(v);
  return out;
}
