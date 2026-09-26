// 설정: 저장 위치·로그인 / AI 공유 / 화면(보조 설명) / 백업(JSON 내보내기·가져오기) / 정보
// (그라인더·서버는 9/26 원두 탭으로 옮김 — screens/gear.js)

import { h, section, field, toast, modal, chips, toggle } from '../dom.js';
import { store, createLocalAdapter, copyAll, COLLECTIONS } from '../../core/store.js';
import { SHARE_FORMATS, SHARE_SCOPES } from '../../core/schema.js';
import { SHARE_FORMAT_WORDS, SHARE_SCOPE_WORDS, WORDS } from '../../core/words.js';
import { buildExport, parseImport, mergeById } from '../../core/export.js';
import { logEvent } from '../../core/log.js';
import { firebaseEnabled, signOutUser } from '../../platform/firebase.js';
import { APP_VERSION } from '../../config.js';
import { storageBanner } from './records.js';

// 설정 「보조 설명」(사용자 요청 9/24): 끄면 항목 이름 옆의 옅은 설명(term 안의 term-sub)을 숨긴다. 화면을 그릴 때마다 main.js 가 부른다.
export function applyDisplaySettings() {
  document.body.classList.toggle('hide-subs', store.settings().showSubs === false);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function doExport() {
  const include = store.settings().includeLogsInExport;
  const logs = include ? await store.logs() : null;
  const data = buildExport({ brews: store.brews(), beans: store.list('beans'), grinders: store.list('grinders'), servers: store.list('servers'), recipes: store.list('recipes'), drippers: store.list('drippers'), measurements: store.list('measurements'), blends: store.list('blends'), logs });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `nextbrew-${stamp()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  logEvent('export', { brews: data.brews.length, beans: data.beans.length, grinders: data.grinders.length, servers: data.servers.length, recipes: data.recipes.length, drippers: data.drippers.length, measurements: data.measurements.length, blends: data.blends.length, logs: logs?.length ?? 0 });
}

async function doImport(file) {
  try {
    const inc = parseImport(await file.text());
    let added = 0;
    let skipped = 0;
    for (const c of COLLECTIONS) {
      const r = mergeById(store.list(c), inc[c]);
      r.added.forEach((d) => store.put(c, d, { touch: false }));
      added += r.added.length;
      skipped += r.skipped;
    }
    // 옛 파일이면 불러온 뒤 새로 고침할 때 지금 형식으로 올라간다(store.use → core/migrate.js)
    // 로그는 id 가 없어 (시각, 사건)이 같으면 같은 줄로 본다
    const have = new Set((await store.logs()).map((l) => `${l.t}|${l.ev}`));
    const newLogs = inc.logs.filter((l) => !have.has(`${l.t}|${l.ev}`));
    newLogs.forEach((l) => store.adapter.appendLog(l));
    logEvent('import', { added, skipped, logs: newLogs.length });
    toast(`가져왔습니다: ${added}건 추가, ${skipped}건은 이미 있음`);
    location.reload();
  } catch (e) {
    toast(e.message);
  }
}

export function settingsScreen() {
  const shareLabels = Object.fromEntries(SHARE_FORMATS.map((f) => [f, SHARE_FORMAT_WORDS[f].label]));
  const logCount = h('span', null, '…');
  store.logs().then((l) => (logCount.textContent = `${l.length}줄`)).catch(() => (logCount.textContent = '읽기 실패'));
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onChange: (e) => e.target.files[0] && doImport(e.target.files[0]) });
  const returnTo = sessionStorage.getItem('nb.returnTo');

  let account;
  if (!firebaseEnabled()) {
    account = h('div', { class: 'hint' }, 'Firebase 설정값(config.js)을 넣으면 로그인과 기기 간 동기화가 켜집니다.');
  } else if (store.mode === 'cloud') {
    account = h(
      'div',
      { class: 'row wrap' },
      h('button', { onClick: () => signOutUser().catch((e) => toast(e.message)) }, '로그아웃'),
      h(
        'button',
        {
          onClick: async () => {
            const k = await modal({ title: '이 기기 기록을 계정으로 옮길까요?', body: '같은 기록은 덮어써도 내용이 같습니다.', actions: [{ key: 'no', label: '닫기' }, { key: 'yes', label: '옮기기', primary: true }] });
            if (k !== 'yes') return;
            const n = await copyAll(createLocalAdapter(), store.adapter);
            logEvent('migrate', n);
            toast(`옮겼습니다: 기록 ${n.brews}건`);
            location.reload();
          },
        },
        '이 기기 기록을 계정으로 옮기기',
      ),
    );
  } else if (store.pendingAccount) {
    // 새로 고침 직후 계정 확인 중 — 로그인 버튼을 띄우지 않는다(이미 로그인한 사람에게 로그인을 권하지 않게)
    account = null;
  } else {
    // 로그인 버튼은 배너 안에 둔다 — 홈과 같은 모양(사용자 요청 9/25)
    account = null;
  }

  return h(
    'div',
    { class: 'screen' },
    h('h1', null, '설정'),
    returnTo === '#/prep'
      ? h('button', { class: 'wide', onClick: () => { sessionStorage.removeItem('nb.returnTo'); location.hash = '#/prep'; } }, '← 준비 화면으로 돌아가기')
      : null,
    // 로그인 안내와 버튼은 홈과 같은 한 칸(사용자 요청 9/25 — 9/24 에는 배너 밖에 버튼을 따로 뒀다)
    section('저장 위치', storageBanner(), account),
    // 그라인더·서버는 원두 탭의 [원두 | 레시피 | 그라인더 | 서버]로 옮겼다(사용자 요청 9/26 — 같은 «저장 항목»)
    section(
      'AI 공유',
      // 고정 안내는 칸 제목 바로 아래, 고른 것에 따라 바뀌는 설명은 칩 바로 아래(사용자 요청 9/24 — 둘이 붙어 있으면 부자연스럽다).
      // 두 기본값 모두에 해당하므로 한 번만 둔다. 그라인더·서버 칸의 「제목 → 안내 → 내용」 순서와 같다.
      h('div', { class: 'hint' }, '공유 화면에서 그때그때 바꿀 수도 있습니다.'),
      field(
        '기본 형식',
        chips({
          options: SHARE_FORMATS.map((f) => shareLabels[f]),
          selected: shareLabels[store.settings().shareFormat] ?? shareLabels.md,
          describe: Object.fromEntries(SHARE_FORMATS.map((f) => [shareLabels[f], SHARE_FORMAT_WORDS[f].sub])),
          onChange: (v) => {
            const f = SHARE_FORMATS.find((x) => shareLabels[x] === v);
            if (f) store.setSetting('shareFormat', f);
          },
        }),
      ),
      field(
        '기본 담을 기록',
        chips({
          options: SHARE_SCOPES.map((k) => SHARE_SCOPE_WORDS[k].label),
          selected: SHARE_SCOPE_WORDS[store.settings().shareScope]?.label ?? SHARE_SCOPE_WORDS.with.label,
          describe: Object.fromEntries(SHARE_SCOPES.map((k) => [SHARE_SCOPE_WORDS[k].label, SHARE_SCOPE_WORDS[k].sub])),
          onChange: (v) => {
            const k = SHARE_SCOPES.find((x) => SHARE_SCOPE_WORDS[x].label === v);
            if (k) store.setSetting('shareScope', k);
          },
        }),
      ),
    ),
    section(
      '화면',
      toggle({
        checked: store.settings().showSubs !== false,
        label: '보조 설명',
        sub: { on: '항목 이름 옆에 짧은 설명을 함께 보입니다.', off: '항목 이름만 보입니다.' },
        onChange: (v) => {
          store.setSetting('showSubs', v);
          applyDisplaySettings();
        },
      }),
    ),
    section(
      '백업',
      // 켜짐·꺼짐에 따라 설명이 바뀐다(사용자 결정 9/24 — 백업 B안)
      toggle({
        checked: store.settings().includeLogsInExport,
        label: 'Debug Log',
        sub: { on: '내보내기 파일에 앱 로그를 함께 넣습니다.', off: '앱 로그는 내보내기 파일에 넣지 않습니다.' },
        onChange: (v) => store.setSetting('includeLogsInExport', v),
      }),
      h('div', { class: 'row wrap' }, h('button', { onClick: doExport }, 'JSON 내보내기'), h('button', { onClick: () => fileInput.click() }, 'JSON 가져오기'), fileInput),
    ),
    section('정보', h('div', { class: 'hint' }, `버전 ${APP_VERSION} · 저장된 로그 `, logCount)),
  );
}
