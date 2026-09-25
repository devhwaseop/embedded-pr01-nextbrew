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
import { slideTabs, reducedMotion, SLIDE_MS, EASING } from './ui/tabSlide.js';
import { enableTabSwipe } from './ui/tabSwipe.js';

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
let lastHash = null; // 화면 전환의 종류·방향을 정하려고(ui/tabSlide.js · 아래 transitionKind)
let swipedTo = null; // 끌어 넘긴 탭 번호 — 이미 손가락으로 넘겼으니 슬라이드를 다시 하지 않는다

// 아래 탭 번호(탭 첫 화면만 — 슬라이드·끌어 넘기기). 원두 탭 안의 레시피 칸도 원두 탭이다(9/25)
function tabIndexOf(hash) {
  return hash === '#/recipes' ? 2 : NAV.findIndex(([href]) => href === hash);
}
// 탭 막대에서 켤 탭: 탭 첫 화면 + 원두 등록·수정 화면(원두 탭)
function navIndexOf(hash) {
  const i = tabIndexOf(hash);
  return i >= 0 ? i : hash.startsWith('#/bean/') ? 2 : -1;
}
// 원두 탭 안 [원두 | 레시피] 칸 — 옮길 때 탭처럼 한 칸 넘긴다
const SEGMENTS = ['#/beans', '#/recipes'];

