// 핵심 로직 테스트 — 실행: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatGrind, grindActual, formatSec, formatDelta, createBrew, emptySurvey, timingVerdict, netServerWeight, SURVEY_ITEMS } from '../app/js/core/schema.js';
import { timerOf, linkWeights, measuredDilution, dilutionView, createBean, beanAutoName, beanNameIsAuto, purchasedGrams, beanStock, roastedFromBestBefore, daysSince, ROASTS } from '../app/js/core/schema.js';
import { buildPlan, scaleAdvice, stepHint } from '../app/js/core/recipe.js';
import { startBrew, readyBrew, elapsedSec, view, advance, undoAdvance, cancel, summarize, presence, acknowledge, checkAfterSec, askGapSec } from '../app/js/core/timer.js';
import { buildSharePackage, findShareRelations, toMarkdown, toJSON, shareFileName, shareSheetName, defaultSharePrompt, SHARE_ROLES } from '../app/js/core/share.js';
import { stepRows, conditionRows } from '../app/js/core/facts.js';
import { endStateLabel } from '../app/js/core/words.js';
import { findPrevious, compareTimer, sideBySide } from '../app/js/core/diff.js';
import { logEvent, setLogSink } from '../app/js/core/log.js';
import { suggestNotes, lastNotePerceptions } from '../app/js/core/suggest.js';
import { buildExport, parseImport, mergeById } from '../app/js/core/export.js';
import { createLocalAdapter, copyAll, localOnlyCounts } from '../app/js/core/store.js';
import { findPreset } from '../app/js/data/presets.js';
import { readCompass, adviseNext, estimateUmPerClick, umPerClickFor, lastSurveyed } from '../app/js/core/compass.js';
import { planPoints, brewPlanPoints, brewActualPoints, planBars } from '../app/js/core/chart.js';
import { recipeTags } from '../app/js/core/recipe.js';
import { toImportFormat, readRecipeText, validateRecipeImport, recipePrompt, blankRecipe } from '../app/js/core/recipeImport.js';
import { ADVICE_FORMAT, ADVICE_EXAMPLE, adviceFormatText, adviceResultPrompt, readAdviceText, validateAdvice, advicePatch, lastAdvised } from '../app/js/core/adviceImport.js';

const KURASU = findPreset('kurasu-japanese-iced');

test('분쇄 표기: 110(-3) → 영점 반영값 107, 영점 0이면 괄호 없음', () => {
  assert.equal(formatGrind(110, -3), '110(-3)');
  assert.equal(grindActual(110, -3), 107);
  assert.equal(formatGrind(110, 0), '110');
  assert.equal(formatGrind(110, 2), '110(+2)');
});

test('시간 표기는 화면에서만 m:ss', () => {
  assert.equal(formatSec(130), '2:10');
  assert.equal(formatSec(5), '0:05');
  assert.equal(formatDelta(12), '+12초');
  assert.equal(formatDelta(-3), '−3초');
});

test('레시피: 기준 원두량이면 원문 값 그대로', () => {
  const p = buildPlan(KURASU, 16);
  assert.equal(p.hotWaterG, 150);
  assert.equal(p.iceG, 70);
  assert.deepEqual(p.steps.map((s) => s.targetCumG), [40, 100, 150]);
  assert.deepEqual(p.steps.map((s) => s.startSec), [0, 40, 70]);
  assert.equal(p.endSec, 130);
  assert.equal(p.isRefDose, true);
  assert.equal(scaleAdvice(KURASU, 16), null);
});

test('레시피: 원두량을 바꾸면 물·얼음·목표는 비율로, 시각은 그대로', () => {
  const p = buildPlan(KURASU, 20);
  assert.equal(p.hotWaterG, 188); // 20 × 9.375 = 187.5
  assert.equal(p.iceG, 88); // 20 × 4.375 = 87.5
  assert.deepEqual(p.steps.map((s) => s.targetCumG), [50, 125, 188]);
  assert.deepEqual(p.steps.map((s) => s.startSec), [0, 40, 70]);
  assert.equal(scaleAdvice(KURASU, 20).direction, 'up');
  assert.equal(scaleAdvice(KURASU, 12).direction, 'down');
});

function runBrew(plan, pressesSec, t0 = 1_000_000) {
  let s = startBrew(t0);
  for (const sec of pressesSec) s = advance(s, plan, t0 + sec * 1000);
  return s;
}

test('타이머: 남은 시간은 원문 절대 시각 기준, 지나면 초과로 표시', () => {
  const plan = buildPlan(KURASU, 16);
  const t0 = 1_000_000;
  let s = startBrew(t0);
  let v = view(s, plan, t0 + 10_000);
  assert.equal(v.step.label, '뜸 들이기');
  assert.equal(Math.round(v.remainingSec), 30);
  assert.equal(v.buttonLabel, '다음 푸어');
  s = advance(s, plan, t0 + 35_000);
  v = view(s, plan, t0 + 75_000); // 1차 푸어 목표는 70초 → 5초 초과
  assert.equal(v.step.label, '1차 푸어');
  assert.equal(Math.round(v.overSec), 5);
  s = advance(s, plan, t0 + 72_000);
  v = view(s, plan, t0 + 80_000);
  assert.equal(v.isLast, true);
  assert.equal(v.buttonLabel, '종료');
  s = advance(s, plan, t0 + 125_000);
  assert.equal(s.status, 'ended');
  const sum = summarize(s, plan);
  assert.deepEqual(sum.steps.map((x) => x.actualEndSec), [35, 72, 125]);
  assert.equal(sum.totalSec, 125);
  assert.equal(sum.plannedTotalSec, 130);
});

test('타이머: 끝난 뒤 버튼을 또 눌러도 바뀌지 않고, 취소는 따로 표시', () => {
  const plan = buildPlan(KURASU, 16);
  const ended = runBrew(plan, [40, 70, 130]);
  assert.equal(advance(ended, plan, 2_000_000), ended);
  const c = cancel(startBrew(0), 12_000);
  assert.equal(c.status, 'cancelled');
  assert.equal(c.endedSec, 12);
});

function makeBrew({ id, at, presses, dripper = 'Hario V60 02', bean = { id: 'b1', name: '원두A' }, recipe = KURASU }) {
  const plan = buildPlan(recipe, 16);
  const state = runBrew(plan, presses, at);
  const b = createBrew({
    recipe,
    plan,
    prep: { bean, style: 'iced', tempC: 91, grind: { dial: 110, zeroOffset: -3 }, dripper, filter: '표백 종이 필터', rinsed: true, pourMethod: '나선형' },
    timer: summarize(state, plan),
    now: at,
  });
  b.id = id;
  return b;
}

test('비교: 같은 레시피의 직전 기록(드리퍼 무관), ±2초 이내는 무시', () => {
  const a = makeBrew({ id: 'a', at: 1_000, presses: [35, 70, 113], dripper: 'Hario V60 MUGEN 02' });
  const b = makeBrew({ id: 'b', at: 9_000_000, presses: [36, 70, 125] });
  const prev = findPrevious([a, b], b);
  assert.equal(prev.partner.id, 'a');
  assert.equal(prev.partnerKind, 'sameRecipe');
  const c = compareTimer(b, prev.sameRecipe);
  assert.equal(Math.round(c.total.deltaSec), 12);
  assert.equal(c.total.significant, true);
  assert.equal(c.steps[0].significant, false); // 1초 차이
});

test('비교: 같은 레시피가 없으면 같은 원두의 직전 기록(레시피가 달라도)', () => {
  const other = { ...KURASU, id: 'other-recipe', name: '다른 레시피' };
  const o = makeBrew({ id: 'o', at: 5_000_000, presses: [35, 70, 113], recipe: other });
  const b = makeBrew({ id: 'b', at: 9_000_000, presses: [36, 70, 125] });
  const prev = findPrevious([o, b], b);
  assert.equal(prev.partner.id, 'o');
  assert.equal(prev.partnerKind, 'sameBean');
  assert.equal(prev.sameBeanOtherRecipe.id, 'o');
});

