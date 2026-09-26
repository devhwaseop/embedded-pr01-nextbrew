// 추출 타이머 엔진 — 화면과 무관한 순수 함수만 둔다(테스트 대상).
//
// 원칙
// - 모든 시간은 «시작 시각(startedAt, epoch ms)» 기준으로 계산한다. 매초 더하는 카운터를 쓰지 않으므로
//   화면이 꺼졌다 켜지거나 탭이 백그라운드로 가도 시간이 틀어지지 않는다.
// - 단계 전환은 사용자의 버튼으로만 일어난다(자동으로 넘기지 않는다). 목표 시각이 지나면 초과(+N초)만 보여준다.
// - 남은 시간은 원문 레시피의 절대 시각 기준이다: 현재 단계의 목표 = 다음 단계 startSec, 마지막 단계면 endSec.
// - 상태(state)는 JSON으로 저장할 수 있는 평범한 객체다. 새로고침돼도 이어서 쓸 수 있게 하기 위해서다.

import { round1 } from './schema.js';

export function startBrew(nowMs) {
  return { startedAt: nowMs, stepIndex: 0, stepStartsSec: [0], endedSec: null, status: 'running' };
}

// 준비 상태(사용자 요청 9/25): 준비 화면에서 [다음]을 누르면 타이머 화면이 먼저 뜨고, [시작]을 누른 순간부터 센다.
// 준비 화면의 [추출 시작]이 곧바로 시간을 재기 시작해, 물을 붓기 전의 몇 초가 기록에 섞이던 것을 막는다.
export function readyBrew() {
  return { startedAt: null, stepIndex: 0, stepStartsSec: [0], endedSec: null, status: 'ready' };
}

export function elapsedSec(state, nowMs) {
  if (state.startedAt == null) return 0; // 준비 상태
  const end = state.endedSec != null ? state.startedAt + state.endedSec * 1000 : nowMs;
  return Math.max(0, (end - state.startedAt) / 1000);
}

export function view(state, plan, nowMs) {
  const i = state.stepIndex;
  const step = plan.steps[i];
  const isLast = i === plan.steps.length - 1;
  const elapsed = elapsedSec(state, nowMs);
  const targetSec = isLast ? plan.endSec : plan.steps[i + 1].startSec;
  const actualStart = state.stepStartsSec[i];
  const remaining = targetSec - elapsed;
  const span = Math.max(1, targetSec - actualStart);
  // 붓는 구간: 이 단계를 시작한 뒤 pourSec 초 동안(레시피에 값이 있을 때만)
  // 누른 시각은 0.1초로 반올림해 저장하므로 누른 직후엔 음수가 될 수 있다(남은 붓기 시간이 11초로 보이던 것) — 0 아래는 0
  const sinceStart = Math.max(0, elapsed - actualStart);
  const pouring = plan.pourSec != null && sinceStart < plan.pourSec;
  // 붓는 속도 안내: 이 단계에서 부을 양을 pourSec 동안 «고르게» 붓는다고 보고 계산한 값이다.
  // 원문은 «10초 안에 끝내라»까지만 말하므로, 초당 g과 «지금쯤 저울 값»은 앱이 만든 기준선이다.
  const pourFromG = i > 0 ? plan.steps[i - 1].targetCumG : 0;
  const pourAmountG = step.targetCumG - pourFromG;
  const rate = plan.pourSec ? pourAmountG / plan.pourSec : null;
  return {
    pouring,
    pourLeftSec: pouring ? plan.pourSec - sinceStart : 0,
    pourDone: plan.pourSec != null && !pouring, // 붓는 시간이 지나 기다리는 구간
    pourFromG,
    pourAmountG,
    pourRateGps: rate == null ? null : Math.round(rate * 10) / 10,
    expectedNowG: pouring ? Math.min(step.targetCumG, Math.round(pourFromG + rate * sinceStart)) : null,
    elapsed,
    stepIndex: i,
    step,
    isLast,
    targetSec,
    remainingSec: remaining, // 음수면 초과
    overSec: remaining < 0 ? -remaining : 0,
    progress: Math.min(1, Math.max(0, (elapsed - actualStart) / span)),
    next: isLast ? null : plan.steps[i + 1],
    buttonLabel: isLast ? '종료' : '다음 푸어',
  };
}

// 다음 단계로 넘기거나(마지막 단계면) 끝낸다. 원래 state는 바꾸지 않는다.
// atSec(선택) = 누른 시각 대신 이 시각에 넘긴 것으로 기록한다 — 깜박하고 못 눌렀을 때 레시피 시각으로 고치기(9/25).
// 지금 단계를 시작한 시각보다 앞이거나 지금보다 뒤면 그 안으로 맞춘다.
export function advance(state, plan, nowMs, { atSec = null } = {}) {
  if (state.status !== 'running') return state;
  const now = round1(elapsedSec(state, nowMs));
  const t = atSec == null ? now : round1(Math.min(now, Math.max(state.stepStartsSec[state.stepIndex], atSec)));
  if (state.stepIndex >= plan.steps.length - 1) {
    return { ...state, endedSec: t, status: 'ended' };
  }
  return { ...state, stepIndex: state.stepIndex + 1, stepStartsSec: [...state.stepStartsSec, t] };
}

