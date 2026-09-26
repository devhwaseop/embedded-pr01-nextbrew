// 그래프 그리기(SVG). 점 계산은 core/chart.js, 여기서는 그리기만 한다.
// - 계획 그래프: 누적 물량 선 + 단계 시간표(가로 막대) — 준비 화면 「이번 계획」
// - 기록 그래프: 계획선(점선)과 실제로 누른 시각에 맞춘 선(실선) — 결과·기록 상세
// - 비교 그래프: 두 기록의 실제선 — 기록 상세 「지난 추출과 비교」
// - 컴퍼스: 과소↔과다추출 × 연함↔진함 위에 이번 맛의 위치 — 기록 상세 「다음 추출 제안」
// 색은 흰 바탕에서 3:1 이상(WCAG 1.4.11)이고, 색만으로 구분하지 않게 선 모양(점선·실선·점)도 다르게 한다.

import { h, svg } from './dom.js';
import { n2, formatSec, timerOf } from '../core/schema.js';
import { planPoints, brewPlanPoints, brewActualPoints, planBars, ticks } from '../core/chart.js';

const W = 330;
const L = 58; // 왼쪽: 세로 눈금·단계 이름 자리
const R = 12;
const T = 10;
const PLOT_H = 130;
const AXIS_H = 20;
const ROW_H = 20;

const niceMax = (v, unit) => Math.max(unit, Math.ceil(v / unit) * unit);

function scales(xMax, yMax) {
  return {
    sx: (t) => L + (t / xMax) * (W - L - R),
    sy: (g) => T + (1 - g / yMax) * PLOT_H,
  };
}

