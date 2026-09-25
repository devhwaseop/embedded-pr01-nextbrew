// 설정: 저장 위치·로그인 / 그라인더(영점·클릭당 µm) / 서버 / AI 공유 / 화면(보조 설명) / 백업(JSON 내보내기·가져오기) / 정보

import { h, section, field, stepper, toast, modal, chips, toggle, term, googleButton, linkButton } from '../dom.js';
import { store, createLocalAdapter, copyAll, COLLECTIONS } from '../../core/store.js';
import { createGrinder, createServer, SHARE_FORMATS, SHARE_SCOPES } from '../../core/schema.js';
import { SHARE_FORMAT_WORDS, SHARE_SCOPE_WORDS, WORDS } from '../../core/words.js';
import { buildExport, parseImport, mergeById } from '../../core/export.js';
import { logEvent } from '../../core/log.js';
import { firebaseEnabled, signIn, signOutUser } from '../../platform/firebase.js';
import { APP_VERSION } from '../../config.js';
import { storageBanner } from './records.js';
import { estimateUmPerClick } from '../../core/compass.js';

// 설정 「보조 설명」(사용자 요청 9/24): 끄면 항목 이름 옆의 옅은 설명(term 안의 term-sub)을 숨긴다. 화면을 그릴 때마다 main.js 가 부른다.
export function applyDisplaySettings() {
  document.body.classList.toggle('hide-subs', store.settings().showSubs === false);
}

// 클릭당 µm 를 비워 두면 쓸 값: 이 그라인더 기록들의 (실제 클릭, 참고 µm)로 구한 기울기
function umHint(g) {
  const est = g.id ? estimateUmPerClick(store.brews(), g.id) : null;
  return est ? `비우면 기록 ${est.n}건으로 추정한 약 ${est.value}µm 를 씁니다.` : '비워 두면, 참고 µm 를 서로 다른 눈금에서 두 번 이상 적었을 때 기록으로 추정합니다.';
}

function grinderRow(g) {
  const draft = { ...g };
  return h(
    'div',
    { class: 'grinder-row' },
    h('input', { type: 'text', value: draft.name, placeholder: '그라인더 이름', onInput: (e) => (draft.name = e.target.value) }),
    field('영점(클릭)', stepper({ value: draft.zeroOffset, step: 1, min: -99, max: 99, onChange: (v) => (draft.zeroOffset = v ?? 0) }), '예: 110(-3)이면 −3'),
    // 클릭당 µm(선택, 사용자 결정 9/24 — 다음 추출 제안을 클릭 수로 바꾸는 데 쓴다). 비우면 기록의 참고 µm 로 추정한다.
    field(term('클릭당 µm', '선택 · 다이얼 숫자가 1 커질 때 굵어지는 µm'), stepper({ value: draft.umPerClick, step: 1, min: -500, max: 500, unit: 'µm', onChange: (v) => (draft.umPerClick = v) }),
      umHint(g)),
    h(
      'button',
      {
        type: 'button',
        onClick: () => {
          if (!draft.name.trim()) return toast('이름을 넣어 주세요.');
          const saved = store.put('grinders', { ...g, name: draft.name.trim(), zeroOffset: draft.zeroOffset, umPerClick: draft.umPerClick ?? null });
          logEvent('grinder.save', { grinderId: saved.id, name: saved.name, zeroOffset: saved.zeroOffset, umPerClick: saved.umPerClick });
          toast('저장했습니다.');
        },
      },
      '저장',
    ),
  );
}