test('1:1 비교표: 모든 항목을 나란히, 다른 줄만 표시(시간은 ±2초 초과만)', () => {
  const a = makeBrew({ id: 'a', at: 1_000, presses: [35, 70, 113], dripper: 'Hario V60 MUGEN 02' });
  const b = makeBrew({ id: 'b', at: 9_000_000, presses: [36, 70, 125] });
  b.conditions.tempC = 90;
  a.survey = emptySurvey();
  b.survey = emptySurvey();
  a.survey.items.acidity.level = 2;
  b.survey.items.acidity.level = 4;
  const rows = sideBySide(b, a);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(byLabel['드리퍼'].differs, true);
  assert.equal(byLabel['드리퍼'].b, 'Hario V60 MUGEN 02');
  assert.equal(byLabel['온도'].differs, true);
  assert.equal(byLabel['분쇄 크기'].a, '110(-3) (영점 반영값 107)');
  assert.equal(byLabel['분쇄 크기'].differs, false);
  assert.equal(byLabel['1단계 끝'].differs, false); // 1초 차이는 무시
  assert.equal(byLabel['총 시간'].differs, true);
  assert.equal(byLabel['총 시간'].note, '+12초');
  assert.equal(byLabel['산미'].a, '강함'); // 이번(4)
  assert.equal(byLabel['산미'].b, '약함'); // 비교 대상(2)
  assert.equal(byLabel['산미'].differs, true);
  assert.equal(byLabel['바디감'].differs, false); // 둘 다 선택 안 함
});

test('타이머: 붓는 구간(pourSec) 안에서만 강조 대상', () => {
  const plan = buildPlan(KURASU, 16);
  assert.equal(plan.pourSec, 10);
  const s = startBrew(0);
  assert.equal(view(s, plan, 3_000).pouring, true);
  assert.equal(Math.round(view(s, plan, 3_000).pourLeftSec), 7);
  assert.equal(view(s, plan, 12_000).pouring, false);
  const s2 = advance(s, plan, 41_000); // 1차 푸어는 누른 시각(41초)부터 10초
  assert.equal(view(s2, plan, 50_000).pouring, true);
  assert.equal(view(s2, plan, 52_000).pouring, false);
});

test('붓기 안내: 고르게 부을 때의 지금쯤 저울 값·초당 g, 붓는 시간이 지나면 기다리는 구간', () => {
  const plan = buildPlan(KURASU, 16);
  const s = startBrew(0);
  const v0 = view(s, plan, 5_000); // 뜸: 0→40g 을 10초에
  assert.equal(v0.pourRateGps, 4);
  assert.equal(v0.expectedNowG, 20);
  assert.equal(v0.pourDone, false);
  const s2 = advance(s, plan, 40_000); // 1차 푸어: 40→100g
  const v1 = view(s2, plan, 45_000);
  assert.equal(v1.pourFromG, 40);
  assert.equal(v1.pourRateGps, 6);
  assert.equal(v1.expectedNowG, 70);
  // 누른 시각(0.1초 반올림) 직후에도 남은 붓기 시간은 10초를 넘지 않는다
  const s3 = advance(s, plan, 40_060); // 40.1초로 저장된다
  assert.equal(Math.ceil(view(s3, plan, 40_070).pourLeftSec), 10);
  assert.equal(view(s3, plan, 40_070).expectedNowG, 40);
  const v2 = view(s2, plan, 55_000);
  assert.equal(v2.pouring, false);
  assert.equal(v2.pourDone, true);
  assert.equal(v2.expectedNowG, null);
});

test('누른 시각 판정: ±2초 이내는 제때, 넘으면 몇 초 일찍·늦게', () => {
  assert.deepEqual(timingVerdict(2.4), { kind: 'ok', text: '제때' });
  assert.deepEqual(timingVerdict(-2), { kind: 'ok', text: '제때' });
  assert.deepEqual(timingVerdict(3.2), { kind: 'late', text: '3초 늦게' });
  assert.deepEqual(timingVerdict(-5), { kind: 'early', text: '5초 일찍' });
  const b = makeBrew({ id: 'a', at: 1_000, presses: [43, 69, 125] });
  assert.deepEqual(stepRows(b).map((r) => r.verdict.text), ['3초 늦게', '제때', '5초 일찍']);
});

test('되돌리기: 넘긴 단계는 한 단계 앞으로, 종료는 다시 진행 중으로', () => {
  const plan = buildPlan(KURASU, 16);
  const s0 = startBrew(0);
  const s1 = advance(s0, plan, 40_000);
  const s2 = advance(s1, plan, 40_400); // 연타
  assert.equal(s2.stepIndex, 2);
  assert.deepEqual(undoAdvance(s2), s1);
  assert.deepEqual(undoAdvance(undoAdvance(s2)), s0);
  assert.deepEqual(undoAdvance(s0), s0); // 첫 단계는 그대로
  const ended = advance(s2, plan, 130_000);
  assert.equal(ended.status, 'ended');
  const back = undoAdvance(ended);
  assert.equal(back.status, 'running');
  assert.equal(back.endedSec, null);
  assert.equal(back.stepIndex, 2);
});

test('방치 확인: 다음 푸어 시간의 절반이 지나도록 안 누르면 묻고(마지막 단계는 레시피 절반), 5분 더 답이 없으면 끝낸다', () => {
  const plan = buildPlan(KURASU, 16);
  assert.equal(checkAfterSec(plan), 65); // 2:10 의 절반
  // 쿠라스: 뜸(0~40) 다음 1차 푸어 30초 → 40 + 15 = 55초, 1차(40~70) 다음 2차 푸어 60초 → 70 + 30 = 100초, 마지막(2차)은 130 + 65
  assert.deepEqual([askGapSec(plan, 0), askGapSec(plan, 1), askGapSec(plan, 2)], [15, 30, 65]);
  const s = startBrew(0);
  assert.equal(presence(s, plan, 54_000).phase, 'ok');
  const p = presence(s, plan, 55_000);
  assert.equal(p.phase, 'ask');
  assert.equal(p.askAtSec, 55);
  assert.equal(p.stopAtSec, 355);
  assert.equal(presence(s, plan, 355_000).phase, 'abandon');
  // 1차 푸어로 넘긴 뒤: 100초에 묻는다
  const s1 = advance(s, plan, 41_000);
  assert.equal(presence(s1, plan, 99_000).phase, 'ok');
  assert.equal(presence(s1, plan, 100_000).phase, 'ask');
  // 마지막 단계: 130 + 65 = 195초
  const s2 = advance(s1, plan, 71_000);
  assert.equal(presence(s2, plan, 194_000).phase, 'ok');
  assert.equal(presence(s2, plan, 195_000).phase, 'ask');
  // [계속 추출] 뒤에는 그때부터 65초 뒤에 다시 묻는다
  const a = acknowledge(s, 60_000);
  assert.equal(presence(a, plan, 124_000).phase, 'ok');
  assert.equal(presence(a, plan, 125_000).phase, 'ask');
  // 종료 뒤(되돌리기 대기)·취소 뒤에는 묻지 않는다
  assert.equal(presence(advance(advance(s2, plan, 131_000), plan, 132_000), plan, 999_000).phase, 'ok');
  assert.equal(presence(cancel(s, 1_000), plan, 999_000).phase, 'ok');
});

test('누른 시각 고치기: 방치 확인에서 레시피 시각으로 넘기기, 저장한 기록은 시작 보정·단계별 고친 시각을 겹쳐 본다', () => {
  const plan = buildPlan(KURASU, 16);
  // 55초에 묻는 창에서 「레시피 시각(40초)에 넘긴 걸로」
  const s = advance(startBrew(0), plan, 55_000, { atSec: 40 });
  assert.deepEqual(s.stepStartsSec, [0, 40]);
  // 지금보다 뒤·단계 시작보다 앞은 그 안으로 맞춘다
  assert.deepEqual(advance(startBrew(0), plan, 30_000, { atSec: 40 }).stepStartsSec, [0, 30]);
  // 저장한 기록: 1차 푸어 끝을 90 → 70 으로 고치면 2차 시작도 70, 판정도 고친 값으로
  const b = makeBrew({ id: 'x', at: 1_000, presses: [40, 90, 130] });
  b.result.stepFix = { 1: 70 };
  const t = timerOf(b);
  assert.equal(t.steps[1].actualEndSec, 70);
  assert.equal(t.steps[1].corrected, true);
  assert.equal(t.steps[2].actualStartSec, 70);
  assert.equal(stepRows(b)[1].verdict.kind, 'ok');
  assert.equal(b.timer.steps[1].actualEndSec, 90); // 타이머 기록 자체는 그대로
  // 시작 보정: [시작]을 5초 늦게 눌렀으면 모든 누른 시각 +5, 그 위에 단계별로 고친 값을 덮는다
  const c = makeBrew({ id: 'y', at: 1_000, presses: [36, 66, 125] });
  c.result.startShiftSec = 5;
  assert.deepEqual(timerOf(c).steps.map((s) => s.actualEndSec), [41, 71, 130]);
  assert.equal(timerOf(c).totalSec, 130);
  c.result.stepFix = { 2: 128 };
  assert.deepEqual(timerOf(c).steps.map((s) => s.actualEndSec), [41, 71, 128]);
  assert.equal(timerOf(c).steps[2].actualStartSec, 71);
});

