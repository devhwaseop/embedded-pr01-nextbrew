// 직전 기록과의 비교.
// - 비교 상대: 같은 레시피의 직전 기록(드리퍼와 관계없이). 없으면 같은 원두의 직전 기록(레시피가 달라도).
// - 두 기록의 모든 항목을 양쪽에 나란히 두고 1:1로 비교한다. 레시피·드리퍼가 달라도 항목을 다 보여 준다(사용자 결정 9/23).
// - 시간은 ±2초 이내면 사람 손의 편차로 보고 «다름»으로 치지 않는다.
// - 직접 적은 글(메모)은 비교하지 않고 각 기록 화면에서 모두 보여 준다(보고서 결정).

import { grindActual, formatGrind, formatSec, formatDelta, netServerWeight, dilutionView, timerOf, TIME_TOLERANCE_SEC, SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS } from './schema.js';
import { WORDS, endStateLabel } from './words.js';

export const IGNORE_SEC = TIME_TOLERANCE_SEC;

export function beanKey(b) {
  return b.bean ? b.bean.id ?? `name:${b.bean.name}` : null;
}

export function findPrevious(brews, current) {
  const earlier = brews
    .filter((b) => b.id !== current.id && b.timer?.startedAt < current.timer.startedAt)
    .sort((a, b) => b.timer.startedAt - a.timer.startedAt);
  const sameRecipe = earlier.find((b) => b.recipe.id === current.recipe.id) ?? null;
  const key = beanKey(current);
  const sameBean = key ? earlier.find((b) => beanKey(b) === key) ?? null : null;
  const partner = sameRecipe ?? sameBean;
  return {
    partner,
    partnerKind: sameRecipe ? 'sameRecipe' : sameBean ? 'sameBean' : null,
    sameRecipe,
    // 같은 원두를 지난번에 다른 레시피로 내렸으면 알려 준다
    sameBeanOtherRecipe: sameBean && sameBean.recipe.id !== current.recipe.id ? sameBean : null,
  };
}

function significant(deltaSec) {
  return Math.abs(Math.round(deltaSec)) > IGNORE_SEC;
}

// 같은 레시피끼리의 시간 요약(결과 화면 윗줄). 단계는 이름이 같은 것끼리만 잰다.
export function compareTimer(cur, prev) {
  const steps = [];
  timerOf(cur).steps.forEach((s, i) => {
    const p = timerOf(prev).steps[i];
    if (!p || p.label !== s.label || s.actualEndSec == null || p.actualEndSec == null) return;
    const deltaSec = s.actualEndSec - p.actualEndSec;
    steps.push({ label: s.label, deltaSec, significant: significant(deltaSec) });
  });
  const totalDelta = timerOf(cur).totalSec - timerOf(prev).totalSec;
  return { total: { deltaSec: totalDelta, significant: significant(totalDelta) }, steps };
}

// ── 1:1 비교표 ───────────────────────────────────────────────
// 한 줄 = { section, label, sub?(옅은 부가 설명), a(이번), b(비교 대상), differs, note? }
const show = (v, unit = '') => (v == null || v === '' ? '—' : `${v}${unit}`);
const water = (b) => b.result?.actualWaterG ?? b.conditions.hotWaterG;
const pour = (b) => b.result?.actualPourMethod ?? b.conditions.pourMethod;
const ratioOf = (x) => `1:${Math.round(x * 10) / 10}`;
const ratio = (b) => ratioOf(water(b) / b.conditions.doseG);
const grind = (b) => {
  const g = b.conditions.grind;
  if (!g || g.dial == null) return '—';
  return `${g.grinderName ? `${g.grinderName} ` : ''}${formatGrind(g.dial, g.zeroOffset)} (영점 반영값 ${grindActual(g.dial, g.zeroOffset)}${g.um != null ? ` · 참고 약 ${g.um}µm${g.umSd != null ? ` ±${g.umSd}` : ''}` : ''})`;
};
const level = (words, v) => (v == null ? '선택 안 함' : words[v - 1]);

function row(section, label, a, b, differs = a !== b) {
  return { section, label, a, b, differs };
}
const wrow = (section, w, a, b) => ({ ...row(section, w.label, a, b), ...(w.sub ? { sub: w.sub } : {}) });