// 화면 전환 두 가지(9/25 사용자 결정 — 시각 요소). View Transitions API(크롬 111·Safari 18·Firefox 144 이상)로, 없으면 그냥 바뀐다.
// ① 준비 → 타이머 → 결과 → 설문: 앞으로 가면 새 화면이 다가오고 뒤로 가면 물러난다(Material 「shared axis Z」)
// ② 기록 목록의 한 줄 → 그 기록: 줄이 커지며 상세 화면이 된다(Material 「container transform」). 상세 → 목록은 반대
const FLOW = [/^#\/prep$/, /^#\/timer$/, /^#\/brew\/[^/]+\/result$/, /^#\/brew\/[^/]+\/survey$/];
const flowRank = (hash) => FLOW.findIndex((re) => re.test(hash ?? ''));
const LISTS = ['#/', '#/history'];
const detailId = (hash) => hash?.match(/^#\/brew\/([^/]+)$/)?.[1] ?? null;
function transitionKind(from, to) {
  const a = flowRank(from);
  const b = flowRank(to);
  if (a >= 0 && b >= 0 && a !== b) return b > a ? 'z-forward' : 'z-back';
  if (LISTS.includes(from) && detailId(to)) return 'expand';
  if (detailId(from) && LISTS.includes(to)) return 'collapse';
  return null;
}
const rowFor = (id) => (id ? root.querySelector(`a.list-row[href="#/brew/${CSS.escape(id)}"]`) : null);
const screenOf = () => root.querySelector(':scope > .screen');

// 타이머 화면(탭을 숨기는 화면)에서는 스크롤·확대를 막는다(사용자 요청 9/25).
// 안드로이드 크롬은 viewport 의 user-scalable=no 를 따른다. iOS Safari 는 접근성 때문에 이 값을 무시하므로
// 두 손가락 제스처(gesturestart)를 막고, CSS(.timer touch-action: none)를 함께 쓴다. 다른 화면으로 나가면 되돌린다.
const VIEWPORT = document.querySelector('meta[name="viewport"]');
const VIEWPORT_BASE = VIEWPORT?.content ?? '';
function setTimerMode(on) {
  document.body.classList.toggle('timer-mode', on);
  if (VIEWPORT) VIEWPORT.content = on ? `${VIEWPORT_BASE}, maximum-scale=1, user-scalable=no` : VIEWPORT_BASE;
}
document.addEventListener('gesturestart', (e) => document.body.classList.contains('timer-mode') && e.preventDefault());

function screenNode(hash) {
  for (const [re, screen] of ROUTES) {
    const m = hash.match(re);
    if (!m) continue;
    const out = screen(...m.slice(1).map(decodeURIComponent));
    return out instanceof Node ? out : out.node;
  }
  return null;
}

// 탭 막대: 켜진 탭 위의 막대가 이전 탭에서 새 탭으로 미끄러져 간다(9/25 — 시각 요소 「탭 표시 막대 이동」).
// 끌어 넘기는 동안에는 손가락을 따라 움직인다(moveInd — ui/tabSwipe.js 의 onDrag).
let navInd = null;
function moveInd(pos, ms = 0) {
  if (!navInd) return;
  navInd.style.transition = ms ? `transform ${ms}ms ${EASING}` : 'none';
  navInd.style.transform = `translateX(${pos * 100}%)`;
}
function nav(current, fromIdx = -1) {
  const on = navIndexOf(current);
  const start = fromIdx >= 0 && on >= 0 ? fromIdx : on;
  navInd = h('span', { class: `nav-ind${on < 0 ? ' hidden' : ''}`, 'aria-hidden': 'true', style: `width:${100 / NAV.length}%;transform:translateX(${Math.max(0, start) * 100}%)` });
  if (on >= 0 && start !== on && !reducedMotion()) {
    const ms = SLIDE_MS[Math.abs(on - start)] ?? 400;
    requestAnimationFrame(() => requestAnimationFrame(() => moveInd(on, ms)));
  }
  return h(
    'nav',
    { class: 'nav', 'aria-label': '메뉴' },
    navInd,
    ...NAV.map(([href, label, name], i) => h('a', { href, class: i === on ? 'on' : '', title: label, 'aria-current': i === on ? 'page' : null }, icon(name), h('span', { class: 'sr-only' }, label))),
  );
}

const swipe = enableTabSwipe({
  tabIndexOf,
  count: NAV.length,
  renderAt: (t) => screenNode(NAV[t][0]),
  go: (t) => {
    swipedTo = t;
    location.hash = NAV[t][0];
  },
  onDrag: moveInd,
});

function render() {
  const hash = location.hash || '#/';
  const from = lastHash;
  lastHash = hash;
  const kind = from && swipedTo == null ? transitionKind(from, hash) : null;
  const expandRow = kind === 'expand' ? rowFor(detailId(hash)) : null;
  if (!kind || !document.startViewTransition || reducedMotion() || (kind === 'expand' && !expandRow)) return swap(hash, from);
  // 전환 앞뒤로 같은 이름(brew-card)을 붙인 두 요소를 브라우저가 이어 준다: 목록의 줄 ↔ 상세 화면
  // 상세 화면은 화면보다 훨씬 길어서 그대로 이으면 화면 밖으로 커져 버린다 → 전환하는 동안만 보이는 높이로 자른다(9/25 실측)
  const named = [];
  const name = (el, clipPx = null) => {
    if (!el) return;
    el.style.viewTransitionName = 'brew-card';
    if (clipPx != null) {
      el.style.maxHeight = `${clipPx}px`;
      el.style.overflow = 'hidden';
    }
    named.push(el);
  };
  const unname = () =>
    named.splice(0).forEach((el) => {
      el.style.viewTransitionName = '';
      el.style.maxHeight = '';
      el.style.overflow = '';
    });
  // 상세 → 목록: 스크롤한 만큼 위가 가려져 있으니 보이는 아래 끝까지만
  name(kind === 'expand' ? expandRow : kind === 'collapse' ? screenOf() : null, kind === 'collapse' ? window.scrollY + window.innerHeight : null);
  document.documentElement.dataset.vt = kind;
  const t = document.startViewTransition(() => {
    unname();
    swap(hash, from);
    name(kind === 'expand' ? screenOf() : kind === 'collapse' ? rowFor(detailId(from)) : null, kind === 'expand' ? window.innerHeight : null);
  });
  t.finished.finally(() => {
    delete document.documentElement.dataset.vt;
    unname();
  });
}

function swap(hash, from) {
  cleanup?.();
  cleanup = null;
  for (const [re, screen] of ROUTES) {
    const m = hash.match(re);
    if (!m) continue;
    const out = screen(...m.slice(1).map(decodeURIComponent));
    const node = out instanceof Node ? out : out.node;
    cleanup = out instanceof Node ? null : out.cleanup ?? null;
    const hideNav = !(out instanceof Node) && out.hideNav;
    applyDisplaySettings();
    setTimerMode(Boolean(hideNav));
    const ti = tabIndexOf(hash);
    // 끌어 넘기기를 받는 화면: 페이지 전체(html)에 걸어야 내용이 짧아 빈 곳에서 시작한 끌기도 브라우저가 가져가지 않는다(9/25 실측)
    document.documentElement.classList.toggle('tab-root', ti >= 0);
    const oldNode = screenOf();
    const oldScrollY = window.scrollY;
    const swiped = swipedTo;
    swipedTo = null;
    // 탭을 숨기는 화면은 null 을 넘긴다 — fill() 이 빈 자리를 거른다
    fill(root, node, hideNav ? null : nav(hash, swiped != null ? -1 : navIndexOf(from ?? '')));
    window.scrollTo(0, 0);
    swipe.clearSwipe();
    if (swiped != null) return; // 끌어 넘겼으면 이미 옆으로 넘어온 상태다
    // 아래 탭끼리, 또는 원두 탭 안 [원두 | 레시피] 사이를 옮길 때 옆으로 넘긴다(사용자 요청 9/25)
    const fi = tabIndexOf(from ?? '');
    if (fi >= 0 && ti >= 0 && fi !== ti) slideTabs({ i: fi, j: ti, oldNode, oldScrollY, newNode: node, renderAt: (t) => screenNode(NAV[t][0]) });
    else if (SEGMENTS.includes(from) && SEGMENTS.includes(hash) && from !== hash) {
      slideTabs({ i: SEGMENTS.indexOf(from), j: SEGMENTS.indexOf(hash), oldNode, oldScrollY, newNode: node, renderAt: (t) => screenNode(SEGMENTS[t]) });
    }
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
