// 핵심 로직 테스트 — 실행: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatGrind, grindActual, formatSec, formatDelta, createBrew, emptySurvey, timingVerdict, netServerWeight, SURVEY_ITEMS } from '../app/js/core/schema.js';
import { buildPlan, scaleAdvice, stepHint } from '../app/js/core/recipe.js';
import { startBrew, view, advance, undoAdvance, cancel, summarize, presence, acknowledge, checkAfterSec } from '../app/js/core/timer.js';
import { buildSharePackage, findShareRelations, toMarkdown, toJSON, shareFileName } from '../app/js/core/share.js';
import { stepRows, conditionRows } from '../app/js/core/facts.js';
import { endStateLabel } from '../app/js/core/words.js';
import { findPrevious, compareTimer, sideBySide } from '../app/js/core/diff.js';
import { logEvent, setLogSink } from '../app/js/core/log.js';
import { suggestNotes } from '../app/js/core/suggest.js';
import { buildExport, parseImport, mergeById } from '../app/js/core/export.js';
import { createLocalAdapter, copyAll, localOnlyCounts } from '../app/js/core/store.js';
import { findPreset } from '../app/js/data/presets.js';

const KURASU = findPreset('kurasu-japanese-iced');

test('분쇄 표기: 110(-3) → 실제 107, 영점 0이면 괄호 없음', () => {
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
  assert.equal(byLabel['분쇄 크기'].a, '110(-3) (실제 107)');
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

test('방치 확인: 목표를 레시피 절반(최소 60초) 넘게 안 누르면 묻고, 5분 더 답이 없으면 끝낸다', () => {
  const plan = buildPlan(KURASU, 16);
  assert.equal(checkAfterSec(plan), 65); // 2:10 의 절반
  const s = startBrew(0); // 뜸 목표 = 40초
  assert.equal(presence(s, plan, 104_000).phase, 'ok'); // 64초 초과
  const p = presence(s, plan, 105_000);
  assert.equal(p.phase, 'ask');
  assert.equal(p.askAtSec, 105);
  assert.equal(p.stopAtSec, 405);
  assert.equal(presence(s, plan, 405_000).phase, 'abandon');
  // [계속 추출] 뒤에는 그때부터 65초 뒤에 다시 묻는다
  const a = acknowledge(s, 120_000);
  assert.equal(presence(a, plan, 184_000).phase, 'ok');
  assert.equal(presence(a, plan, 185_000).phase, 'ask');
  // 답한 기록은 단계를 넘겨도 따라간다: 1차 푸어(목표 70초)로 넘겨도 120+65초 전에는 묻지 않는다
  const n = advance(a, plan, 130_000);
  assert.equal(n.ackAtSec, 120);
  assert.equal(presence(n, plan, 150_000).phase, 'ok');
  // 종료 뒤(되돌리기 대기)·취소 뒤에는 묻지 않는다
  assert.equal(presence(advance(advance(n, plan, 131_000), plan, 132_000), plan, 999_000).phase, 'ok');
  assert.equal(presence(cancel(s, 1_000), plan, 999_000).phase, 'ok');
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
  assert.equal(Object.fromEntries(conditionRows(a))['분쇄 크기'], '110(-3) · 실제 107');
  b.conditions.grind.um = 650;
  assert.equal(Object.fromEntries(conditionRows(b))['분쇄 크기'], '110(-3) · 실제 107 · 참고 약 650µm');
  const row = sideBySide(b, a).find((r) => r.label === '분쇄 크기');
  assert.equal(row.a, '110(-3) (실제 107 · 참고 약 650µm)');
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
  assert.deepEqual(localOnlyCounts(localMem, 'nb', await inCloud()), { total: 1, brews: 1, beans: 0, grinders: 0, servers: 0 });
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