test('단계 설명: 직접 쓴 문장 → 레시피 원문 → 일반 설명 → 비움', () => {
  assert.equal(stepHint(KURASU, 0).source, 'general'); // 뜸: 일반 설명
  assert.equal(stepHint(KURASU, 1).source, 'none'); // 1차 푸어: 원문 근거 없음 → 비움
  assert.equal(stepHint(KURASU, 1).text, '');
  assert.equal(stepHint(KURASU, 2).source, 'recipe'); // 2차 푸어: 원문
  const mine = { 1: '  내가 쓴 설명  ', 2: '   ' };
  assert.deepEqual(stepHint(KURASU, 1, mine), { text: '내가 쓴 설명', source: 'custom' });
  assert.equal(stepHint(KURASU, 2, mine).source, 'recipe'); // 빈칸은 직접 쓴 것으로 보지 않는다
  const plan = buildPlan(KURASU, 16, mine);
  assert.equal(plan.steps[1].hint, '내가 쓴 설명');
  assert.equal(plan.steps[1].hintSource, 'custom');
});

test('종료 상태: key 로 저장하고 단어로 보인다, 9/24 전 한국어 값도 읽는다', () => {
  assert.equal(endStateLabel('drained'), '모두 내려감');
  assert.equal(endStateLabel('cutoff'), '강제 종료');
  assert.equal(endStateLabel('다 빠짐'), '모두 내려감');
  assert.equal(endStateLabel('물이 남은 채 종료'), '강제 종료');
  assert.equal(endStateLabel(null), null);
  const b = makeBrew({ id: 'a', at: 1_000, presses: [40, 70, 130] });
  b.result.endState = 'cutoff';
  b.result.dilutionG = 20;
  const rows = Object.fromEntries(conditionRows(b).map(([k, v, sub]) => [k, { v, sub }]));
  assert.equal(rows['종료 상태'].v, '강제 종료');
  assert.deepEqual(rows['가수'], { v: '20g', sub: '추출 후 추가한 물' });
  assert.match(toMarkdown(buildSharePackage({ brews: [b], current: b })), /\| 가수 \(추출 후 추가한 물\) \| 20g \|/);
});

test('참고 µm(보조값): 적었을 때만 분쇄 크기 옆에 붙고, 1:1 비교에서도 차이로 잡힌다', () => {
  const a = makeBrew({ id: 'a', at: 1_000, presses: [40, 70, 130] });
  const b = makeBrew({ id: 'b', at: 9_000_000, presses: [40, 70, 130] });
  assert.equal(Object.fromEntries(conditionRows(a))['분쇄 크기'], '110(-3) · 영점 반영값 107');
  b.conditions.grind.um = 650;
  assert.equal(Object.fromEntries(conditionRows(b))['분쇄 크기'], '110(-3) · 영점 반영값 107 · 참고 약 650µm');
  const row = sideBySide(b, a).find((r) => r.label === '분쇄 크기');
  assert.equal(row.a, '110(-3) (영점 반영값 107 · 참고 약 650µm)');
  assert.equal(row.differs, true);
});

test('이 기기 → 계정 옮기기: 로그는 두 번 옮겨도 한 벌, 계정에 없는 기록만 «이 기기에만 있음»으로 센다', async () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const localMem = mem();
  const local = createLocalAdapter(localMem, 'nb');
  const cloud = createLocalAdapter(mem(), 'cl'); // 계정 대신
  local.put('brews', { id: 'a' });
  local.put('brews', { id: 'b' });
  local.appendLog({ t: 1, ev: 'app.start' });
  local.appendLog({ t: 2, ev: 'brew.start' });
  cloud.put('brews', { id: 'a' });
  cloud.appendLog({ t: 1, ev: 'app.start' });
  // 전역 store 를 쓰지 않는다(로그 수신처가 붙어 다른 테스트에 번진다) — 계정에 있는지는 함수로 넘긴다
  const inCloud = async () => { const all = await cloud.loadAll(); return (c, id) => (all[c] ?? []).some((d) => d.id === id); };
  assert.deepEqual(localOnlyCounts(localMem, 'nb', await inCloud()), { total: 1, brews: 1, beans: 0, grinders: 0, servers: 0, recipes: 0 });
  const n1 = await copyAll(local, cloud);
  assert.equal(n1.logs, 1);
  assert.equal(n1.logsSkipped, 1);
  const n2 = await copyAll(local, cloud);
  assert.equal(n2.logs, 0);
  assert.equal((await cloud.loadLogs()).length, 2);
  assert.equal(localOnlyCounts(localMem, 'nb', await inCloud()).total, 0);
});

test('설문 순서: 쓴맛 → 바디감 → 단맛 → 산미(사용자 결정)', () => {
  assert.deepEqual(SURVEY_ITEMS.map((i) => i.label), ['쓴맛', '바디감', '단맛', '산미']);
});

test('커피 원액 무게 = 서버 총 무게 − 서버 자체 무게, 1:1 비교표에도 나온다', () => {
  assert.equal(netServerWeight({ serverWeightG: 610, server: { tareG: 395 } }), 215);
  assert.equal(netServerWeight({ serverWeightG: 610, server: null }), null);
  assert.equal(netServerWeight({ serverWeightG: null, server: { tareG: 395 } }), null);
  const a = makeBrew({ id: 'a', at: 1_000, presses: [40, 70, 130] });
  const b = makeBrew({ id: 'b', at: 9_000_000, presses: [40, 70, 130] });
  b.result.serverWeightG = 610;
  b.result.server = { id: 's1', name: '서버', tareG: 395 };
  const row = sideBySide(b, a).find((r) => r.label === '커피 원액 무게');
  assert.equal(row.sub, '서버 제외 · 아이스는 얼음 포함');
  assert.equal(row.a, '215g');
  assert.equal(row.b, '—');
  assert.equal(row.differs, true);
});

