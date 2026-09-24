// 저장소 — 화면은 이 파일만 부른다. 저장 위치는 «어댑터»로 갈아 끼운다.
//   local : 이 기기(localStorage). Firebase 설정 전이나 로그아웃 상태.
//   cloud : Firebase 계정(platform/firebase.js). 끊긴 동안 쓴 것은 다시 연결되면 자동 반영된다.
// 화면이 빠르게 그려지도록 기록·원두·그라인더는 메모리에 올려 두고, 쓰기는 메모리와 어댑터에 함께 한다.
// 진행 중인 추출(타이머 상태)은 기기에만 둔다 — 새로고침돼도 이어서 쓰기 위한 것이라 동기화 대상이 아니다.

import { setLogSink, logEvent } from './log.js';

export const COLLECTIONS = ['brews', 'beans', 'grinders', 'servers'];

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
      listeners.forEach((fn) => fn());
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
      return doc;
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
      return { includeLogsInExport: false, shareFormat: 'md', shareScope: 'with', ...settings };
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
  return { brews: data.brews.length, beans: data.beans.length, grinders: data.grinders.length, servers: data.servers?.length ?? 0, logs: newLogs.length, logsSkipped: logs.length - newLogs.length };
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
