// 기록 한 건을 사람이 읽는 [항목, 값, 부가 설명] 줄로 바꾼다(부가 설명은 없을 수 있다).
// 화면(조건 목록·단계표)과 AI 공유 파일(MD)이 같은 표기를 쓰게 한 곳에 둔다.

import { n2, formatGrind, grindActual, netServerWeight, timingVerdict, timerOf, bagStock, bagDays, BAG_STATES, dilutionView, SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS } from './schema.js';
import { formatRatio } from './recipe.js';
import { WORDS, endStateLabel } from './words.js';
import { measurementOf, PHOTO_SOURCE } from './grindMeasure.js';
import { brewBeanLabel } from './blend.js';

// 분쇄 측정 한 줄(화면·AI 공유가 같이 쓴다). 값이 없는 칸은 뺀다.
export function measureLine(m) {
  const meaning = { zero: '영점 반영값', dial: '그라인더 표시값' }[m.clickMeaning] ?? '';
  const d = [m.d10, m.d50, m.d90];
  return [
    `${m.machine ?? ''} Click ${m.click ?? '—'}${meaning ? `(${meaning})` : ''}`.trim(),
    m.meanUm != null ? `평균 ${n2(m.meanUm)}µm${m.accuracyUm ? ` ±${m.accuracyUm}` : ''}` : null,
    m.sdUm != null ? `표준편차 ${n2(m.sdUm)}µm${m.sdSource === 'estimate' ? '(추정)' : ''}` : null,
    d.some((v) => v != null) ? `D10/D50/D90 ${d.map((v) => (v == null ? '—' : Math.round(v))).join('/')}µm` : null,
    m.source === PHOTO_SOURCE ? '사진에서 읽음' : 'CSV',
  ].filter(Boolean).join(' · ');
}

export function conditionRows(b) {
  const c = b.conditions;
  const r = b.result ?? {};
  const g = c.grind;
  const net = netServerWeight(r);
  const dv = dilutionView(b);
  const grind = g
    ? `${g.grinderName ? `${g.grinderName} ` : ''}${formatGrind(g.dial, g.zeroOffset)}${g.dial != null ? ` · 영점 반영값 ${grindActual(g.dial, g.zeroOffset)}` : ''}${g.um != null ? ` · 참고 약 ${n2(g.um)}µm${g.umSd != null ? ` ±${g.umSd}` : ''}` : ''}`
    : '—';
  return [
    ['원두', brewBeanLabel(b) ?? '—'], // 블렌드 템플릿으로 섞었으면 원두별 무게를 붙인다(9/26)
    ...(beanStateLine(b) ? [['원두 상태', beanStateLine(b), '그 추출 때 봉투의 일수 · 갈 때 상태']] : []), // 9/26 원두 봉투
    ['원두량', `${n2(c.doseG)}g`],
    ['뜨거운 물', r.actualWaterG != null ? `${n2(r.actualWaterG)}g (계획 ${n2(c.hotWaterG)}g)` : `${n2(c.hotWaterG)}g`],
    ['얼음', c.style === 'hot' ? '핫' : `${n2(c.iceG)}g${c.iceTargetG != null && c.iceTargetG !== c.iceG ? ` (추천 ${n2(c.iceTargetG)}g)` : ''}`],
    [WORDS.ratio.label, formatRatio((r.actualWaterG ?? c.hotWaterG) / c.doseG)],
    [`${WORDS.ratio.label}(가수 포함)`, formatRatio(dv.ratioNow), dv.iceAddedG ? '뜨거운 물 + 얼음 + 가수 + 추가 얼음' : '뜨거운 물 + 얼음 + 가수'],
    ['온도', `${c.tempC}℃`],
    [WORDS.grind.label, grind],
    // 분쇄 측정(9/26): 언스페셜티 CSV·사진으로 붙인 값 — AI 공유에도 이 줄로 나간다
    ...(measurementOf(b) ? [['분쇄 측정', measureLine(measurementOf(b)), '언스페셜티 분쇄도']] : []),
    ['드리퍼', c.dripper ?? '—'],
    ['필터', c.filter ?? '—'],
    [WORDS.rinse.label, c.rinsed == null ? '—' : c.rinsed ? '함' : '안 함', WORDS.rinse.sub],
    ['드립 방법', r.actualPourMethod != null ? `${r.actualPourMethod} (계획 ${c.pourMethod})` : c.pourMethod ?? '—'],
    [WORDS.dilution.label, `${n2(dv.dilutionG)}g${dv.measured ? ' (가수 전·후 무게로 계산)' : ''}`, WORDS.dilution.sub],
    ['종료 상태', endStateLabel(r.endState) ?? '—'],
    [WORDS.serverTotal.label, r.serverWeightG != null ? `${n2(r.serverWeightG)}g${r.server?.tareG != null ? ` (${r.server.name || '서버'} ${n2(r.server.tareG)}g 포함)` : ''}` : '—'],
    [WORDS.serverAfter.label, r.serverAfterG != null ? `${n2(r.serverAfterG)}g` : '—'],
    // 추가 얼음(아이스만, 9/26): 적지 않았으면 «안 넣음»이 아니라 «모름»(AI 가 0g 으로 읽지 않게)
    ...(c.style === 'hot' ? [] : [
      [WORDS.iceAdded.label, r.iceAddedOn ? `${n2(r.iceAddedG ?? 0)}g` : '기록 안 함(더 넣었을 수 있음 — 양 모름)', WORDS.iceAdded.sub],
      ...(r.iceAddedOn ? [[WORDS.serverAfterIce.label, r.serverAfterIceG != null ? `${n2(r.serverAfterIceG)}g` : '—']] : []),
    ]),
    ...(r.extraNote ? [[WORDS.resultNote.label, r.extraNote]] : []),
    [WORDS.netWeight.label, net != null ? `${n2(net)}g` : '—', WORDS.netWeight.sub],
  ];
}