test('AI 공유 묶음: 이번 + 직전(무관) + 레시피·원두가 같은 최근, 같은 기록은 한 번만', () => {
  const other = { ...KURASU, id: 'other-recipe', name: '다른 레시피' };
  const old = makeBrew({ id: 'old', at: 1_000_000, presses: [40, 70, 130] }); // 같은 레시피·원두
  const mid = makeBrew({ id: 'mid', at: 2_000_000, presses: [40, 70, 130], recipe: other }); // 직전(레시피 다름)
  const cur = makeBrew({ id: 'cur', at: 3_000_000, presses: [40, 70, 130] });
  const later = makeBrew({ id: 'later', at: 4_000_000, presses: [40, 70, 130] }); // 이번보다 나중 — 넣지 않는다
  const all = [later, cur, mid, old];
  const rel = findShareRelations(all, cur);
  assert.equal(rel.previous.id, 'mid');
  assert.equal(rel.sameRecipeAndBean.id, 'old');
  const pkg = buildSharePackage({ brews: all, beans: [{ id: 'b1', name: '원두A', country: '에티오피아', schemaVersion: 1, updatedAt: 'x' }], current: cur, now: 5_000_000 });
  assert.deepEqual(pkg.brews.map((b) => [b.id, b.roles]), [['cur', ['current']], ['mid', ['previous']], ['old', ['sameRecipeAndBean']]]);
  assert.equal(pkg.brews[0].recipe.snapshot, undefined); // 레시피 원본은 recipes 에 한 번만
  assert.deepEqual(Object.keys(pkg.recipes).sort(), ['kurasu-japanese-iced', 'other-recipe']);
  assert.deepEqual(pkg.beans.b1, { id: 'b1', name: '원두A', country: '에티오피아' });
  assert.equal(JSON.parse(toJSON(pkg)).relations.previous, 'mid');
  assert.match(shareFileName(pkg, 'md'), /^nextbrew-\d{8}-\d{4}\.md$/);

  // 직전 기록이 곧 같은 레시피·원두 기록이면 한 번만 넣고 역할을 둘 다 적는다
  const pkg2 = buildSharePackage({ brews: [cur, old], current: cur });
  assert.deepEqual(pkg2.brews.map((b) => [b.id, b.roles]), [['cur', ['current']], ['old', ['previous', 'sameRecipeAndBean']]]);
  const md = toMarkdown(pkg2);
  assert.match(md, /직전 추출과 같은 기록/);
  assert.match(md, /## 직전 추출\(레시피·원두 무관\) · 레시피와 원두가 같은 가장 최근 추출/);
  assert.match(md, /\| 1차 푸어 \| 100g \| 1:10 \| 1:10 \| 제때 \|/);

  // 「이 기록만」: 비교 기록이 있어도 넣지 않고, MD 에는 «없음»이 아니라 «담지 않음»으로 적는다
  const single = buildSharePackage({ brews: all, current: cur, scope: 'single' });
  assert.equal(single.scope, 'single');
  assert.deepEqual(single.brews.map((b) => b.id), ['cur']);
  assert.deepEqual(single.relations, { current: 'cur', previous: null, sameRecipeAndBean: null });
  assert.match(toMarkdown(single), /\| 직전 추출\(레시피·원두 무관\) \| 담지 않음\(이 기록만 공유\) \|/);

  // 비교할 기록이 없으면 이번 것만
  const pkg3 = buildSharePackage({ brews: [cur], current: cur });
  assert.equal(pkg3.brews.length, 1);
  assert.match(toMarkdown(pkg3), /\| 직전 추출\(레시피·원두 무관\) \| 없음 \|/);
});

test('로그: 사건이 생길 때만, 시간순으로, 연결 전 사건도 잃지 않음', () => {
  const got = [];
  logEvent('app.start', { mode: 'local' }, { now: 10 });
  setLogSink((e) => got.push(e));
  logEvent('brew.cancel', { stepIndex: 1 }, { now: 20 });
  assert.deepEqual(got.map((e) => [e.t, e.ev]), [[10, 'app.start'], [20, 'brew.cancel']]);
  assert.equal(got[1].at, new Date(20).toISOString());
});

test('노트 추천: 같은 나라·같은 가공 우선, 자기 자신은 제외', () => {
  const beans = [
    { id: '1', country: '에티오피아', process: '워시드', notes: ['꽃', '레몬'] },
    { id: '2', country: '에티오피아', process: '내추럴', notes: ['베리', '꽃'] },
    { id: '3', country: '브라질', process: '내추럴', notes: ['견과'] },
  ];
  assert.deepEqual(suggestNotes(beans, { country: '에티오피아', process: '워시드' }), ['꽃', '레몬', '베리']);
  assert.deepEqual(suggestNotes(beans, { country: '에티오피아', excludeId: '1' }), ['꽃', '베리']); // 동점은 가나다순
  assert.deepEqual(suggestNotes(beans, { country: '' }), []);
});

test('내보내기·가져오기: 왕복, 이미 있는 id는 건너뜀', () => {
  const data = buildExport({ brews: [{ id: 'a' }], beans: [], grinders: [], logs: [{ t: 1 }], now: 0 });
  const back = parseImport(JSON.stringify(data));
  assert.equal(back.brews.length, 1);
  assert.equal(back.logs.length, 1);
  assert.deepEqual(mergeById([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]).skipped, 1);
  assert.throws(() => parseImport('{"app":"Other"}'));
});

test('기기 저장 어댑터: 쓰고 다시 읽기, 로그는 순서대로 쌓임', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const ad = createLocalAdapter(storage, 't');
  ad.put('beans', { id: 'x', name: '원두' });
  ad.appendLog({ t: 1, ev: 'app.start' });
  ad.appendLog({ t: 2, ev: 'brew.start' });
  const all = await ad.loadAll();
  assert.equal(all.beans[0].name, '원두');
  assert.deepEqual((await ad.loadLogs()).map((e) => e.t), [1, 2]);
});

// ── 9/24 언스페셜티 후보(1~7·9) ─────────────────────────────
function survey(patch = {}) {
  const s = emptySurvey();
  for (const [k, v] of Object.entries(patch.items ?? {})) s.items[k] = { ...s.items[k], ...v };
  return { ...s, offFlavors: patch.offFlavors ?? [], liking: patch.liking ?? null };
}

