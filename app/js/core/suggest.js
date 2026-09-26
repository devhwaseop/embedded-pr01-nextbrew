// 원두 노트 추천 — 외부 데이터 없이 «사용자가 이전에 등록한 원두»에서만 추천한다.
// 산지 → 대표 노트의 표준 자료가 없어서다(docs/agent-notes/참고 출처 목록.md 「산지별 노트」).
// 같은 나라 + 같은 가공 방식이면 먼저, 나라만 같으면 그다음 순서로, 자주 나온 노트부터 낸다.

export function suggestNotes(beans, { country, process, excludeId = null }, limit = 8) {
  const c = (country ?? '').trim();
  if (!c) return [];
  const p = (process ?? '').trim();
  const score = new Map();
  for (const b of beans) {
    if (b.id === excludeId || (b.country ?? '').trim() !== c) continue;
    const w = p && (b.process ?? '').trim() === p ? 2 : 1;
    for (const n of b.notes ?? []) score.set(n, (score.get(n) ?? 0) + w);
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, limit)
    .map(([n]) => n);
}

// 테이스팅 노트의 원두 노트 인식 미리 채우기(사용자 요청 9/25 — screens/survey.js).
// 같은 원두(id)로 이 기록보다 먼저 내린 기록들에서, 노트마다 가장 최근에 답한 인식 값 → { 노트: { value, at(그 추출 시각) } }
export function lastNotePerceptions(brews, current, notes) {
  const earlier = brews
    .filter((x) => x.id !== current.id && current.bean?.id && x.bean?.id === current.bean.id && x.survey && x.timer.startedAt < current.timer.startedAt)
    .sort((a, b) => b.timer.startedAt - a.timer.startedAt);
  const out = {};
  for (const n of notes) {
    const hit = earlier.find((x) => x.survey.notePerception?.[n]);
    if (hit) out[n] = { value: hit.survey.notePerception[n], at: hit.timer.startedAt };
  }
  return out;
}
