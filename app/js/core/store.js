// 저장소 — 화면은 이 파일만 부른다. 저장 위치는 «어댑터»로 갈아 끼운다.
//   local : 이 기기(localStorage). Firebase 설정 전이나 로그아웃 상태.
//   cloud : Firebase 계정(platform/firebase.js). 끊긴 동안 쓴 것은 다시 연결되면 자동 반영된다.
// 화면이 빠르게 그려지도록 기록·원두·그라인더는 메모리에 올려 두고, 쓰기는 메모리와 어댑터에 함께 한다.
// 진행 중인 추출(타이머 상태)은 기기에만 둔다 — 새로고침돼도 이어서 쓰기 위한 것이라 동기화 대상이 아니다.

import { setLogSink, logEvent } from './log.js';
import { upgradeData, syncRefs, syncBlendParts } from './migrate.js';

export const COLLECTIONS = ['brews', 'beans', 'grinders', 'servers', 'recipes', 'drippers', 'measurements', 'blends', 'bags']; // bags: 원두 봉투(9/26 B안) // recipes: 가져온 레시피(9/24), drippers·measurements·blends(블렌드 템플릿): 9/26
// 기록이 ID 로 가리키는 등록 항목 — 이것을 저장하면 가리키는 기록의 이름 등을 따라 바꾼다(core/migrate.js 포인터)
const REGISTRY = ['beans', 'grinders', 'servers', 'drippers', 'blends'];

export function createLocalAdapter(storage = globalThis.localStorage, prefix = 'nb') {
  const key = (name) => `${prefix}.${name}`;
  let reporting = false;
  const report = (name, e) => {
    console.error('[store] 기기 저장 실패', name, e);
    // 로그 저장이 실패한 경우에 다시 로그를 쓰면 같은 실패가 되풀이되므로 막는다
    if (reporting || name === 'logs') return;
    reporting = true;
    logEvent('storage.error', { key: name, message: String(e?.message ?? e) });
    reporting = false;
  };
  const read = (name, fallback) => {
    try {
      const v = storage.getItem(key(name));
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      report(name, e);
      return fallback;
    }
  };
  const write = (name, value) => {
    try {
      storage.setItem(key(name), JSON.stringify(value));
      return true;
    } catch (e) {
      report(name, e);
      return false;
    }
  };
  return {
    kind: 'local',
    async loadAll() {
      const out = { settings: read('settings', {}) };
      for (const c of COLLECTIONS) out[c] = Object.values(read(c, {}));
      return out;
    },
    put(col, doc) {
      const m = read(col, {});
      m[doc.id] = doc;
      write(col, m);
    },
    remove(col, id) {
      const m = read(col, {});
      delete m[id];
      write(col, m);
    },
    putSettings(s) {
      write('settings', s);
    },
    appendLog(entry) {
      const arr = read('logs', []);
      arr.push(entry);
      write('logs', arr);
    },
    async loadLogs() {
      return read('logs', []);
    },
  };
}

// 진행 중 추출 — 기기 전용
const ACTIVE_KEY = 'nb.activeBrew';
export function saveActive(active) {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  } catch (e) {
    logEvent('storage.error', { key: ACTIVE_KEY, message: String(e?.message ?? e) });
  }
}
export function loadActive() {
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
export function clearActive() {
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* 지울 게 없으면 그만이다 */
  }
}