test('컴퍼스: 시큼함 → 과소추출(가늘게), 쓴맛 매우 강함 → 과다추출 2단계(굵게)', () => {
  const sour = readCompass(survey({ items: { acidity: { level: 3, kinds: ['시큼한'] } } }));
  assert.equal(sour.extraction, -1);
  assert.equal(adviseNext(sour).grindUm, -30);
  assert.match(adviseNext(sour).lines[0], /^분쇄 조금 가늘게 \(약 30µm/);
  const bitter = readCompass(survey({ items: { bitterness: { level: 5 } } }));
  assert.equal(bitter.extraction, 2);
  assert.equal(adviseNext(bitter).grindUm, 60);
});

test('컴퍼스: 강배전은 쓴맛을 한 단계 낮춰 본다, 단맛이 약하면 같은 방향으로 한 단계 더', () => {
  assert.equal(readCompass(survey({ items: { bitterness: { level: 4 } } }), { roast: '강배전' }).extraction, 0);
  assert.equal(readCompass(survey({ items: { bitterness: { level: 5 } } }), { roast: '강배전' }).extraction, 1);
  assert.equal(readCompass(survey({ items: { bitterness: { level: 4 }, sweetness: { level: 2 } } })).extraction, 2);
  // 단맛만 약하면 방향을 못 정한다
  assert.equal(readCompass(survey({ items: { sweetness: { level: 1 } } })).extraction, 0);
});

test('컴퍼스: 시큼함과 쓴맛이 함께면 분쇄를 움직이지 않고, 금속성 같은 잡미는 계산에서 뺀다', () => {
  const c = readCompass(survey({ items: { acidity: { level: 3, kinds: ['시큼한'] }, bitterness: { level: 4 } }, offFlavors: ['Metallic (금속성)'] }));
  assert.equal(c.mixed, true);
  assert.equal(c.extraction, 0);
  assert.deepEqual(c.taints, ['Metallic']);
  const a = adviseNext(c);
  assert.equal(a.keep, false);
  assert.ok(a.lines.some((l) => l.includes('엇갈립니다')));
  assert.ok(a.lines.some((l) => l.includes('Metallic')));
});

test('컴퍼스: 바디감 약함 → 연함 → 원두 0.5g 늘리기(물 그대로), 만족하고 단서가 없으면 유지', () => {
  const weak = adviseNext(readCompass(survey({ items: { body: { level: 2 } } })));
  assert.equal(weak.doseDeltaG, 0.5);
  assert.match(weak.lines[0], /0.5g 늘리기 \(물은 그대로\)/);
  const liked = adviseNext(readCompass(survey({ items: { body: { level: 3 } }, liking: 5 })));
  assert.equal(liked.keep, true);
  assert.match(liked.lines[0], /유지/);
  assert.equal(adviseNext(readCompass(survey())), null, '아무것도 답하지 않으면 제안 없음');
});

test('클릭당 µm: 설정값이 먼저, 없으면 기록의 (실제 클릭, 참고 µm) 기울기로 추정 → 클릭 수 환산', () => {
  const g = (dial, zeroOffset, um) => ({ conditions: { grind: { grinderId: 'k6', dial, zeroOffset, um } } });
  // 실제 클릭 60 → 600µm, 70 → 700µm (영점이 달라도 실제 클릭으로 맞춘다)
  const brews = [g(63, -3, 600), g(70, 0, 700), g(50, 0, null)];
  assert.deepEqual(estimateUmPerClick(brews, 'k6'), { value: 10, n: 2 });
  assert.equal(estimateUmPerClick([g(60, 0, 600)], 'k6'), null, '눈금이 하나뿐이면 추정 안 함');
  assert.equal(umPerClickFor({ id: 'k6', umPerClick: 12 }, brews).source, 'manual');
  assert.equal(umPerClickFor({ id: 'k6' }, brews).value, 10);
  const a = adviseNext(readCompass(survey({ items: { acidity: { level: 4, kinds: ['시큼한'] } } })), { umPerClick: 10 });
  assert.equal(a.grindUm, -60);
  assert.equal(a.clicks, -6);
  assert.match(a.lines[0], /^분쇄 6클릭 가늘게 \(그라인더 표시값 −6/);
});

test('지난번 제안: 같은 레시피(원두를 골랐으면 같은 원두)의 가장 최근 설문 기록', () => {
  const b = (id, t, beanId, surveyed) => ({ id, recipe: { id: 'r' }, bean: beanId ? { id: beanId } : null, timer: { startedAt: t }, survey: surveyed ? {} : null });
  const brews = [b('a', 1, 'x', true), b('b', 3, 'y', true), b('c', 5, 'x', false)];
  assert.equal(lastSurveyed(brews, { recipeId: 'r' }).id, 'b');
  assert.equal(lastSurveyed(brews, { recipeId: 'r', beanId: 'x' }).id, 'a');
  assert.equal(lastSurveyed(brews, { recipeId: 'other' }), null);
});

test('그래프 점: 계획선은 pourSec 동안 붓고 다음 단계까지 평평, 실제선은 누른 시각 기준', () => {
  const plan = buildPlan(KURASU, 16);
  const pts = planPoints(plan);
  assert.deepEqual(pts.slice(0, 4), [[0, 0], [10, 40], [40, 40], [50, 100]]);
  assert.deepEqual(pts[pts.length - 1], [130, 150]);
  const bars = planBars(plan);
  assert.deepEqual(bars[0], { label: '뜸 들이기', start: 0, pourEnd: 10, end: 40, targetCumG: 40 });
  // 기록: 1차를 45초에, 2차를 72초에 누르고 128초에 종료
  const state = { startedAt: 0, stepIndex: 2, stepStartsSec: [0, 45, 72], endedSec: 128, status: 'ended' };
  const brew = { recipe: { snapshot: KURASU }, timer: summarize(state, plan) };
  assert.deepEqual(brewPlanPoints(brew), pts);
  const act = brewActualPoints(brew);
  assert.deepEqual(act.slice(0, 5), [[0, 0], [10, 40], [45, 40], [55, 100], [72, 100]]);
  assert.deepEqual(act[act.length - 1], [128, 150]);
});

test('뜨거운 물 직접 정하기: 단계 목표는 같은 % 로 나누고, 비우면 레시피 비율', () => {
  const p = buildPlan(KURASU, 16.5, null, { waterG: 150 });
  assert.equal(p.hotWaterG, 150);
  assert.equal(p.waterFixed, true);
  assert.deepEqual(p.steps.map((s) => s.targetCumG), [40, 100, 150]);
  assert.equal(buildPlan(KURASU, 16).waterFixed, false);
});

test('레시피 태그: 핫/아이스 · 드리퍼 · 붓는 횟수', () => {
  assert.deepEqual(recipeTags(KURASU), ['아이스', 'Hario V60', '3번 붓기']);
});

// ── 레시피 가져오기(9/24) ──────────────────────────────────
const sameRecipeNumbers = (a, b) => {
  assert.equal(a.refDoseG, b.refDoseG);
  assert.ok(Math.abs(a.waterRatio - b.waterRatio) < 1e-9);
  assert.ok(Math.abs((a.iceRatio ?? 0) - (b.iceRatio ?? 0)) < 1e-9);
  assert.equal(a.tempC, b.tempC);
  assert.equal(a.endSec, b.endSec);
  assert.equal(a.pourSec ?? null, b.pourSec ?? null);
  assert.deepEqual(a.steps.map((s) => [s.kind, s.label, s.startSec, Math.round(s.cumPct * 1e6)]), b.steps.map((s) => [s.kind, s.label, s.startSec, Math.round(s.cumPct * 1e6)]));
};

test('레시피 가져오기: 프롬프트 속 쿠라스 예시를 꺼내 검사하면 오류 0, 변환하면 프리셋과 숫자가 같다', () => {
  const prompt = recipePrompt(toImportFormat(KURASU));
  const example = prompt.slice(prompt.indexOf('## 예시'));
  const { raw, fixes } = readRecipeText(example);
  assert.deepEqual(fixes, []);
  const { recipe, errors } = validateRecipeImport(raw);
  assert.deepEqual(errors, []);
  sameRecipeNumbers(recipe, KURASU);
  // 원문에 없는 뜸 설명(일반 설명)은 예시에서 비우고, 원문에 있는 2차 푸어 설명만 남긴다
  assert.equal(raw.steps[0].hint, null);
  assert.match(raw.steps[2].hint, /농도/);
  assert.equal(recipe.kind, 'user');
});

test('레시피 가져오기: AI 답의 앞뒤 글·코드 블록·특수문자(둥근 따옴표, 마지막 쉼표, 주석)를 고쳐 읽는다', () => {
  const ok = readRecipeText('네, 바꿨습니다!\n```json\n{ "a": 1 }\n```\n확인해 보세요.');
  assert.deepEqual(ok, { raw: { a: 1 }, fixes: [] });
  const messy = readRecipeText('{\n  “name”: “테스트”,\n  // 메모\n  "steps": [1, 2,],\n}');
  assert.deepEqual(messy.raw, { name: '테스트', steps: [1, 2] });
  assert.equal(messy.fixes.length, 3);
  assert.throws(() => readRecipeText('레시피를 못 찾았어요'), /JSON 을 찾지 못했습니다/);
  assert.throws(() => readRecipeText('{ "a": 1 "b": 2 }'), /JSON 문법 오류/);
});

test('레시피 가져오기: 단위 붙은 숫자·"1:10" 시간은 고쳐 읽고 경고, 틀린 단계는 어디가 왜 틀렸는지 알린다', () => {
  const base = toImportFormat(KURASU);
  const coerced = validateRecipeImport({ ...base, doseG: '16g', tempC: '91℃', endSec: '2:10', steps: base.steps.map((s, i) => (i === 1 ? { ...s, startSec: '0:40' } : s)) });
  assert.deepEqual(coerced.errors, []);
  assert.equal(coerced.recipe.refDoseG, 16);
  assert.equal(coerced.recipe.tempC, 91);
  assert.equal(coerced.recipe.endSec, 130);
  assert.equal(coerced.recipe.steps[1].startSec, 40);
  assert.equal(coerced.warnings.filter((w) => /읽었습니다/.test(w)).length, 4);
  // 폼이 다시 채울 값: 고쳐 읽은 숫자, 못 고친 값은 원래 글 그대로
  assert.equal(coerced.clean.doseG, 16);
  assert.equal(coerced.clean.steps[1].startSec, 40);
  const unfixable = validateRecipeImport({ ...base, doseG: '열여섯' });
  assert.equal(unfixable.clean.doseG, '열여섯');
  assert.ok(unfixable.errors.some((e) => /숫자가 아닙니다/.test(e)));
  // 매번 붓는 양(40·60·50)으로 적은 경우 → «누적»으로 적으라고 알린다
  const perPour = validateRecipeImport({ ...base, steps: [{ ...base.steps[0], untilG: 40 }, { ...base.steps[1], untilG: 60 }, { ...base.steps[2], untilG: 50 }] });
  assert.equal(perPour.recipe, null);
  assert.ok(perPour.errors.some((e) => /누적/.test(e)));
  assert.ok(perPour.errors.some((e) => /hotWaterG\(150\)/.test(e)));
  // 첫 단계가 0초가 아님, 시각이 거꾸로
  const badTimes = validateRecipeImport({ ...base, steps: [{ ...base.steps[0], startSec: 5 }, { ...base.steps[1], startSec: 70 }, { ...base.steps[2], startSec: 60 }] });
  assert.ok(badTimes.errors.some((e) => /첫 단계는 0초/.test(e)));
  assert.ok(badTimes.errors.some((e) => /앞 단계\(70\)보다 커야/.test(e)));
  assert.ok(validateRecipeImport({ ...base, format: 'other' }).errors.some((e) => /format/.test(e)));
});

test('레시피 수정: 저장한 레시피를 폼 형식으로 되돌렸다가 다시 검사하면 같은 레시피(출처·AI 메모 유지), 빈 틀은 이름만 넣으면 통과', () => {
  const imported = validateRecipeImport({ ...toImportFormat(KURASU), source: { title: 'T', url: 'https://example.com/r', author: 'A' }, uncertain: ['온도는 원문에 범위로 나옴'] }).recipe;
  const again = validateRecipeImport(toImportFormat(imported)).recipe;
  sameRecipeNumbers(again, imported);
  assert.equal(again.source.author, 'A');
  assert.deepEqual(again.uncertain, ['온도는 원문에 범위로 나옴']);
  assert.equal(again.steps[2].hint, imported.steps[2].hint);
  assert.ok(validateRecipeImport(blankRecipe()).errors.some((e) => /name/.test(e)));
  assert.deepEqual(validateRecipeImport({ ...blankRecipe(), name: '내 핫 레시피' }).errors, []);
});

// ── 9/25 사용자 요청 ──────────────────────────────────────────
test('가수와 비율: 얼음이 추천보다 적으면 모자란 만큼 가수 추천, 가수 전·후 무게가 있으면 가수는 둘의 차이', () => {
  const b = makeBrew({ id: 'x', at: 1_000, presses: [40, 70, 130] });
  // 쿠라스 16g: 뜨거운 물 150g + 추천 얼음 70g → 계획 물 220g, 가수 더 넣을 것 없음
  let dv = dilutionView(b);
  assert.equal(b.conditions.iceTargetG, 70);
  assert.equal(dv.targetWaterG, 220);
  assert.equal(dv.moreG, 0);
  // 얼음을 62g만 넣었다 → 8g 모자람 = 가수 8g 추천
  b.conditions.iceG = 62;
  dv = dilutionView(b);
  assert.equal(dv.needG, 8);
  assert.equal(dv.moreG, 8);
  // 가수 전 610g · 후 616g(둘 다 서버 포함) → 가수 6g, 2g 더
  b.result.serverWeightG = 610;
  b.result.serverAfterG = 616;
  assert.equal(measuredDilution(b.result), 6);
  assert.equal(measuredDilution({ serverWeightG: 610, serverAfterG: null }), null);
  dv = dilutionView(b);
  assert.equal(dv.measured, true);
  assert.equal(dv.dilutionG, 6);
  assert.equal(dv.moreG, 2);
  assert.equal(dv.waterNowG, 150 + 62 + 6);
  // 비교표·조건 목록에도 가수 포함 비율과 가수 후 총무게가 나온다
  assert.equal(conditionRows(b).find(([k]) => k === '가수')[1], '6g (가수 전·후 무게로 계산)');
  assert.equal(sideBySide(b, makeBrew({ id: 'y', at: 9_000, presses: [40, 70, 130] })).find((r) => r.label === '가수 후 총무게').a, '616g');
  // 9/25 전 기록(iceTargetG 없음)은 넣은 얼음을 추천으로 본다
  const old = makeBrew({ id: 'o', at: 1_000, presses: [40, 70, 130] });
  delete old.conditions.iceTargetG;
  old.conditions.iceG = 60;
  assert.equal(dilutionView(old).needG, 0);
  // 핫으로 내렸으면 얼음은 셈에 넣지 않는다
  const hot = makeBrew({ id: 'h', at: 1_000, presses: [40, 70, 130] });
  Object.assign(hot.conditions, { style: 'hot', iceG: 0, iceTargetG: 0 });
  assert.equal(dilutionView(hot).targetWaterG, 150);
});

test('원두: 이름 자동 조합, 구매 무게 단위, 기록으로 남은 원두 추정·10g 이하 알림, 소비기한에서 제조일 역산', () => {
  const bean = createBean({ id: 'b1', country: '에티오피아', region: '예가체프', producer: ' 첼바 ', variety: '', process: '워시드' });
  assert.equal(beanAutoName(bean), '에티오피아 예가체프 첼바 워시드');
  assert.equal(beanNameIsAuto(bean), true);
  assert.equal(beanNameIsAuto({ name: '9/25 전에 등록한 원두' }), false);
  assert.equal(purchasedGrams({ purchased: { amount: 12, unit: 'oz' } }), 340.2);
  assert.equal(purchasedGrams({ purchased: { amount: 0.2, unit: 'kg' } }), 200);
  assert.equal(purchasedGrams({ purchased: null }), null);
  bean.purchased = { amount: 50, unit: 'g' };
  const brews = [makeBrew({ id: 'a', at: 1_000, presses: [40, 70, 130] }), makeBrew({ id: 'b', at: 2_000, presses: [40, 70, 130] })];
  brews.push(makeBrew({ id: 'c', at: 3_000, presses: [40, 70, 130], bean: { id: 'other', name: '다른 원두' } }));
  let st = beanStock(bean, brews);
  assert.deepEqual([st.usedG, st.brews, st.remainingG, st.low], [32, 2, 18, false]);
  brews.push(makeBrew({ id: 'd', at: 4_000, presses: [40, 70, 130] }));
  st = beanStock(bean, brews);
  assert.deepEqual([st.remainingG, st.low], [2, true]);
  assert.equal(beanStock({ ...bean, status: 'consumed' }, brews).low, false); // 소모로 바꾸면 알림이 멈춘다
  assert.equal(beanStock({ ...bean, purchased: null }, brews).low, false); // 구매 무게가 없으면 세지 않는다
  assert.equal(roastedFromBestBefore('2027-09-25'), '2026-09-25');
  assert.equal(roastedFromBestBefore('2027-03-31', 1), '2027-02-28');
  assert.equal(roastedFromBestBefore('', 12), null);
  assert.equal(daysSince('2026-09-20', new Date(2026, 8, 25, 13).getTime()), 5);
  // 9/24 전 3단계 값이 5단계 목록에 그대로 있다
  for (const r of ['약배전', '중배전', '강배전']) assert.ok(ROASTS.includes(r));
});

test('타이머 대기: [시작] 전에는 0초에 멈춰 있고 방치 확인도 묻지 않는다', () => {
  const plan = buildPlan(KURASU, 16);
  const r = readyBrew();
  assert.equal(elapsedSec(r, 5_000_000), 0);
  assert.equal(view(r, plan, 5_000_000).remainingSec, 40);
  assert.equal(presence(r, plan, 9_000_000_000).phase, 'ok');
});

test('공유창 파일 이름: 크롬이 막는 .md·.json 은 .txt 로 보낸다', () => {
  assert.equal(shareSheetName('nextbrew-20260925-0712.md'), 'nextbrew-20260925-0712(md).txt');
  assert.equal(shareSheetName('nextbrew-20260925-0712.json'), 'nextbrew-20260925-0712(json).txt');
});

test('AI 공유 기본 프롬프트: 파일의 역할 이름을 그대로 쓰고, 기본 질문은 다음 추출 조정 제안', () => {
  const p = defaultSharePrompt();
  // 「고른 기록」(9/26 여러 건 공유)은 따로 쓰는 프롬프트라 한 건 공유의 세 역할만 본다
  for (const role of ['current', 'previous', 'sameRecipeAndBean'].map((k) => SHARE_ROLES[k])) assert.ok(p.includes(`「${role}」`), `역할 이름이 프롬프트와 다름: ${role}`);
  assert.match(defaultSharePrompt('selected'), /고른 기록 여러 건/);
  assert.match(p, /다음 추출에서 무엇을 바꾸면 좋을지/);
  assert.match(p, /지어내지 말고/);
});

test('AI 제안 가져오기: 프롬프트 속 예시를 꺼내 검사하면 오류 0, 기록 ID 가 다르거나 값이 없으면 막는다', () => {
  const b = makeBrew({ id: 'brew_예시', at: 1_000, presses: [40, 70, 130] });
  // 프롬프트(처음·결과 받기 둘 다)에 형식이 들어 있고, 그 안의 예시가 그대로 통과한다
  assert.ok(defaultSharePrompt().includes(ADVICE_FORMAT) && adviceResultPrompt().includes(ADVICE_FORMAT));
  assert.match(defaultSharePrompt(), /한 번만/);
  const { raw } = readAdviceText(adviceFormatText());
  const ok = validateAdvice(raw, { brew: b });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.advice.next, ADVICE_EXAMPLE.next);
  assert.equal(ok.advice.changes.length, 2);
  // 다른 기록의 답·값이 하나도 없음·범위 밖은 오류
  assert.match(validateAdvice({ ...raw, brewId: 'brew_다른것' }, { brew: b }).errors.join(), /다른 기록의 답/);
  assert.match(validateAdvice({ ...raw, next: { grindDial: null, doseG: null, hotWaterG: null, tempC: null } }, { brew: b }).errors.join(), /값이 하나도 없습니다/);
  assert.match(validateAdvice({ ...raw, next: { ...raw.next, tempC: 120 } }, { brew: b }).errors.join(), /50~100/);
});

test('AI 제안 가져오기: 코드 블록·단위 붙은 숫자·끝 쉼표를 고쳐 읽고, 모르는 항목·크게 바뀐 값은 경고한다', () => {
  const b = makeBrew({ id: 'brew_x', at: 1_000, presses: [40, 70, 130] });
  const pasted = '결론입니다.\n```json\n{ "format": "nextbrew-advice", "version": 1, "brewId": "brew_x", "next": { "grindDial": "104", "doseG": "16.5g", "hotWaterG": 150, "tempC": "92℃", }, "changes": [{ "item": "분쇄", "text": "가늘게" }], }\n```\n끝';
  const { raw, fixes } = readAdviceText(pasted);
  assert.ok(fixes.some((f) => /쉼표/.test(f)));
  const r = validateAdvice(raw, { brew: b });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.advice.next, { grindDial: 104, doseG: 16.5, hotWaterG: 150, tempC: 92 });
  assert.equal(r.advice.changes[0].item, 'other');
  assert.ok(r.warnings.some((w) => /「그 밖」/.test(w)));
  assert.equal(r.warnings.filter((w) => /숫자 .*로 읽었습니다/.test(w)).length, 3);
  // 이번 110 → 104 는 20 이내라 경고 없음, 70 이면 크게 바뀐다고 경고
  assert.ok(!r.warnings.some((w) => /크게 바뀝니다/.test(w)));
  assert.ok(validateAdvice({ ...raw, next: { ...raw.next, grindDial: 70 } }, { brew: b }).warnings.some((w) => /크게 바뀝니다/.test(w)));
});

