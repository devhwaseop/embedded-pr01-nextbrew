// 옛 기록 → 지금 형식, 그리고 등록 항목 따라가기(사용자 요청 9/26).
// ① 버전 올리기: 옛 기록이든 새 기록이든 «버전 없이» 같은 선택지로 통하게, 뜻은 바꾸지 않고 지금 형식으로 옮긴다.
// ② 포인터: 기록은 원두·그라인더·서버·드리퍼를 ID 로 가리키고, 이름 같은 «그 물건의 정보»는 등록 항목을 따른다
//    (예: 드리퍼 이름 오타 v60 → a60 을 고치면 그 드리퍼를 쓴 옛 기록도 a60). 기록 안의 이름은 등록 항목을 지웠을 때 남는 마지막 이름이다.
//    «그 시점의 상태»는 따라가지 않는다 — 그라인더 영점(사용자 결정 9/26: 그때 당시의 영점이라 고치지 않음), 레시피 사본(그때 쓴 레시피).
// 저장소가 불러올 때(store.use)와 JSON 가져오기 뒤에 돈다. 바뀐 문서만 돌려주고, 같은 입력에 두 번 돌려도 더 바뀌지 않는다(멱등).

import { SCHEMA_VERSION, ROASTS, createDripper, createBag, bagDays, activeBag, inactiveMark } from './schema.js';
import { DRIPPER_SEEDS, catalogFields } from '../data/drippers.js';
import { endStateKey } from './words.js';

// 옛 배전도 단어 → 숫자: 단어의 띠(2칸씩) 가운데를 0.5 단위로 올림. roastLevelFrom = 'word' 로 «옛 표기에서 옮긴 값»임을 남긴다.
export const ROAST_WORD_LEVEL = { 약배전: 1.5, 중약배전: 3.5, 중배전: 5.5, 중강배전: 7.5, 강배전: 9.5 };

// 기록 한 건을 등록 항목에 맞춘다 → 바뀐 칸 이름들(없으면 빈 배열). reg = { beans, grinders, servers, drippers, blends } 각각 Map(id → 문서)
// 블렌드 템플릿으로 섞은 기록(9/26)은 템플릿 이름과 원두별 이름을 따른다. 원두별 무게·비율은 그때 값 그대로.
export function syncRefs(b, reg) {
  const hit = [];
  const bean = b.bean?.id ? reg.beans?.get(b.bean.id) : null;
  if (bean && bean.name && b.bean.name !== bean.name) {
    b.bean = { ...b.bean, name: bean.name };
    hit.push('bean');
  }
  const blend = b.bean?.blendId ? reg.blends?.get(b.bean.blendId) : null;
  if (blend && blend.name && b.bean.name !== blend.name) {
    b.bean = { ...b.bean, name: blend.name };
    hit.push('blend');
  }
  if (b.bean?.parts?.length && reg.beans?.size) {
    const parts = b.bean.parts.map((p) => {
      const src = p.id ? reg.beans.get(p.id) : null;
      return src && src.name && p.name !== src.name ? { ...p, name: src.name } : p;
    });
    if (parts.some((p, i) => p !== b.bean.parts[i])) {
      b.bean = { ...b.bean, parts };
      hit.push('blendPart');
    }
  }
  const g = b.conditions?.grind;
  const grinder = g?.grinderId ? reg.grinders?.get(g.grinderId) : null;
  if (grinder && grinder.name && g.grinderName !== grinder.name) {
    b.conditions.grind = { ...g, grinderName: grinder.name }; // 영점(zeroOffset)은 그때 값 그대로
    hit.push('grinder');
  }
  const s = b.result?.server;
  const server = s?.id ? reg.servers?.get(s.id) : null;
  if (server && (s.name !== server.name || (server.tareG != null && s.tareG !== server.tareG))) {
    b.result.server = { ...s, name: server.name, tareG: server.tareG ?? s.tareG }; // 서버 자체 무게는 그 물건의 값 — 고치면 따라간다
    hit.push('server');
  }
  const dripper = b.conditions?.dripperId ? reg.drippers?.get(b.conditions.dripperId) : null;
  if (dripper && dripper.name && b.conditions.dripper !== dripper.name) {
    b.conditions.dripper = dripper.name;
    hit.push('dripper');
  }
  return hit;
}