function createStore() {
  const maps = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
  const listeners = new Set();
  let adapter = null;
  let settings = {};

  return {
    // 새로 고침 직후 계정 확인이 끝나기 전: 직전에 로그인했던 이메일(main.js). 확인되면 null.
    pendingAccount: null,
    get mode() {
      return adapter?.kind ?? 'none';
    },
    get adapter() {
      return adapter;
    },
    async use(next, extra = {}) {
      const all = await next.loadAll();
      adapter = next;
      for (const c of COLLECTIONS) {
        maps[c].clear();
        for (const d of all[c] ?? []) maps[c].set(d.id, d);
      }
      settings = all.settings ?? {};
      Object.assign(this, extra);
      setLogSink((entry) => adapter.appendLog(entry));
      this.upgrade('load');
      listeners.forEach((fn) => fn());
    },
    // 옛 형식 올리기 + 포인터 맞추기(core/migrate.js). 바뀐 문서만 다시 쓰고, 바뀐 게 있을 때만 로그 한 줄(무엇을 몇 건).
    // via = load(불러올 때) | import(JSON 가져오기 뒤)
    upgrade(via) {
      const data = Object.fromEntries(COLLECTIONS.map((c) => [c, [...maps[c].values()]]));
      const { changed, removed, steps, settingsPatch } = upgradeData(data, settings);
      for (const [c, docs] of Object.entries(changed)) {
        for (const d of docs) {
          maps[c].set(d.id, d);
          adapter.put(c, d);
        }
      }
      // 합쳐서 없앤 문서(9/26 같은 드리퍼) — 가리키던 기록은 위에서 남긴 쪽으로 옮겨 두었다
      for (const [c, ids] of Object.entries(removed ?? {})) {
        for (const id of ids) {
          maps[c].delete(id);
          adapter.remove(c, id);
        }
      }
      if (Object.keys(settingsPatch).length) {
        settings = { ...settings, ...settingsPatch };
        adapter.putSettings(settings);
      }
      if (Object.keys(steps).length) logEvent('data.upgrade', { via, steps, docs: Object.fromEntries(Object.entries(changed).map(([c, d]) => [c, d.length])), ...(Object.keys(removed ?? {}).length ? { removed } : {}) });
      return steps;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    list(col) {
      return [...maps[col].values()];
    },
    get(col, id) {
      return maps[col].get(id) ?? null;
    },
    // touch=false: 가져오기처럼 원래 값을 그대로 보존해야 할 때
    put(col, doc, { touch = true } = {}) {
      if (touch) doc.updatedAt = new Date().toISOString();
      maps[col].set(doc.id, doc);
      adapter.put(col, doc);
      if (REGISTRY.includes(col)) this.followRegistry(col, doc);
      return doc;
    },
    // 등록 항목을 고치면 그것을 가리키는 기록도 따라 바꾼다(포인터 — 9/26 사용자 요청). 바뀐 기록 수를 로그로 남긴다.
    followRegistry(col, doc) {
      const reg = Object.fromEntries(REGISTRY.map((c) => [c, c === col ? new Map([[doc.id, doc]]) : new Map()]));
      const hits = [];
      for (const b of maps.brews.values()) {
        const copy = structuredClone(b);
        if (!syncRefs(copy, reg).length) continue;
        maps.brews.set(copy.id, copy);
        adapter.put('brews', copy);
        hits.push(copy.id);
      }
      // 원두 이름을 고치면 그 원두를 쓰는 블렌드 템플릿·미리 섞은 블렌드의 구성 이름도 따라간다(9/26)
      const parts = [];
      if (col === 'beans') {
        const one = new Map([[doc.id, doc]]);
        for (const c of ['blends', 'beans']) {
          for (const x of maps[c].values()) {
            if (x.id === doc.id) continue;
            const copy = structuredClone(x);
            if (!syncBlendParts(copy, one)) continue;
            maps[c].set(copy.id, copy);
            adapter.put(c, copy);
            parts.push(copy.id);
          }
        }
      }
      if (hits.length || parts.length) logEvent('ref.follow', { col, id: doc.id, name: doc.name, brews: hits.length, blendParts: parts.length });
    },
    remove(col, id) {
      maps[col].delete(id);
      adapter.remove(col, id);
    },
    // 최근 추출이 앞에 오도록 정렬
    brews() {
      return this.list('brews').sort((a, b) => (b.timer?.startedAt ?? 0) - (a.timer?.startedAt ?? 0));
    },
    settings() {
      return { includeLogsInExport: false, shareFormat: 'md', shareScope: 'with', showSubs: true, ...settings };
    },
    setSetting(k, v) {
      settings = { ...settings, [k]: v };
      adapter.putSettings(settings);
    },
    async logs() {
      return adapter.loadLogs();
    },
  };
}

export const store = createStore();

// 한 저장 위치의 내용을 다른 곳으로 복사(이 기기 → 계정). 같은 id 는 덮어써도 내용이 같다.
// 로그는 id 가 없어 (시각, 사건)이 같으면 이미 있는 줄로 보고 건너뛴다 — 두 번 옮겨도 계정 로그가 두 벌이 되지 않게(9/24).
export async function copyAll(from, to) {
  const data = await from.loadAll();
  const logs = await from.loadLogs();
  const have = new Set(((await to.loadLogs?.()) ?? []).map((l) => `${l.t}|${l.ev}`));
  const newLogs = logs.filter((l) => !have.has(`${l.t}|${l.ev}`));
  for (const c of COLLECTIONS) for (const d of data[c] ?? []) to.put(c, d);
  for (const l of newLogs) to.appendLog(l);
  return { brews: data.brews.length, beans: data.beans.length, grinders: data.grinders.length, servers: data.servers?.length ?? 0, recipes: data.recipes?.length ?? 0, drippers: data.drippers?.length ?? 0, measurements: data.measurements?.length ?? 0, logs: newLogs.length, logsSkipped: logs.length - newLogs.length };
}

// 계정 모드에서 «이 기기에만 있는» 기록 수 — 이 기기 저장소에는 있는데 지금 저장소(계정)에 같은 id 가 없는 것.
// 로그인 전에 만든 기록이 로그인 뒤 화면에서 안 보이던 빈틈을 배너로 알리려고 센다(9/24).
export function localOnlyCounts(storage = globalThis.localStorage, prefix = 'nb', inAccount = (c, id) => store.get(c, id) != null) {
  const out = { total: 0 };
  for (const c of COLLECTIONS) {
    let m = {};
    try {
      m = JSON.parse(storage?.getItem(`${prefix}.${c}`) || '{}');
    } catch {
      /* 읽을 수 없으면 0건으로 본다 */
    }
    out[c] = Object.keys(m).filter((id) => !inAccount(c, id)).length;
    out.total += out[c];
  }
  return out;
}