test('AI 제안대로 맞추기: 같은 그라인더면 다이얼까지, 다르면 다이얼은 두고, 원두만 바꾸면 물은 그 기록 그대로', () => {
  const from = makeBrew({ id: 'f', at: 1_000, presses: [40, 70, 130] });
  from.conditions.grind.grinderId = 'g1';
  from.aiAdvice = { next: { grindDial: 108, doseG: 16.5, hotWaterG: null, tempC: 92 } };
  const same = advicePatch(from.aiAdvice, from, { grinderId: 'g1' });
  assert.equal(same.patch.dial, 108);
  assert.equal(same.patch.doseG, 16.5);
  assert.equal(Math.round(same.patch.ratio * 16.5), 150); // 물 150g 그대로
  assert.equal(same.patch.tempC, 92);
  const other = advicePatch(from.aiAdvice, from, { grinderId: 'g2' });
  assert.equal(other.patch.dial, undefined);
  assert.equal(other.dialSkipped, true);
  // 준비 화면에 띄울 제안: 같은 레시피의 가장 최근 AI 제안(원두를 골랐으면 같은 원두)
  const newer = makeBrew({ id: 'n', at: 9_000, presses: [40, 70, 130] });
  assert.equal(lastAdvised([newer, from], { recipeId: KURASU.id }).id, 'f');
  assert.equal(lastAdvised([newer, from], { recipeId: KURASU.id, beanId: 'other' }), null);
});