// 블렌드 템플릿·미리 섞은 블렌드(원두)의 구성 원두 이름을 등록 원두에 맞춘다 → 바뀌었으면 true(문서를 바꾼다)
// doc = 템플릿(parts[].beanId) 또는 원두(blend.by 'me' 의 parts[].beanId), beans = Map(id → 원두)
export function syncBlendParts(doc, beans) {
  const parts = doc.parts ?? (doc.blend?.by === 'me' ? doc.blend.parts : null);
  if (!parts?.length) return false;
  let changed = false;
  const next = parts.map((p) => {
    const src = p.beanId ? beans.get(p.beanId) : null;
    if (!src || !src.name || p.name === src.name) return p;
    changed = true;
    return { ...p, name: src.name };
  });
  if (!changed) return false;
  if (doc.parts) doc.parts = next;
  else doc.blend = { ...doc.blend, parts: next };
  return true;
}

// ── 같은 드리퍼(9/26 사용자 요청) ─────────────────────────────
// [이 기기 기록을 계정으로 옮기기]로 기기와 계정에서 따로 만든 앱 기본 드리퍼가 두 벌이 됐다. 이름이 같고 특징이 어긋나지 않으면 같은 드리퍼로 본다.
const DRIPPER_FEATURES = ['catalogKey', 'brand', 'model', 'size', 'cups', 'shape', 'method', 'holes', 'ribs', 'material', 'filter'];
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
export const dripperNameKey = (s) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase(); // 앞뒤·겹친 빈칸, 대소문자 무시
export function sameNameGroups(drippers) {
  const m = new Map();
  for (const d of drippers ?? []) {
    const k = dripperNameKey(d.name);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(d);
  }
  return [...m.values()].filter((g) => g.length > 1);
}
// 두 드리퍼의 특징이 어긋나는 칸(둘 다 값이 있고 다른 칸)
export function dripperConflicts(a, b) {
  return DRIPPER_FEATURES.filter((k) => !isEmpty(a[k]) && !isEmpty(b[k]) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

// data = { brews, beans, grinders, servers, drippers, ... }(배열), settings = 설정
// → { data(바뀐 문서가 반영된 배열들), changed: { 컬렉션: [문서] }, removed: { 컬렉션: [id] }(합쳐서 없앤 것), steps: { 단계: 건수 }, settingsPatch }
export function upgradeData(data, settings = {}, now = Date.now()) {
  const out = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]));
  const changed = {};
  const steps = {};
  const settingsPatch = {};
  const removed = {};
  const mark = (col, doc, step) => {
    doc.schemaVersion = SCHEMA_VERSION;
    (changed[col] ??= new Map()).set(doc.id, doc);
    steps[step] = (steps[step] ?? 0) + 1;
  };
  // 바꿀 문서는 복사해서 고친다(불러온 원본을 건드리지 않게)
  const editable = (col, i) => {
    const doc = out[col][i];
    if (changed[col]?.has(doc.id)) return changed[col].get(doc.id);
    const copy = structuredClone(doc);
    out[col][i] = copy;
    return copy;
  };

  // 원두: 이름 자동 짓기 표시가 없는 옛 원두 = 직접 적은 이름(9/25 규칙 그대로), 단어만 있는 배전도 → 숫자
  (out.beans ?? []).forEach((b, i) => {
    if (b.nameAuto === undefined) mark('beans', Object.assign(editable('beans', i), { nameAuto: false }), 'bean.nameAuto');
    if (b.roastLevel == null && ROASTS.includes(b.roast)) {
      mark('beans', Object.assign(editable('beans', i), { roastLevel: ROAST_WORD_LEVEL[b.roast], roastLevelFrom: 'word' }), 'bean.roastLevel');
    }
  });

  // 원두 봉투(9/26 사용자 결정 B안): 봉투가 없는 원두 → 원두에 있던 구매 무게·제조일·개봉일·상태로 봉투 하나를 만들고, 원두에서는 그 칸을 뺀다.
  // 뜻은 그대로: 사용 중이던 원두 → 「사용 중」 봉투, 소모(다 씀)였던 원두 → 「모두 소비됨」 봉투. 미리 섞은 블렌드는 섞은 무게 합을 봉투 무게로.
  out.bags ??= [];
  const LEGACY = ['purchased', 'roastedOn', 'roastedOnFrom', 'openedOn', 'status', 'consumedAt'];
  const bagOf = new Set(out.bags.map((g) => g.beanId));
  (out.beans ?? []).forEach((b, i) => {
    const legacy = LEGACY.some((k) => b[k] !== undefined);
    if (bagOf.has(b.id) && !legacy) return;
    const doc = editable('beans', i);
    if (!bagOf.has(b.id)) {
      const consumed = b.status === 'consumed';
      const mixG = b.blend?.by === 'me' ? (b.blend.parts ?? []).reduce((a, p) => a + (Number(p.g) || 0), 0) : null;
      const bag = createBag({
        beanId: b.id,
        purchased: mixG != null ? { amount: mixG, unit: 'g' } : b.purchased ?? null,
        roastedOn: b.roastedOn ?? null,
        roastedOnFrom: b.roastedOnFrom ?? null,
        openedOn: b.openedOn ?? null,
        state: consumed ? 'consumed' : 'inUse',
        stateBefore: consumed ? 'inUse' : null,
        consumedAt: consumed ? b.consumedAt ?? null : null,
      }, now + out.bags.length);
      out.bags.push(bag);
      bagOf.add(b.id);
      mark('bags', bag, 'bag.fromBean');
    }
    for (const k of LEGACY) delete doc[k];
    mark('beans', doc, 'bean.toBag');
  });
  // 미리 섞은 블렌드의 구성 → 덜어 낸 봉투(그 원두의 봉투)
  (out.beans ?? []).forEach((b, i) => {
    if (b.blend?.by !== 'me' || (b.blend.parts ?? []).every((p) => !p.beanId || p.bagId)) return;
    const doc = editable('beans', i);
    doc.blend = { ...doc.blend, parts: doc.blend.parts.map((p) => (p.bagId || !p.beanId ? p : { ...p, bagId: activeBag(p.beanId, out.bags)?.id ?? out.bags.find((g) => g.beanId === p.beanId)?.id ?? null })) };
    mark('beans', doc, 'bean.mixBag');
  });

  // 드리퍼 등록(9/26 신설): 처음 한 번 앱 기본 드리퍼 + 기록에 적힌 드리퍼 이름으로 등록 목록을 만든다(전에 고를 수 있던 것이 그대로 통하게).
  // 그 뒤로는 기록에만 있고 등록에 없는 이름(가져온 옛 기록 등)만 더한다. 사용자가 지운 기본 드리퍼는 다시 만들지 않는다.