// 단계별: 레시피 끝 시각 vs 실제로 누른 시각. 마지막 단계는 [종료]를 누른 시각(= 물이 다 빠진 시각).
export function stepRows(b) {
  return timerOf(b).steps.map((s) => ({
    label: s.label,
    targetCumG: s.targetCumG,
    plannedEndSec: s.plannedEndSec,
    actualEndSec: s.actualEndSec,
    corrected: Boolean(s.corrected), // 결과 화면에서 고친 시각(9/25)
    verdict: s.actualEndSec == null ? null : timingVerdict(s.actualEndSec - s.plannedEndSec),
  }));
}

// AI 공유 파일(MD)의 테이스팅 노트 줄. 「선택 안 함」 항목은 줄째로 뺀다(9/26 사용자 결정 — share.js 머리말).
// 고르지 않았어도 종류·메모를 적었으면 그것만 남긴다.
export function surveyRows(s) {
  if (!s) return null;
  const withNote = (text, note) => (note ? (text ? `${text} — 메모: ${note}` : `메모: ${note}`) : text);
  const rows = SURVEY_ITEMS.flatMap((it) => {
    const v = s.items[it.key];
    if (!v || (v.level == null && !v.kinds?.length && !v.note)) return [];
    const word = v.level == null ? null : INTENSITY_WORDS[v.level - 1];
    return [[it.label, withNote([word, ...(v.kinds ?? [])].filter(Boolean).join(' · '), v.note)]];
  });
  // 잡미: 안 고르면 «없음»으로 줄을 남긴다(9/26 사용자 결정 — 잡미는 안 고른 것과 없음이 같은 뜻. JSON 은 null, core/share.js aiSurvey)
  rows.push([WORDS.offFlavor.label, withNote(s.offFlavors?.length ? s.offFlavors.join(', ') : '없음', s.offFlavorNote)]);
  const perceived = Object.entries(s.notePerception ?? {});
  if (perceived.length) rows.push([WORDS.notePerception.label, perceived.map(([n, p]) => `${n}: ${p}`).join(' · ')]);
  if (s.myNotes?.length) rows.push([WORDS.myNotes.label, s.myNotes.join(', ')]); // 비었으면 뺀다(9/26)
  if (s.liking != null) rows.push(['만족도', LIKING_WORDS[s.liking - 1]]);
  if (s.extraNote) rows.push(['추가 입력', s.extraNote]);
  return rows;
}

// 봉투 일수 한 줄(9/26 사용자 결정 — 로스팅 후 일수를 실온·냉동으로 나눠 적는다, 환산 비율 없음):
// 「로스팅 후 40일(실온 10일 · 냉동 30일) · 개봉 후 5일」. 냉동한 적이 없으면 괄호를 뺀다. 제조일을 소비기한에서 셌으면 「약 …(추정)」
export function daysLine(d) {
  if (!d) return '';
  const out = [];
  if (d.roast != null) out.push(`로스팅 후 ${d.estimated ? '약 ' : ''}${d.roast}일${d.frozen ? `(실온 ${d.room}일 · 냉동 ${d.frozen}일)` : ''}${d.estimated ? '(추정)' : ''}`);
  else if (d.frozen) out.push(`냉동 ${d.frozen}일`);
  if (d.open != null) out.push(`개봉 후 ${d.open}일`);
  return out.join(' · ');
}

// 봉투 한 줄 요약: 일수 + 남은 양(추정). 값이 없는 칸은 뺀다.
export function bagFacts(bag, brews, beans = [], now = Date.now()) {
  const out = [];
  const days = daysLine(bagDays(bag, now));
  if (days) out.push(days);
  const st = bagStock(bag, brews, beans);
  if (st.remainingG != null) out.push(`남은 약 ${n2(Math.max(0, st.remainingG))}g(추정)`);
  return out;
}

// 원두 봉투 요약(목록 한 줄): 「봉투 3 · 사용 중 1 · 보관 중(냉동) 2 · 남은 약 520g(추정)」
export function bagSummary(st) {
  if (!st.bags.length) return '봉투 없음';
  const parts = Object.keys(BAG_STATES).filter((k) => st.counts[k]).map((k) => `${BAG_STATES[k]} ${st.counts[k]}`);
  return [`봉투 ${st.bags.length}`, ...parts, st.remainingG != null ? `남은 약 ${n2(st.remainingG)}g(추정)` : null].filter(Boolean).join(' · ');
}

// 기록의 원두 상태(그때 값): 봉투 일수 + 갈 때 원두 상태(9/26 — 사용자가 고름, 냉동실 봉투면 처음 값 «냉동 상태로»)
export const GRIND_STATE_WORDS = { frozen: '냉동 상태로 갊', room: '실온에서 갊' };
export function beanStateLine(b) {
  const age = daysLine(b.bean?.age);
  const g = GRIND_STATE_WORDS[b.conditions?.grindBeanState] ?? null;
  return [age || null, g].filter(Boolean).join(' · ');
}
