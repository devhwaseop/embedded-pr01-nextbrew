// JSON 내보내기·가져오기 — 백업과 부록 제출용. 클라우드가 원본이고 이것은 사본이다.

import { SCHEMA_VERSION } from './schema.js';

export const APP_NAME = 'NextBrew';

export function buildExport({ brews, beans, grinders, servers = [], logs = null, now = Date.now() }) {
  const out = {
    app: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    brews,
    beans,
    grinders,
    servers,
  };
  if (logs) out.logs = logs;
  return out;
}

// 가져오기: 형식을 확인하고, 이미 있는 id는 건너뛴다(덮어쓰지 않는다).
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 형식이 아닙니다.');
  }
  if (data?.app !== APP_NAME) throw new Error('NextBrew에서 내보낸 파일이 아닙니다.');
  if (data.schemaVersion > SCHEMA_VERSION) throw new Error('더 새 버전 앱에서 만든 파일입니다.');
  return {
    brews: Array.isArray(data.brews) ? data.brews : [],
    beans: Array.isArray(data.beans) ? data.beans : [],
    grinders: Array.isArray(data.grinders) ? data.grinders : [],
    servers: Array.isArray(data.servers) ? data.servers : [], // 9/24 추가 — 옛 파일에는 없다
    logs: Array.isArray(data.logs) ? data.logs : [],
  };
}

export function mergeById(existing, incoming) {
  const have = new Set(existing.map((d) => d.id));
  const added = incoming.filter((d) => d && d.id && !have.has(d.id));
  return { added, skipped: incoming.length - added.length };
}