test('AI 공유 파일(MD)에 기록 ID 가 들어 있다 — AI 가 결과의 brewId 로 옮겨 적는다', () => {
  const a = makeBrew({ id: 'brew_aaa', at: 1_000, presses: [40, 70, 130] });
  const md = toMarkdown(buildSharePackage({ brews: [a], current: a }));
  assert.match(md, /기록 ID: brew_aaa/);
});

test('끌어 넘기기: 네 모서리(시스템 뒤로 가기·홈·알림창 제스처 자리)에서 시작하면 받지 않고, 25%·빠른 튕김이면 넘긴다', async () => {
  const { startsInEdge, swipeDecision, EDGE } = await import('../app/js/ui/tabSwipe.js');
  const W = 390;
  const H = 844;
  const none = { top: 0, bottom: 0, left: 0, right: 0 };
  // 좌우 40px(안드로이드 뒤로 가기 30dp × 최대 1.33) · 아래 48px(홈 제스처) · 위 24px(알림창)
  assert.deepEqual(EDGE, { side: 40, top: 24, bottom: 48 });
  assert.equal(startsInEdge(39, 400, W, H, none), true);
  assert.equal(startsInEdge(W - 39, 400, W, H, none), true);
  assert.equal(startsInEdge(200, 23, W, H, none), true);
  assert.equal(startsInEdge(200, H - 47, W, H, none), true);
  assert.equal(startsInEdge(200, 400, W, H, none), false);
  // 아이폰 홈 인디케이터 안전 영역(34px)만큼 아래 제외 구역이 넓어진다
  assert.equal(startsInEdge(200, H - 70, W, H, { ...none, bottom: 34 }), true);
  // 놓을 때: 폭 25% 넘게 끌었거나(0.4px/ms 넘게 같은 방향으로) 튕겼으면 넘긴다. 그쪽에 탭이 없으면 돌아간다
  assert.equal(swipeDecision(-100, 0, W, true), 'go');
  assert.equal(swipeDecision(-60, -0.1, W, true), 'back');
  assert.equal(swipeDecision(-60, -0.6, W, true), 'go');
  assert.equal(swipeDecision(-60, 0.6, W, true), 'back'); // 끈 방향과 튕긴 방향이 다르면 돌아간다
  assert.equal(swipeDecision(200, 0, W, false), 'back'); // 첫 탭에서 오른쪽으로 끌기
});

test('추출 뒤 무게 칸 연동: 가수 전 + 가수 = 가수 후, 가수 후 + 추가 얼음 = 얼음 넣은 뒤 — 마지막에 고친 쪽이 원본', () => {
  const r0 = { serverWeightG: 610, dilutionG: 0, serverAfterG: null };
  // 가수를 적으면 가수 후 총무게가 따라온다
  const r1 = { ...r0, dilutionG: 20, ...linkWeights(r0, 'dilutionG', 20) };
  assert.equal(r1.serverAfterG, 630);
  // 가수 후 총무게를 고치면 가수가 따라온다
  const r2 = { ...r1, serverAfterG: 626, ...linkWeights(r1, 'serverAfterG', 626) };
  assert.equal(r2.dilutionG, 16);
  // 가수 전 총무게를 나중에 고쳐도 마지막에 고친 쪽(가수 후)을 지키고 가수를 다시 계산
  const r3 = { ...r2, serverWeightG: 605, ...linkWeights(r2, 'serverWeightG', 605) };
  assert.equal(r3.serverAfterG, 626);
  assert.equal(r3.dilutionG, 21);
  // 추가 얼음(켰을 때): 얼음 넣은 뒤 = 가수 후 + 추가 얼음, 반대로도
  const r4 = { ...r3, iceAddedG: 40, ...linkWeights(r3, 'iceAddedG', 40, { iceOn: true }) };
  assert.equal(r4.serverAfterIceG, 666);
  const r5 = { ...r4, serverAfterIceG: 660, ...linkWeights(r4, 'serverAfterIceG', 660, { iceOn: true }) };
  assert.equal(r5.iceAddedG, 34);
  // 비율에는 추가 얼음도 들어가고, 계획 비율까지 더 넣을 양에서 뺀다
  const b = makeBrew({ id: 'x', at: 1_000, presses: [40, 70, 130] });
  Object.assign(b.result, { dilutionG: 10, iceAddedOn: true, iceAddedG: 30, lastWeighed: 'dilution' });
  const dv = dilutionView(b);
  assert.equal(dv.waterNowG, 150 + 70 + 10 + 30);
  assert.equal(dv.moreG, -40);
  // 추가 얼음을 안 적은 아이스 기록은 «안 넣음»이 아니라 «모름»으로 나간다
  const c = makeBrew({ id: 'y', at: 1_000, presses: [40, 70, 130] });
  assert.match(conditionRows(c).find(([k]) => k === '추가 얼음')[1], /기록 안 함/);
});

test('원두 노트 인식 미리 채우기: 같은 원두의 이전 기록에서 노트마다 가장 최근에 답한 값', () => {
  const mk = (id, at, perception, beanId = 'b1') => {
    const x = makeBrew({ id, at, presses: [40, 70, 130], bean: { id: beanId, name: '원두' } });
    x.survey = { ...emptySurvey(), notePerception: perception };
    return x;
  };
  const cur = makeBrew({ id: 'now', at: 9_000_000, presses: [40, 70, 130], bean: { id: 'b1', name: '원두' } });
  const brews = [
    mk('old', 1_000, { 자두: '느껴짐', 초콜릿: '약하게' }),
    mk('mid', 2_000_000, { 자두: '안 느껴짐' }), // 자두는 이게 더 최근
    mk('other', 3_000_000, { 초콜릿: '느껴짐' }, 'b2'), // 다른 원두는 보지 않는다
    mk('later', 10_000_000, { 초콜릿: '느껴짐' }), // 이 기록보다 뒤에 내린 것은 보지 않는다
  ];
  const got = lastNotePerceptions(brews, cur, ['자두', '초콜릿', '꽃']);
  assert.equal(got['자두'].value, '안 느껴짐');
  assert.equal(got['초콜릿'].value, '약하게');
  assert.equal(got['꽃'], undefined);
});