function grid(xMax, yMax, { sx, sy }, bottom) {
  const out = [];
  for (const v of ticks(yMax, 50, 100, 300)) {
    out.push(svg('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: 'c-grid' }));
    out.push(svg('text', { x: L - 6, y: sy(v) + 3.5, class: 'c-tick', 'text-anchor': 'end' }, `${n2(v)}g`));
  }
  for (const v of ticks(xMax, 30, 60, 180)) {
    out.push(svg('line', { x1: sx(v), x2: sx(v), y1: T, y2: T + PLOT_H, class: 'c-grid' }));
    out.push(svg('text', { x: sx(v), y: bottom - 5, class: 'c-tick', 'text-anchor': 'middle' }, formatSec(v)));
  }
  return out;
}

const line = (points, { sx, sy }, cls) => svg('polyline', { points: points.map(([t, g]) => `${sx(t).toFixed(1)},${sy(g).toFixed(1)}`).join(' '), class: cls });

// 단계가 끝난 점(=그 단계 목표 g 에 닿고 다음을 누른 시각)에 표시
const dots = (points, s, cls) => points.slice(1).filter((p, i, a) => i === a.length - 1 || a[i + 1][1] !== p[1]).map(([t, g]) => svg('circle', { cx: s.sx(t), cy: s.sy(g), r: 3, class: cls }));

function legend(items) {
  return h('div', { class: 'legend' }, ...items.map(([cls, text]) => h('span', { class: `lg ${cls}` }, text)));
}

function figure(label, svgEl, ...rest) {
  svgEl.setAttribute('role', 'img');
  svgEl.setAttribute('aria-label', label);
  return h('figure', { class: 'chart' }, svgEl, ...rest);
}

// 준비 화면: 계획 누적 물량 + 단계 시간표
export function planFigure(plan) {
  const pts = planPoints(plan);
  const bars = planBars(plan);
  const xMax = niceMax(plan.endSec, 30);
  const yMax = niceMax(plan.hotWaterG, plan.hotWaterG > 300 ? 100 : 50);
  const s = scales(xMax, yMax);
  const barsTop = T + PLOT_H + 8;
  const height = barsTop + bars.length * ROW_H + AXIS_H;
  const el = svg(
    'svg',
    { viewBox: `0 0 ${W} ${height}`, class: 'c-svg' },
    ...grid(xMax, yMax, s, height),
    line(pts, s, 'c-plan-solid'),
    ...bars.flatMap((b, i) => {
      const y = barsTop + i * ROW_H;
      return [
        svg('text', { x: L - 6, y: y + 11, class: 'c-tick', 'text-anchor': 'end' }, b.label),
        svg('rect', { x: s.sx(b.start), y: y + 3, width: Math.max(1, s.sx(b.pourEnd) - s.sx(b.start)), height: 10, class: 'c-bar-pour' }),
        b.end > b.pourEnd ? svg('rect', { x: s.sx(b.pourEnd), y: y + 3, width: s.sx(b.end) - s.sx(b.pourEnd), height: 10, class: 'c-bar-wait' }) : null,
      ].filter(Boolean);
    }),
  );
  const summary = bars.map((b) => `${b.label} ${formatSec(b.start)}부터 ${n2(b.targetCumG)}g까지`).join(', ');
  return figure(`계획: ${summary}. 종료 목표 ${formatSec(plan.endSec)}`, el, legend([['lg-pour', '붓기'], ['lg-wait', '기다림']]));
}

// 기록 한 건: 계획선(점선) + 실제로 누른 시각에 맞춘 선(실선)
export function brewFigure(b) {
  const plan = brewPlanPoints(b);
  const act = brewActualPoints(b);
  const xMax = niceMax(Math.max(b.timer.plannedTotalSec, timerOf(b).totalSec ?? 0), 30);
  const topG = Math.max(...plan.map((p) => p[1]));
  const yMax = niceMax(topG, topG > 300 ? 100 : 50);
  const s = scales(xMax, yMax);
  const height = T + PLOT_H + AXIS_H;
  const el = svg('svg', { viewBox: `0 0 ${W} ${height}`, class: 'c-svg' }, ...grid(xMax, yMax, s, height), line(plan, s, 'c-plan'), line(act, s, 'c-actual'), ...dots(act, s, 'c-dot'));
  return figure(
    `누적 물량: 계획 ${formatSec(b.timer.plannedTotalSec)}, 실제 ${formatSec(timerOf(b).totalSec)}`,
    el,
    legend([['lg-plan', '레시피 계획'], ['lg-actual', '실제로 누른 시각']]),
    h('figcaption', { class: 'source' }, '실선은 계획한 붓기를 실제로 누른 시각에 맞춰 옮긴 선입니다. 저울 값을 잰 것은 아닙니다.'),
  );
}

// 두 기록의 실제선 겹쳐 보기
export function compareFigure(b, partner, partnerLabel) {
  const a = brewActualPoints(b);
  const p = brewActualPoints(partner);
  const xMax = niceMax(Math.max(timerOf(b).totalSec ?? 0, timerOf(partner).totalSec ?? 0, b.timer.plannedTotalSec), 30);
  const topG = Math.max(...a.map((x) => x[1]), ...p.map((x) => x[1]));
  const yMax = niceMax(topG, topG > 300 ? 100 : 50);
  const s = scales(xMax, yMax);
  const height = T + PLOT_H + AXIS_H;
  const el = svg('svg', { viewBox: `0 0 ${W} ${height}`, class: 'c-svg' }, ...grid(xMax, yMax, s, height), line(p, s, 'c-partner'), ...dots(p, s, 'c-dot-partner'), line(a, s, 'c-actual'), ...dots(a, s, 'c-dot'));
  return figure(
    `두 기록의 누른 시각: 이번 ${formatSec(timerOf(b).totalSec)}, ${partnerLabel} ${formatSec(timerOf(partner).totalSec)}`,
    el,
    legend([['lg-actual', '이번'], ['lg-partner', partnerLabel]]),
  );
}

// 커피 컴퍼스: 가로 과소추출(왼쪽)↔과다추출(오른쪽), 세로 진함(위)↔연함(아래), 가운데 = 균형
export function compassFigure(c) {
  const S = 180;
  const C = S / 2;
  const Rr = 62;
  const x = C + (c.extraction / 3) * Rr;
  const y = C - (c.strength / 2) * Rr;
  const moved = c.extraction !== 0 || c.strength !== 0;
  const el = svg(
    'svg',
    { viewBox: `0 0 ${S} ${S}`, class: 'c-svg compass' },
    svg('circle', { cx: C, cy: C, r: Rr, class: 'c-ring' }),
    svg('line', { x1: C - Rr, x2: C + Rr, y1: C, y2: C, class: 'c-grid' }),
    svg('line', { x1: C, x2: C, y1: C - Rr, y2: C + Rr, class: 'c-grid' }),
    // 가운데로 가는 점선을 먼저 그리고 가운데 원을 그 위에 덮는다(원 안에 점선 끝이 비치지 않게)
    moved ? svg('line', { x1: x, y1: y, x2: C, y2: C, class: 'c-to-center' }) : null,
    svg('circle', { cx: C, cy: C, r: 9, class: 'c-center' }),
    svg('text', { x: C, y: 12, class: 'c-tick', 'text-anchor': 'middle' }, '진함'),
    svg('text', { x: C, y: S - 4, class: 'c-tick', 'text-anchor': 'middle' }, '연함'),
    svg('text', { x: 2, y: C - 6, class: 'c-tick' }, '과소'),
    svg('text', { x: 2, y: C + 8, class: 'c-tick' }, '추출'),
    svg('text', { x: S - 2, y: C - 6, class: 'c-tick', 'text-anchor': 'end' }, '과다'),
    svg('text', { x: S - 2, y: C + 8, class: 'c-tick', 'text-anchor': 'end' }, '추출'),
    svg('circle', { cx: x, cy: y, r: 6, class: 'c-dot' }),
  );
  const where = [c.extraction < 0 ? '과소추출 쪽' : c.extraction > 0 ? '과다추출 쪽' : null, c.strength > 0 ? '진한 쪽' : c.strength < 0 ? '연한 쪽' : null].filter(Boolean).join(' · ') || '균형';
  return figure(`이번 맛의 위치: ${where}`, el, h('div', { class: 'hint center' }, `이번 맛: ${where}`));
}

// ── 분쇄 측정(사용자 요청 9/26 — 언스페셜티 CSV 의 원 데이터로 직접 그린다) ─────────────
// 원본 사진과 달리: 값이 있는 범위만 로그 가로축으로 넓게, 누적 부피(오른쪽 축)·평균 ± 정확도 띠·D50 을 함께, 숫자 요약을 붙인다.
const MW = 330;
const ML = 34;
const MR = 34;
const MT = 12;
const MH = 150;
const niceUm = [20, 50, 100, 200, 300, 500, 700, 1000, 1500, 2000, 3000];
export function measureFigure(m) {
  const bins = m.bins.map(([um, vol, count]) => ({ um, vol, count }));
  const has = bins.filter((b) => b.vol > 0 || b.count > 0);
  if (!has.length) return null;
  const lo = has[0].um / 1.25;
  const hi = has[has.length - 1].um * 1.25;
  const sx = (um) => ML + ((Math.log(um) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (MW - ML - MR);
  const yMax = Math.max(5, Math.ceil(Math.max(...bins.map((b) => Math.max(b.vol, b.count))) / 5) * 5);
  const sy = (v) => MT + (1 - v / yMax) * MH;
  const sc = (p) => MT + (1 - p / 100) * MH; // 누적(오른쪽 축)
  const bottom = MT + MH;
  const H = bottom + 26;
  const ratio = bins.length > 1 ? bins[1].um / bins[0].um : 1.1;
  const out = [];
  // 가로 눈금(µm)·세로 눈금(%)
  for (const v of niceUm.filter((u) => u >= lo && u <= hi)) {
    out.push(svg('line', { x1: sx(v), x2: sx(v), y1: MT, y2: bottom, class: 'c-grid' }));
    out.push(svg('text', { x: sx(v), y: H - 8, class: 'c-tick', 'text-anchor': 'middle' }, v >= 1000 ? `${v / 1000}k` : String(v)));
  }
  for (let v = 0; v <= yMax; v += yMax > 20 ? 10 : 5) {
    out.push(svg('line', { x1: ML, x2: MW - MR, y1: sy(v), y2: sy(v), class: 'c-grid' }));
    out.push(svg('text', { x: ML - 5, y: sy(v) + 3.5, class: 'c-tick', 'text-anchor': 'end' }, `${v}%`));
  }
  for (const p of [0, 50, 100]) out.push(svg('text', { x: MW - MR + 5, y: sc(p) + 3.5, class: 'c-tick' }, `${p}%`));
  // 평균 ± 정확도 띠, 평균선, D50
  if (m.meanUm) {
    const a = m.accuracyUm ?? 0;
    if (a) out.push(svg('rect', { x: sx(Math.max(lo, m.meanUm - a)), y: MT, width: Math.max(1, sx(Math.min(hi, m.meanUm + a)) - sx(Math.max(lo, m.meanUm - a))), height: MH, class: 'c-band' }));
    out.push(svg('line', { x1: sx(m.meanUm), x2: sx(m.meanUm), y1: MT, y2: bottom, class: 'c-mean' }));
  }
  if (m.d50) out.push(svg('line', { x1: sx(m.d50), x2: sx(m.d50), y1: MT, y2: bottom, class: 'c-d50' }));
  // 부피 비율 막대(칸 폭은 로그 간격의 70%)
  for (const b of bins.filter((x) => x.vol > 0)) {
    const x0 = sx(b.um);
    const x1 = sx(b.um * ratio);
    out.push(svg('rect', { x: x0 + (x1 - x0) * 0.15, y: sy(b.vol), width: Math.max(1, (x1 - x0) * 0.7), height: bottom - sy(b.vol), class: 'c-bar-vol' }));
  }
  // 개수 비율(점선 + 점)·누적 부피(실선)
  const inRange = bins.filter((b) => b.um >= lo && b.um <= hi);
  const mid = (b) => sx(b.um * Math.sqrt(ratio));
  out.push(svg('polyline', { points: inRange.map((b) => `${mid(b).toFixed(1)},${sy(b.count).toFixed(1)}`).join(' '), class: 'c-count' }));
  for (const b of inRange.filter((x) => x.count > 0)) out.push(svg('circle', { cx: mid(b), cy: sy(b.count), r: 2.2, class: 'c-dot-count' }));
  let cum = 0;
  const cumPts = inRange.map((b) => {
    cum += b.vol;
    return `${sx(b.um * ratio).toFixed(1)},${sc(Math.min(100, cum)).toFixed(1)}`;
  });
  out.push(svg('polyline', { points: [`${sx(lo).toFixed(1)},${sc(0)}`, ...cumPts].join(' '), class: 'c-cum' }));
  const el = svg('svg', { viewBox: `0 0 ${MW} ${H}`, class: 'c-svg' }, ...out);
  const fmt = (v) => (v == null ? '—' : `${Math.round(v)}µm`);
  const label = `분쇄 입자 크기 분포: 평균 ${n2(m.meanUm)}µm, D10 ${fmt(m.d10)}, D50 ${fmt(m.d50)}, D90 ${fmt(m.d90)}`;
  return figure(
    label,
    el,
    legend([['lg-vol', '부피 비율'], ['lg-count', '개수 비율'], ['lg-cum', '누적 부피(오른쪽)'], ['lg-mean', `평균${m.accuracyUm ? ' ± 정확도' : ''}`], ['lg-d50', 'D50']]),
    h('div', { class: 'hint' }, `가로축 µm(로그) · 입자 ${m.particles ?? '?'}개 · D10 ${fmt(m.d10)} · D50 ${fmt(m.d50)} · D90 ${fmt(m.d90)} · 가장 많은 부피 ${fmt(m.modeUm)}`),
  );
}
