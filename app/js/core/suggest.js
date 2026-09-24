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
