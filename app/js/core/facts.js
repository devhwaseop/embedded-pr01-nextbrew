// 기록 한 건을 사람이 읽는 [항목, 값, 부가 설명] 줄로 바꾼다(부가 설명은 없을 수 있다).
// 화면(조건 목록·단계표)과 AI 공유 파일(MD)이 같은 표기를 쓰게 한 곳에 둔다.

import { formatGrind, grindActual, netServerWeight, timingVerdict, SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS } from './schema.js';
import { formatRatio } from './recipe.js';
import { WORDS, endStateLabel } from './words.js';

export function conditionRows(b) {
  const c = b.conditions;
  const r = b.result ?? {};
  const g = c.grind;
  const net = netServerWeight(r);
  const grind = g
    ? `${g.grinderName ? `${g.grinderName} ` : ''}${formatGrind(g.dial, g.zeroOffset)}${g.dial != null ? ` · 실제 ${grindActual(g.dial, g.zeroOffset)}` : ''}${g.um != null ? ` · 참고 약 ${g.um}µm` : ''}`
    : '—';
  return [
    ['원두', b.bean?.name ?? '—'],
    ['원두량', `${c.doseG}g`],
    ['뜨거운 물', r.actualWaterG != null ? `${r.actualWaterG}g (계획 ${c.hotWaterG}g)` : `${c.hotWaterG}g`],
    ['얼음', c.style === 'hot' ? '핫' : `${c.iceG}g`],
    ['비율', formatRatio((r.actualWaterG ?? c.hotWaterG) / c.doseG)],
    ['온도', `${c.tempC}℃`],
    [WORDS.grind.label, grind],
    ['드리퍼', c.dripper ?? '—'],
    ['필터', c.filter ?? '—'],
    [WORDS.rinse.label, c.rinsed == null ? '—' : c.rinsed ? '함' : '안 함', WORDS.rinse.sub],
    ['드립 방법', r.actualPourMethod != null ? `${r.actualPourMethod} (계획 ${c.pourMethod})` : c.pourMethod ?? '—'],
    [WORDS.dilution.label, `${r.dilutionG ?? 0}g`, WORDS.dilution.sub],
    ['종료 상태', endStateLabel(r.endState) ?? '—'],
    [WORDS.serverTotal.label, r.serverWeightG != null ? `${r.serverWeightG}g${r.server?.tareG != null ? ` (${r.server.name || '서버'} ${r.server.tareG}g 포함)` : ''}` : '—'],
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