// 되돌리기: 방금 한 [다음 푸어]·[종료]를 없던 일로 한다(연타·실수 복구 — 사용자 결정 9/24, 탭 + 되돌리기).
// 종료 직후면 다시 진행 중으로, 단계를 넘긴 직후면 한 단계 앞으로. 원래 state는 바꾸지 않는다.
export function undoAdvance(state) {
  if (state.status === 'ended') return { ...state, endedSec: null, status: 'running' };
  if (state.status !== 'running' || state.stepIndex === 0) return state;
  return { ...state, stepIndex: state.stepIndex - 1, stepStartsSec: state.stepStartsSec.slice(0, -1) };
}

// ── 방치 확인(사용자 요청 9/24 — 넷플릭스 「아직 보고 계신가요?」 방식) ──────────────
// 넷플릭스는 «조작 없이 일정 분량을 보면» 묻고 재생을 멈춘다(help.netflix.com/en/node/114059).
// 추출에 옮기면: 지금 단계의 목표 시각이 지나고도 아무 버튼도 누르지 않으면 묻는다. 언제 묻나(9/25 사용자 요청으로 바꿈):
//   - 마지막 단계가 아니면: 다음 단계 시간의 절반이 지났을 때(다음 푸어를 붓는 중인데 [다음 푸어]를 안 누른 것 — 깜박한 것).
//     쿠라스: 뜸 들이기는 40 + 1차 푸어 30초의 절반 = 55초, 1차 푸어는 70 + 2차 푸어 60초의 절반 = 100초.
//   - 마지막 단계: 드로다운이 레시피보다 늦는 일이 흔해 예전 기준 그대로 — 레시피 전체 시간의 절반(최소 60초). 쿠라스(2:10)는 65초.
//   - [계속 추출]로 답했으면 그때부터 CHECK 초 뒤에 다시 묻는다.
// 묻고도 ABANDON 초 동안 답이 없으면 기록 없이 끝낸다(취소와 같은 처리, 로그만 남김).
// 타이머는 묻는 동안에도 멈추지 않는다 — 실제 시간이 흐르므로 기록 시각을 틀리게 만들지 않기 위해서다.
export const STILL_HERE = { minSec: 60, ratio: 0.5, abandonSec: 300 };

export function checkAfterSec(plan) {
  return Math.max(STILL_HERE.minSec, Math.round(plan.endSec * STILL_HERE.ratio));
}

// 단계 i 의 목표 시각이 지나고 몇 초 뒤에 묻나
export function askGapSec(plan, i) {
  const last = plan.steps.length - 1;
  if (i >= last) return checkAfterSec(plan);
  const nextStart = plan.steps[i + 1].startSec;
  const nextEnd = i + 1 === last ? plan.endSec : plan.steps[i + 2].startSec;
  return Math.max(5, Math.round((nextEnd - nextStart) / 2));
}

// phase: 'ok' | 'ask'(물어볼 때) | 'abandon'(답이 없어 끝낼 때)
export function presence(state, plan, nowMs) {
  if (state.status !== 'running') return { phase: 'ok' };
  const every = checkAfterSec(plan);
  const i = state.stepIndex;
  const targetSec = i === plan.steps.length - 1 ? plan.endSec : plan.steps[i + 1].startSec;
  // [계속 추출]로 답했으면 그때부터 다시 CHECK 초 뒤에 묻는다
  const askAtSec = Math.max(targetSec + askGapSec(plan, i), state.ackAtSec != null ? state.ackAtSec + every : -Infinity);
  const stopAtSec = askAtSec + STILL_HERE.abandonSec;
  const t = elapsedSec(state, nowMs);
  const phase = t < askAtSec ? 'ok' : t < stopAtSec ? 'ask' : 'abandon';
  return { phase, askAtSec, stopAtSec, overSec: Math.max(0, t - targetSec) };
}

// [계속 추출] — 답한 시각을 남긴다. 단계를 넘겨도 이 값은 그대로 따라간다.
export function acknowledge(state, nowMs) {
  return { ...state, ackAtSec: round1(elapsedSec(state, nowMs)) };
}

export function cancel(state, nowMs) {
  return { ...state, endedSec: round1(elapsedSec(state, nowMs)), status: 'cancelled' };
}

// 끝난 추출을 기록에 넣을 모양으로 정리한다. 단계의 끝 = 다음 단계를 누른 시각(마지막은 종료 시각).
export function summarize(state, plan) {
  const steps = plan.steps.map((s, i) => {
    const plannedEndSec = i === plan.steps.length - 1 ? plan.endSec : plan.steps[i + 1].startSec;
    const actualEndSec = i === plan.steps.length - 1 ? state.endedSec : state.stepStartsSec[i + 1];
    return {
      kind: s.kind,
      label: s.label,
      targetCumG: s.targetCumG,
      plannedStartSec: s.startSec,
      plannedEndSec,
      actualStartSec: state.stepStartsSec[i],
      actualEndSec,
    };
  });
  return {
    startedAt: state.startedAt,
    steps,
    totalSec: state.endedSec,
    plannedTotalSec: plan.endSec,
  };
}
