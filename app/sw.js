// 서비스 워커 — 오프라인에서도 앱이 열리게 한다.
// - 앱 파일: 네트워크 우선(온라인이면 늘 최신 코드), 끊기면 저장해 둔 사본
// - Firebase SDK(gstatic): 버전이 주소에 박혀 있어 바뀌지 않으므로 저장본 우선
// - Firebase 데이터 통신(googleapis)은 건드리지 않는다(Firestore 가 자체 오프라인 캐시를 가진다)
// 앱 파일을 추가하면 SHELL 에도 넣는다 — tests/sw.test.mjs 가 빠진 것을 잡는다.

const CACHE = 'nextbrew-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './js/main.js',
  './js/config.js',
  './js/core/schema.js',
  './js/core/recipe.js',
  './js/core/timer.js',
  './js/core/diff.js',
  './js/core/log.js',
  './js/core/store.js',
  './js/core/export.js',
  './js/core/suggest.js',
  './js/core/facts.js',
  './js/core/share.js',
  './js/core/words.js',
  './js/core/compass.js',
  './js/core/chart.js',
  './js/core/recipeImport.js',
  './js/core/looseJson.js',
  './js/core/adviceImport.js',
  './js/core/recipeBook.js',
  './js/data/presets.js',
  './js/platform/firebase.js',
  './js/platform/wakelock.js',
  './js/ui/dom.js',
  './js/ui/charts.js',
  './js/ui/icons.js',
  './js/ui/tabSlide.js',
  './js/ui/tabSwipe.js',
  './js/ui/screens/brew.js',
  './js/ui/screens/survey.js',
  './js/ui/screens/records.js',
  './js/ui/screens/beans.js',
  './js/ui/screens/settings.js',
  './js/ui/screens/share.js',
  './js/ui/screens/recipes.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('nextbrew-') && k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

function saveCopy(req, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => saveCopy(e.request, res))
        .catch(() => caches.match(e.request).then((r) => r ?? caches.match('./index.html'))),
    );
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(e.request).then((r) => r ?? fetch(e.request).then((res) => saveCopy(e.request, res))));
  }
});