// 9/27 사용자 결정: 사용자가 등록하지 않은 기본 드리퍼는 추출 준비 목록에 뜨지 않는다 — 새 저장소의 앱 기본 드리퍼는 «비활성»으로 만들고,
// 드리퍼 화면에서 [다시 활성화]하면 뜬다. 기록에 적힌 이름이면(이미 쓴 드리퍼) 활성으로 만든다. 이미 만들어 둔 저장소는 건드리지 않는다.
  out.drippers ??= [];
  const byName = new Map(out.drippers.map((d) => [d.name, d]));
  const addDripper = (name, step, extra = {}) => {
    const d = createDripper({ name, ...extra }, now + out.drippers.length);
    out.drippers.push(d);
    byName.set(name, d);
    mark('drippers', d, step);
  };
  const recordNames = [...new Set((out.brews ?? []).filter((b) => !b.conditions?.dripperId).map((b) => b.conditions?.dripper).filter(Boolean))];
  if (!settings.drippersSeeded) {
    // 앱 기본 드리퍼는 기본 목록(data/drippers.js)의 특징을 채워 만든다(9/26 — 형식 통일)
    for (const sd of DRIPPER_SEEDS) {
      if (byName.has(sd.name)) continue;
      addDripper(sd.name, 'dripper.seed', { ...catalogFields(sd.key, sd.size), inactive: recordNames.includes(sd.name) ? null : inactiveMark({}, now) });
    }
    for (const n of recordNames) if (!byName.has(n)) addDripper(n, 'dripper.seed');
    settingsPatch.drippersSeeded = true;
  } else {
    for (const n of recordNames) if (!byName.has(n)) addDripper(n, 'dripper.fromRecord');
  }

  // 9/26 전에 이름만으로 만들어 둔 앱 기본 드리퍼 → 기본 목록과 잇는다(이름은 그대로, 비어 있는 칸만 채움)
  out.drippers.forEach((d, i) => {
    const sd = DRIPPER_SEEDS.find((x) => x.name === d.name);
    if (!sd || d.catalogKey) return;
    const doc = editable('drippers', i);
    for (const [k, v] of Object.entries(catalogFields(sd.key, sd.size))) {
      if (doc[k] == null || doc[k] === '' || (Array.isArray(doc[k]) && !doc[k].length)) doc[k] = structuredClone(v);
    }
    mark('drippers', doc, 'dripper.catalog');
  });

  // 같은 드리퍼 합치기: 남기는 것 = 기록이 더 많이 가리키는 것(같으면 먼저 저장된 것). 남기는 쪽의 빈 칸은 없애는 쪽 값으로 채우고, 기록은 아래에서 옮긴다.
  // 특징이 어긋나면 합치지 않는다 — 드리퍼 화면이 알린다(sameNameGroups). 합친 것은 data.upgrade 로그에 id 가 남는다.
  const merged = new Map(); // 없앤 id → 남긴 id
  const refs = (id) => (out.brews ?? []).filter((b) => b.conditions?.dripperId === id).length;
  for (const group of sameNameGroups(out.drippers)) {
    const order = [...group].sort((a, b) => refs(b.id) - refs(a.id) || String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? '')));
    const keepId = order[0].id;
    for (const other of order.slice(1)) {
      const cur = changed.drippers?.get(keepId) ?? out.drippers.find((d) => d.id === keepId);
      if (dripperConflicts(cur, other).length) continue;
      const doc = editable('drippers', out.drippers.findIndex((d) => d.id === keepId));
      for (const k of DRIPPER_FEATURES) if (isEmpty(doc[k]) && !isEmpty(other[k])) doc[k] = structuredClone(other[k]);
      if (!doc.note && other.note) doc.note = other.note;
      if (doc.inactive && !other.inactive) doc.inactive = null; // 한쪽이라도 쓰는 중(활성)이면 활성으로 남긴다(9/27)
      const seen = new Set((doc.sources ?? []).map((x) => `${x.kind}|${x.url}|${x.label}`));
      doc.sources = [...(doc.sources ?? []), ...(other.sources ?? []).filter((x) => !seen.has(`${x.kind}|${x.url}|${x.label}`))];
      mark('drippers', doc, 'dripper.merge');
      merged.set(other.id, keepId);
    }
  }
  if (merged.size) {
    out.drippers = out.drippers.filter((d) => !merged.has(d.id));
    for (const id of merged.keys()) changed.drippers?.delete(id);
    removed.drippers = [...merged.keys()];
  }
  const dripperIds = new Set(out.drippers.map((d) => d.id));
  const byKey = new Map(out.drippers.map((d) => [dripperNameKey(d.name), d]));

  // 기록: 옛 종료 상태 글자 → key, 드리퍼 이름 → 드리퍼 ID
  (out.brews ?? []).forEach((b, i) => {
    const key = endStateKey(b.result?.endState ?? null);
    if (b.result && key !== (b.result.endState ?? null)) {
      const d = editable('brews', i);
      d.result.endState = key;
      mark('brews', d, 'brew.endState');
    }
    const c = b.conditions;
    if (c?.dripper && !c.dripperId && byName.has(c.dripper)) {
      const d = editable('brews', i);
      d.conditions.dripperId = byName.get(c.dripper).id;
      mark('brews', d, 'brew.dripperLink');
    }
    // 합친 드리퍼를 가리키던 기록 → 남긴 드리퍼로
    if (c?.dripperId && merged.has(c.dripperId)) {
      const d = editable('brews', i);
      d.conditions.dripperId = merged.get(c.dripperId);
      mark('brews', d, 'brew.dripperMerge');
    } else if (c?.dripperId && !dripperIds.has(c.dripperId) && byKey.has(dripperNameKey(c.dripper))) {
      // 가리키던 드리퍼가 지워진 기록(다른 기기에서 지움·콘솔에서 지움) → 이름이 같은 드리퍼가 있으면 그것으로.
      // 없으면 그대로 둔다 — 기록은 이름(conditions.dripper)으로 보이고, 없는 ID 는 어디서도 오류를 내지 않는다(테스트).
      const d = editable('brews', i);
      d.conditions.dripperId = byKey.get(dripperNameKey(c.dripper)).id;
      mark('brews', d, 'brew.dripperRelink');
    }
  });

  // 기록 → 봉투(9/26 B안): 원두만 가리키던 기록에 그 원두의 봉투를 잇고, 그때의 일수(로스팅·실온·냉동·개봉)를 적어 둔다(그때 값 — 영점처럼 고치지 않음).
  // 블렌드 템플릿으로 섞은 기록은 원두마다 봉투를 잇는다.
  const firstBag = (beanId) => out.bags.find((g) => g.beanId === beanId) ?? null;
  (out.brews ?? []).forEach((x, i) => {
    const bn = x.bean;
    const bag = bn?.id && !bn.bagId ? firstBag(bn.id) : null;
    if (bag) {
      const d = editable('brews', i);
      d.bean = { ...d.bean, bagId: bag.id, age: d.bean.age ?? bagDays(bag, x.timer?.startedAt ?? now) };
      mark('brews', d, 'brew.bag');
    }
    if (bn?.parts?.some((p) => p.id && !p.bagId && firstBag(p.id))) {
      const d = editable('brews', i);
      d.bean = { ...d.bean, parts: d.bean.parts.map((p) => (p.bagId || !firstBag(p.id) ? p : { ...p, bagId: firstBag(p.id).id })) };
      mark('brews', d, 'brew.partBag');
    }
  });

  // 포인터: 블렌드 템플릿·미리 섞은 블렌드의 구성 원두 이름(9/26)
  const beanMap = new Map((out.beans ?? []).map((d) => [d.id, d]));
  for (const col of ['blends', 'beans']) {
    (out[col] ?? []).forEach((doc, i) => {
      if (!syncBlendParts(structuredClone(doc), beanMap)) return;
      const d = editable(col, i);
      syncBlendParts(d, beanMap);
      mark(col, d, `ref.${col === 'blends' ? 'templatePart' : 'mixPart'}`);
    });
  }

  // 포인터: 등록 항목의 지금 정보로 기록을 맞춘다
  const reg = Object.fromEntries(['beans', 'grinders', 'servers', 'drippers', 'blends'].map((c) => [c, new Map((out[c] ?? []).map((d) => [d.id, d]))]));
  (out.brews ?? []).forEach((b, i) => {
    const probe = structuredClone(b);
    const hit = syncRefs(probe, reg);
    if (!hit.length) return;
    const d = editable('brews', i);
    syncRefs(d, reg);
    for (const h of hit) mark('brews', d, `ref.${h}`);
  });

  return { data: out, changed: Object.fromEntries(Object.entries(changed).map(([k, m]) => [k, [...m.values()]])), removed, steps, settingsPatch };
}