export function sideBySide(cur, prev) {
  const rows = [];
  const C = '조건';
  rows.push(row('기본', '레시피', cur.recipe.name, prev.recipe.name));
  rows.push(row('기본', '원두', show(cur.bean?.name), show(prev.bean?.name)));
  rows.push(row(C, '원두량', show(cur.conditions.doseG, 'g'), show(prev.conditions.doseG, 'g')));
  rows.push(row(C, '뜨거운 물', show(water(cur), 'g'), show(water(prev), 'g')));
  rows.push(row(C, '얼음', cur.conditions.style === 'hot' ? '핫' : show(cur.conditions.iceG, 'g'), prev.conditions.style === 'hot' ? '핫' : show(prev.conditions.iceG, 'g')));
  rows.push(wrow(C, WORDS.ratio, ratio(cur), ratio(prev)));
  rows.push(row(C, '온도', show(cur.conditions.tempC, '℃'), show(prev.conditions.tempC, '℃')));
  rows.push(row(C, WORDS.grind.label, grind(cur), grind(prev)));
  rows.push(row(C, '드리퍼', show(cur.conditions.dripper), show(prev.conditions.dripper)));
  rows.push(row(C, '필터', show(cur.conditions.filter), show(prev.conditions.filter)));
  const rinse = (b) => (b.conditions.rinsed == null ? '—' : b.conditions.rinsed ? '함' : '안 함');
  rows.push(wrow(C, WORDS.rinse, rinse(cur), rinse(prev)));
  rows.push(row(C, '드립 방법', show(pour(cur)), show(pour(prev))));
  rows.push(wrow(C, WORDS.dilution, show(cur.result?.dilutionG ?? 0, 'g'), show(prev.result?.dilutionG ?? 0, 'g')));
  // 얼음·가수까지 넣은 물 전체와 원두의 비율(9/25) — 마시는 커피의 농도를 가늠하는 값
  rows.push(row(C, `${WORDS.ratio.label}(가수 포함)`, ratioOf(dilutionView(cur).ratioNow), ratioOf(dilutionView(prev).ratioNow)));
  rows.push(row(C, '종료 상태', show(endStateLabel(cur.result?.endState)), show(endStateLabel(prev.result?.endState))));
  rows.push(row(C, WORDS.serverTotal.label, show(cur.result?.serverWeightG, 'g'), show(prev.result?.serverWeightG, 'g')));
  rows.push(row(C, WORDS.serverAfter.label, show(cur.result?.serverAfterG, 'g'), show(prev.result?.serverAfterG, 'g')));
  const iceAdded = (b) => (b.conditions.style === 'hot' ? '핫' : b.result?.iceAddedOn ? show(b.result.iceAddedG ?? 0, 'g') : '기록 안 함');
  rows.push(wrow(C, WORDS.iceAdded, iceAdded(cur), iceAdded(prev)));
  rows.push(wrow(C, WORDS.netWeight, show(netServerWeight(cur.result), 'g'), show(netServerWeight(prev.result), 'g')));

  // 타이머: 단계 순서대로 나란히(레시피가 다르면 이름도 함께 보인다)
  const n = Math.max(timerOf(cur).steps.length, timerOf(prev).steps.length);
  for (let i = 0; i < n; i++) {
    const s = timerOf(cur).steps[i];
    const p = timerOf(prev).steps[i];
    const a = s ? `${s.label} ${formatSec(s.actualEndSec)}` : '—';
    const b = p ? `${p.label} ${formatSec(p.actualEndSec)}` : '—';
    const differs = !s || !p || s.label !== p.label || significant(s.actualEndSec - p.actualEndSec);
    const r = row('타이머', `${i + 1}단계 끝`, a, b, differs);
    if (s && p && s.label === p.label && differs) r.note = formatDelta(s.actualEndSec - p.actualEndSec);
    rows.push(r);
  }
  const total = row('타이머', '총 시간', formatSec(timerOf(cur).totalSec), formatSec(timerOf(prev).totalSec), significant(timerOf(cur).totalSec - timerOf(prev).totalSec));
  if (total.differs) total.note = formatDelta(timerOf(cur).totalSec - timerOf(prev).totalSec);
  rows.push(total);

  // 맛: 한쪽이라도 설문 전이면 «다름»이 아니라 «비어 있음»이라 다르다고 세지 않는다
  const S = '맛';
  const sv = (b) => b.survey;
  const both = Boolean(sv(cur) && sv(prev));
  const srow = (label, f) => { const r = row(S, label, f(cur), f(prev)); r.differs = both && r.differs; return r; };
  for (const it of SURVEY_ITEMS) {
    rows.push(srow(it.label, (b) => (sv(b) ? [level(INTENSITY_WORDS, sv(b).items[it.key].level), ...(sv(b).items[it.key].kinds ?? [])].join(' · ') : '노트 전')));
  }
  rows.push(srow(WORDS.offFlavor.label, (b) => (sv(b) ? (sv(b).offFlavors.length ? sv(b).offFlavors.join(', ') : '없음') : '노트 전')));
  rows.push(srow('만족도', (b) => (sv(b) ? level(LIKING_WORDS, sv(b).liking) : '노트 전')));
  return rows;
}