// 서버(추출 받는 그릇): 이름 + 자체 무게. 결과 화면에서 총 무게에서 뺀다.
function serverRow(sv) {
  const draft = { ...sv };
  return h(
    'div',
    { class: 'grinder-row' },
    h('input', { type: 'text', value: draft.name, placeholder: '서버 이름 (예: 하리오 서버 600)', onInput: (e) => (draft.name = e.target.value) }),
    field('서버 자체 무게', stepper({ value: draft.tareG, step: 1, min: 0, max: 3000, unit: 'g', onChange: (v) => (draft.tareG = v) }), '빈 서버를 저울에 올린 값'),
    h(
      'button',
      {
        type: 'button',
        onClick: () => {
          if (!draft.name.trim()) return toast('이름을 넣어 주세요.');
          if (draft.tareG == null) return toast('서버 무게를 넣어 주세요.');
          const saved = store.put('servers', { ...sv, name: draft.name.trim(), tareG: draft.tareG });
          logEvent('server.save', { serverId: saved.id, name: saved.name, tareG: saved.tareG });
          toast('저장했습니다.');
        },
      },
      '저장',
    ),
  );
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function doExport() {
  const include = store.settings().includeLogsInExport;
  const logs = include ? await store.logs() : null;
  const data = buildExport({ brews: store.brews(), beans: store.list('beans'), grinders: store.list('grinders'), servers: store.list('servers'), recipes: store.list('recipes'), logs });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `nextbrew-${stamp()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  logEvent('export', { brews: data.brews.length, beans: data.beans.length, grinders: data.grinders.length, servers: data.servers.length, recipes: data.recipes.length, logs: logs?.length ?? 0 });
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
  const grinderList = h('div', null, ...store.list('grinders').map(grinderRow));
  const serverList = h('div', null, ...store.list('servers').map(serverRow));
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
    account = googleButton({ onClick: () => signIn().catch((e) => toast(`로그인 실패: ${e.code ?? e.message}`)) });
  }

  return h(
    'div',
    { class: 'screen' },
    h('h1', null, '설정'),
    returnTo === '#/prep'
      ? h('button', { class: 'wide', onClick: () => { sessionStorage.removeItem('nb.returnTo'); location.hash = '#/prep'; } }, '← 준비 화면으로 돌아가기')
      : null,
    // 설정에서는 배너 안 「로그인」 링크를 빼고 버튼 하나만 둔다(사용자 요청 9/24 — 둘 다 뜨면 과함)
    section('저장 위치', storageBanner({ loginLink: false }), account),
    section(
      '그라인더',
      h('div', { class: 'hint' }, '영점은 언제든 바꿀 수 있습니다. 이미 저장된 기록은 그때의 영점을 그대로 가집니다.'),
      grinderList,
      h('button', { onClick: () => grinderList.append(grinderRow(createGrinder())) }, '＋ 그라인더 추가'),
      // 보조 자료(사용자 결정 9/24): 데이터를 앱에 옮기지 않고 링크만 둔다 — 이용 허락 표시가 없고 두 곳 모두 크라우드소싱 추정치라서
      h(
        'div',
        { class: 'source' },
        '다른 그라인더의 클릭·µm를 맞춰 볼 때(추정치, 참고용): ',
        h('a', { href: 'https://honestcoffeeguide.com/coffee-grind-size-chart/', target: '_blank', rel: 'noopener' }, 'Honest Coffee Guide 분쇄 크기 표'),
        ' · ',
        h('a', { href: 'https://beeancoffee.com/grinder-setting-converter/', target: '_blank', rel: 'noopener' }, 'Beean Coffee 설정 변환기'),
      ),
      // 언스페셜티(사용자 추가 9/24): 인쇄한 측정지 위에서 찍은 사진으로 «내» 분쇄의 평균 µm 를 잰다 — 추정표가 아니라 측정이라 줄을 나눈다.
      // 개발기 칼럼(측정 원리)은 에이전트 확인용으로 받은 것이라 앱에는 두지 않는다(사용자 정정 9/24).
      h(
        'div',
        { class: 'source' },
        '내 분쇄를 사진으로 재 볼 때(A4 측정지 인쇄): ',
        h('a', { href: 'https://community.unspecialty.com/compass/grinder', target: '_blank', rel: 'noopener' }, '언스페셜티 분쇄도 가이드'),
      ),
    ),
    section(
      '레시피',
      h('div', { class: 'hint' }, 'AI 로 레시피를 추가하거나 직접 입력하고, 추가한 레시피를 고치거나 지웁니다.'),
      linkButton({ href: '#/recipes', label: '레시피 추가·관리' }),
    ),
    section(
      '서버',
      h('div', { class: 'hint' }, `결과 화면에서 서버 총 무게를 재면 여기 무게를 빼서 ${WORDS.netWeight.label}를 계산합니다.`),
      serverList,
      h('button', { onClick: () => serverList.append(serverRow(createServer())) }, '＋ 서버 추가'),
    ),
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
