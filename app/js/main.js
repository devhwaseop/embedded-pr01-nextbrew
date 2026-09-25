// NextBrew 진입점 — 화면 전환(해시 라우팅), 하단 메뉴, 시작 처리

import { h, fill } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { store, createLocalAdapter, loadActive, copyAll } from './core/store.js';
import { logEvent } from './core/log.js';
import { APP_VERSION } from './config.js';
import { firebaseEnabled, watchAuth, createCloudAdapter } from './platform/firebase.js';
import { prepScreen, timerScreen, resultScreen } from './ui/screens/brew.js';
import { surveyScreen } from './ui/screens/survey.js';
import { homeScreen, historyScreen, detailScreen } from './ui/screens/records.js';
import { shareScreen } from './ui/screens/share.js';
import { beansScreen, beanFormScreen } from './ui/screens/beans.js';
import { settingsScreen, applyDisplaySettings } from './ui/screens/settings.js';
import { recipesScreen } from './ui/screens/recipes.js';

const ROUTES = [
  [/^#?\/?$/, homeScreen],
  [/^#\/prep$/, prepScreen],
  [/^#\/timer$/, timerScreen],
  [/^#\/brew\/([^/]+)$/, detailScreen],
  [/^#\/brew\/([^/]+)\/result$/, resultScreen],
  [/^#\/brew\/([^/]+)\/survey$/, surveyScreen],
  [/^#\/brew\/([^/]+)\/share$/, shareScreen],
  [/^#\/history$/, historyScreen],
  [/^#\/beans$/, beansScreen],
  [/^#\/bean\/([^/]+)$/, beanFormScreen],
  [/^#\/settings$/, settingsScreen],
  [/^#\/recipes$/, recipesScreen],
];

// 아래 탭: 아이콘만 보이고(사용자 요청 9/24) 이름은 화면 읽기 프로그램용으로 숨겨 둔다
const NAV = [
  ['#/', '홈', 'home'],
  ['#/history', '기록', 'history'],
  ['#/beans', '원두', 'bean'],
  ['#/settings', '설정', 'settings'],
];

const root = document.getElementById('app');
let cleanup = null;

function nav(current) {
  return h(
    'nav',
    { class: 'nav', 'aria-label': '메뉴' },
    ...NAV.map(([href, label, name]) => {
      const on = current === href || (href !== '#/' && current.startsWith(href));
      return h('a', { href, class: on ? 'on' : '', title: label, 'aria-current': on ? 'page' : null }, icon(name), h('span', { class: 'sr-only' }, label));
    }),
  );
}

function render() {
  cleanup?.();
  cleanup = null;
  const hash = location.hash || '#/';
  for (const [re, screen] of ROUTES) {
    const m = hash.match(re);
    if (!m) continue;
    const out = screen(...m.slice(1).map(decodeURIComponent));
    const node = out instanceof Node ? out : out.node;
    cleanup = out instanceof Node ? null : out.cleanup ?? null;
    const hideNav = !(out instanceof Node) && out.hideNav;
    applyDisplaySettings();
    // 탭을 숨기는 화면은 null 을 넘긴다 — fill() 이 빈 자리를 거른다
    fill(root, node, hideNav ? null : nav(hash));
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}

// 처리되지 않은 오류는 로그에 남긴다(어디서 났는지와 함께)
window.addEventListener('error', (e) => logEvent('error', { message: e.message, where: `${e.filename?.split('/').pop()}:${e.lineno}` }));
window.addEventListener('unhandledrejection', (e) => logEvent('error', { message: String(e.reason?.message ?? e.reason), where: 'promise' }));

// 로그인하면 이 기기에 쌓인 기록을 계정으로 옮길지 계정마다 한 번만 묻는다(설정에서 언제든 다시 옮길 수 있다)
async function offerMigration(uid, cloud) {
  const flag = `nb.migrationAsked.${uid}`;
  if (localStorage.getItem(flag)) return null;
  localStorage.setItem(flag, '1');
  const local = await createLocalAdapter().loadAll();
  const n = local.brews.length + local.beans.length + local.grinders.length + local.servers.length;
  if (!n) return null;
  if (!window.confirm(`이 기기에 저장된 기록 ${local.brews.length}건·원두 ${local.beans.length}건·그라인더 ${local.grinders.length}건·서버 ${local.servers.length}건을 로그인한 계정으로 옮길까요?`)) return null;
  return copyAll(createLocalAdapter(), cloud);
}

// 마지막으로 로그인한 계정(이메일) — 새로 고침 직후 「계정 확인 중」 표시에만 쓴다. 로그아웃하면 지운다.
const LAST_ACCOUNT_KEY = 'nb.lastAccount';
function readLastAccount() {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}
function rememberAccount(email) {
  try {
    if (email) localStorage.setItem(LAST_ACCOUNT_KEY, email);
    else localStorage.removeItem(LAST_ACCOUNT_KEY);
  } catch {
    /* 저장소가 막혀도 표시만 달라질 뿐이다 */
  }
}

async function boot() {
  await store.use(createLocalAdapter(), { user: null });
  logEvent('app.start', { version: APP_VERSION, mode: 'local', online: navigator.onLine, firebase: firebaseEnabled() });

  const active = loadActive();
  // 'ended' = [종료]를 누르고 되돌리기 시간 안에 새로고침된 경우 — 타이머 화면이 바로 저장한다
  if (active?.state?.status === 'running' || active?.state?.status === 'ended') {
    logEvent('brew.resume', { stepIndex: active.state.stepIndex, elapsedSec: Math.round((Date.now() - active.state.startedAt) / 1000) }, { brewId: active.brewId });
    location.hash = '#/timer';
  }

  // 직전에 로그인해 있었으면, 계정 확인이 끝날 때까지 「로그인하지 않아…」 대신 「계정 확인 중」을 보인다(9/24)
  store.pendingAccount = firebaseEnabled() ? readLastAccount() : null;

  window.addEventListener('hashchange', render);
  render();

  if (firebaseEnabled()) {
    try {
      await watchAuth(async (user) => {
        store.pendingAccount = null;
        rememberAccount(user?.email ?? null);
        if (user) {
          const cloud = await createCloudAdapter(user.uid);
          const moved = await offerMigration(user.uid, cloud);
          await store.use(cloud, { user: { uid: user.uid, email: user.email } });
          // readyMs = 페이지를 연 뒤 계정 데이터로 바뀐 순간(ms) — 로그인 판정이 느리다는 문제(9/24)의 전후 비교용
          logEvent('auth.signin', { uid: user.uid.slice(0, 6), readyMs: Math.round(performance.now()) });
          if (moved) logEvent('migrate', moved);
        } else if (store.mode === 'cloud') {
          await store.use(createLocalAdapter(), { user: null });
          logEvent('auth.signout');
        }
        // 타이머가 도는 중이면 화면을 새로 그리지 않는다(진행 중 추출은 기기 저장이라 영향 없음)
        if (location.hash !== '#/timer') render();
      });
    } catch (e) {
      logEvent('error', { message: `Firebase를 불러오지 못함: ${e.message}`, where: 'boot' });
      // 확인 중 표시가 남아 있지 않게 푼다
      if (store.pendingAccount) {
        store.pendingAccount = null;
        render();
      }
    }
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch((e) => logEvent('error', { message: `서비스 워커 등록 실패: ${e.message}`, where: 'sw' }));
  }
}

boot();
