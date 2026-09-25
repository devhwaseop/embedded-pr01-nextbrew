// 기록 한 건을 사람이 읽는 [항목, 값, 부가 설명] 줄로 바꾼다(부가 설명은 없을 수 있다).
// 화면(조건 목록·단계표)과 AI 공유 파일(MD)이 같은 표기를 쓰게 한 곳에 둔다.

import { formatGrind, grindActual, netServerWeight, timingVerdict, beanStock, daysSince, dilutionView, SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS } from './schema.js';
import { formatRatio } from './recipe.js';
import { WORDS, endStateLabel } from './words.js';

export function conditionRows(b) {
  const c = b.conditions;
  const r = b.result ?? {};
  const g = c.grind;
  const net = netServerWeight(r);
  const dv = dilutionView(b);
  const grind = g
    ? `${g.grinderName ? `${g.grinderName} ` : ''}${formatGrind(g.dial, g.zeroOffset)}${g.dial != null ? ` · 실제 ${grindActual(g.dial, g.zeroOffset)}` : ''}${g.um != null ? ` · 참고 약 ${g.um}µm${g.umSd != null ? ` ±${g.umSd}` : ''}` : ''}`
    : '—';
  return [
    ['원두', b.bean?.name ?? '—'],
    ['원두량', `${c.doseG}g`],
    ['뜨거운 물', r.actualWaterG != null ? `${r.actualWaterG}g (계획 ${c.hotWaterG}g)` : `${c.hotWaterG}g`],
    ['얼음', c.style === 'hot' ? '핫' : `${c.iceG}g${c.iceTargetG != null && c.iceTargetG !== c.iceG ? ` (추천 ${c.iceTargetG}g)` : ''}`],
    [WORDS.ratio.label, formatRatio((r.actualWaterG ?? c.hotWaterG) / c.doseG)],
    [`${WORDS.ratio.label}(가수 포함)`, formatRatio(dv.ratioNow), '뜨거운 물 + 얼음 + 가수'],
    ['온도', `${c.tempC}℃`],
    [WORDS.grind.label, grind],
    ['드리퍼', c.dripper ?? '—'],
    ['필터', c.filter ?? '—'],
    [WORDS.rinse.label, c.rinsed == null ? '—' : c.rinsed ? '함' : '안 함', WORDS.rinse.sub],
    ['드립 방법', r.actualPourMethod != null ? `${r.actualPourMethod} (계획 ${c.pourMethod})` : c.pourMethod ?? '—'],
    [WORDS.dilution.label, `${dv.dilutionG}g${dv.measured ? ' (가수 전·후 무게로 계산)' : ''}`, WORDS.dilution.sub],
    ['종료 상태', endStateLabel(r.endState) ?? '—'],
    [WORDS.serverTotal.label, r.serverWeightG != null ? `${r.serverWeightG}g${r.server?.tareG != null ? ` (${r.server.name || '서버'} ${r.server.tareG}g 포함)` : ''}` : '—'],
    [WORDS.serverAfter.label, r.serverAfterG != null ? `${r.serverAfterG}g` : '—'],
    [WORDS.netWeight.label, net != null ? `${net}g` : '—', WORDS.netWeight.sub],
  ];
}

// 단계별: 레시피 끝 시각 vs 실제로 누른 시각. 마지막 단계는 [종료]를 누른 시각(= 물이 다 빠진 시각).
export function stepRows(b) {
  return b.timer.steps.map((s) => ({
    label: s.label,
    targetCumG: s.targetCumG,
    plannedEndSec: s.plannedEndSec,
    actualEndSec: s.actualEndSec,
    verdict: s.actualEndSec == null ? null : timingVerdict(s.actualEndSec - s.plannedEndSec),
  }));
}

export function surveyRows(s) {
  if (!s) return null;
  const withNote = (text, note) => (note ? `${text} — 메모: ${note}` : text);
  const rows = SURVEY_ITEMS.map((it) => {
    const v = s.items[it.key];
    const word = v.level == null ? '선택 안 함' : INTENSITY_WORDS[v.level - 1];
    return [it.label, withNote([word, ...(v.kinds ?? [])].join(' · '), v.note)];
  });
  rows.push([WORDS.offFlavor.label, withNote(s.offFlavors.length ? s.offFlavors.join(', ') : '없음', s.offFlavorNote)]);
  const perceived = Object.entries(s.notePerception ?? {});
  if (perceived.length) rows.push([WORDS.notePerception.label, perceived.map(([n, p]) => `${n}: ${p}`).join(' · ')]);
  rows.push([WORDS.myNotes.label, s.myNotes.length ? s.myNotes.join(', ') : '—']);
  rows.push(['만족도', s.liking == null ? '선택 안 함' : LIKING_WORDS[s.liking - 1]]);
  if (s.extraNote) rows.push(['추가 입력', s.extraNote]);
  return rows;
}

// 원두 한 줄 요약(9/25): 「로스팅 후 12일 · 개봉 후 3일 · 남은 약 150g(추정)」. 값이 없는 칸은 뺀다.
// 소비기한에서 거꾸로 센 제조일이면 「약 …(추정)」으로 적는다.
export function beanFacts(b, brews, now = Date.now()) {
  const out = [];
  const roasted = daysSince(b.roastedOn, now);
  if (roasted != null) out.push(b.roastedOnFrom ? `로스팅 후 약 ${roasted}일(추정)` : `로스팅 후 ${roasted}일`);
  const opened = daysSince(b.openedOn, now);
  if (opened != null) out.push(`개봉 후 ${opened}일`);
  const st = beanStock(b, brews);
  if (st.remainingG != null) out.push(`남은 약 ${Math.max(0, st.remainingG)}g(추정)`);
  return out;
}