// ── 9/26 추가: 분쇄 측정(CSV·사진 글자) · AI 공유 편향 줄이기 · 여러 건 공유 · 배전도 숫자 · 로스터리 맛 지표 ──
import { readMeasureCsv, clickToDial, parseHeaderText, parseStatsCells, decimalsIn, measureWarnings, snapMachine, vote, ocrDigits } from '../app/js/core/grindMeasure.js';
import { aiSurvey, aiBrew, buildSelectionPackage } from '../app/js/core/share.js';
import { surveyRows, measureLine } from '../app/js/core/facts.js';
import { roastWordOf, roastLabel, profileLine } from '../app/js/core/schema.js';

test('분쇄 측정 사진 글: 제목을 빼고 「그라인더 - Click」과 메모를 나눈다(줄바꿈·헷갈리는 글자 포함)', () => {
  // 9/26 실제 캡처를 인식기가 읽은 글 그대로
  const t = '분쇄도 분석 결과          KINGrinder K6 -\n120\n실제위치 (영점) : 125 (-5) 인도네시아 만델링 81 콩볶는사람들';
  assert.deepEqual(parseHeaderText(t), { machine: 'KINGrinder K6', click: 120, memo: '실제위치 (영점) : 125 (-5) 인도네시아 만델링 81 콩볶는사람들' });
  assert.equal(parseHeaderText('Comandante C40 - l2O').click, 120); // l→1, O→0
  assert.deepEqual(parseHeaderText('메모만 있음'), { machine: null, click: null, memo: '메모만 있음' });
});

test('분쇄 측정 사진 값: 두 칸(평균 ± 정확도 / 표준편차)에서 소수 둘째 자리 수만 받는다', () => {
  assert.deepEqual(parseStatsCells({ left: '평균 크기\n1347.69 + 141.31 um', right: '표순편차\n352.18um' }), { meanUm: 1347.69, accuracyUm: 141.31, sdUm: 352.18 });
  assert.deepEqual(decimalsIn('1347,69 ± 141. 31'), [1347.69, 141.31]); // 쉼표·띄어 읽힌 점
  assert.deepEqual(decimalsIn('134769'), []); // 점이 빠진 수는 받지 않는다(확인 창에서 비워 둔다)
  assert.equal(ocrDigits('O.5l'), '0.51');
  assert.deepEqual(vote(1.5, 1.5), { value: 1.5, sure: true, alt: null });
  assert.deepEqual(vote(1.5, 11.5), { value: 1.5, sure: false, alt: 11.5 });
  assert.deepEqual(vote(null, 2), { value: 2, sure: false, alt: null });
});

test('분쇄 측정 검사·그라인더 이름 붙이기', () => {
  assert.deepEqual(measureWarnings({ meanUm: 1347.69, accuracyUm: 141.31, sdUm: 352.18, click: 120 }), {});
  const w = measureWarnings({ meanUm: 13476.9, accuracyUm: 141.31, sdUm: 20000, click: null });
  assert.ok(w.meanUm && w.sdUm && w.click);
  assert.deepEqual(snapMachine('KlNGrinder K6', ['KINGrinder K6', '코만단테']), { name: 'KINGrinder K6', snapped: true });
  assert.deepEqual(snapMachine('Timemore C3', ['KINGrinder K6']), { name: 'Timemore C3', snapped: false });
});

test('분쇄 측정 CSV: 칸 이름으로 읽고, 평균은 파일 이름에서, Click 뜻에 따라 그라인더 표시값', () => {
  const csv = 'Index,Particles,Labels,Volume Density,Count Density,Accuracy,Machine,Click,Memo,Uid\n0,1,1000,0,50,141.31,KINGrinder K6,120,"메모, 쉼표",u1\n1,2,1500,60,30,,,,,\n2,3,2000,40,20,,,,,\n';
  const { measurement: m, errors } = readMeasureCsv(csv, 'particle-M1347.69-3525.csv');
  assert.deepEqual(errors, []);
  assert.equal(m.meanUm, 1347.69);
  assert.equal(m.meanSource, 'fileName');
  assert.equal(m.memo, '메모, 쉼표');
  assert.equal(m.click, 120);
  assert.equal(m.bins.length, 3);
  assert.equal(clickToDial(120, 'zero', -5), 125); // 영점 반영값 120 · 영점 −5 → 그라인더 표시값 125(9/26 사용자 메모와 같음)
  assert.equal(clickToDial(120, 'dial', -5), 120);
  assert.ok(readMeasureCsv('a,b\n1,2', 'x.csv').errors.length);
  assert.match(measureLine({ ...m, clickMeaning: 'zero' }), /^KINGrinder K6 Click 120\(영점 반영값\) · 평균 1347\.69µm ±141\.31/);
});

test('AI 공유: 「선택 안 함」 항목은 MD·JSON 에서 빠지고, 설정 내보내기에는 그대로 남는다(9/26 사용자 결정)', () => {
  const s = emptySurvey();
  s.items.bitterness.level = 4;
  s.items.body.kinds = ['부드러운']; // 강도는 안 골랐지만 종류는 골랐다 → 종류만 남긴다
  const rows = Object.fromEntries(surveyRows(s));
  assert.equal(rows['쓴맛'], '강함');
  assert.equal(rows['바디감'], '부드러운');
  assert.ok(!('단맛' in rows) && !('산미' in rows) && !('만족도' in rows));
  assert.ok(!JSON.stringify(surveyRows(s)).includes('선택 안 함'));
  const a = aiSurvey(s);
  assert.deepEqual(Object.keys(a.items), ['bitterness', 'body']);
  assert.ok(!('level' in a.items.body) && !('liking' in a));
  // 설정 내보내기는 원래 기록 그대로(null 포함)
  const b = { ...makeBrew({ id: 'x1', at: 1_000, presses: [40, 70, 130] }), survey: s };
  const exp = buildExport({ brews: [b], beans: [], grinders: [] });
  assert.equal(exp.brews[0].survey.items.sweetness.level, null);
  assert.equal(exp.brews[0].survey.liking, null);
});

test('AI 공유: 분쇄 측정 사진(dataURL)은 공유 파일에 넣지 않는다', () => {
  const b = makeBrew({ id: 'p1', at: 1_000, presses: [40, 70, 130] });
  b.result.grindMeasurement = { meanUm: 1000, photo: { dataUrl: 'data:image/jpeg;base64,AAAA' } };
  const out = aiBrew(b);
  assert.equal(out.result.grindMeasurement.photo, undefined);
  assert.equal(out.result.grindMeasurement.meanUm, 1000);
  assert.ok(b.result.grindMeasurement.photo); // 원본 기록은 그대로
});

test('여러 건 골라 공유: 고른 것만 시간순, 가장 최근이 기준, 파일 이름에 건수', () => {
  const b1 = makeBrew({ id: 's1', at: 1_000, presses: [40, 70, 130] });
  const b2 = makeBrew({ id: 's2', at: 5_000, presses: [40, 70, 130] });
  const b3 = makeBrew({ id: 's3', at: 3_000, presses: [40, 70, 130] });
  const pkg = buildSelectionPackage({ brews: [b1, b2, b3], ids: ['s2', 's1'] });
  assert.equal(pkg.scope, 'selected');
  assert.deepEqual(pkg.relations.selected, ['s1', 's2']);
  assert.equal(pkg.relations.current, 's2');
  assert.deepEqual(pkg.brews.map((b) => b.roles), [['selected'], ['selected']]);
  assert.match(shareFileName(pkg, 'md'), /-2brews\.md$/);
  const md = toMarkdown(pkg);
  assert.match(md, /\| 2 \(가장 최근\) \|/);
  assert.ok(!md.includes('직전 추출(레시피·원두 무관)'));
});

test('배전도 숫자(0.5~10) → 5단계 단어, 옛 원두는 단어 그대로', () => {
  assert.deepEqual([0.5, 2, 2.5, 4, 4.5, 6, 6.5, 8, 8.5, 10].map(roastWordOf), ['약배전', '약배전', '중약배전', '중약배전', '중배전', '중배전', '중강배전', '중강배전', '강배전', '강배전']);
  assert.equal(roastLabel({ roastLevel: 5.5, roast: '중배전' }), '중배전 5.5/10');
  assert.equal(roastLabel({ roastLevel: null, roast: '강배전' }), '강배전');
  assert.equal(profileLine({ scale: 5, items: [{ label: '산미', value: 3.5 }, { label: '단맛', value: 4 }] }), '산미 3.5/5 · 단맛 4/5');
  assert.equal(profileLine(null), '');
});
