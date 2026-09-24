// Firebase 연결 — 로그인(구글, 팝업 방식)과 Firestore 어댑터.
// - 빌드 없이 CDN 모듈을 쓴다: https://www.gstatic.com/firebasejs/<버전>/firebase-*.js
// - 리디렉트 로그인은 github.io 처럼 firebaseapp.com 이 아닌 도메인에서 최신 브라우저가 막으므로 팝업을 쓴다.
// - 오프라인 캐시(persistentLocalCache)를 켠다: 끊긴 동안 쓴 것은 다시 연결되면 자동 반영된다.
//   그래서 쓰기는 서버 응답을 기다리지 않는다(기다리면 오프라인에서 끝나지 않는다). 실패만 로그로 남긴다.
// 데이터 위치: users/{uid}/brews|beans|grinders|logs/{id}, users/{uid}/meta/settings

import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from '../config.js';
import { logEvent } from '../core/log.js';
import { COLLECTIONS } from '../core/store.js';

let fb = null;

export function firebaseEnabled() {
  return Boolean(FIREBASE_CONFIG);
}

async function load() {
  if (fb) return fb;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [appMod, authMod, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  fb = { app, db, auth: authMod.getAuth(app), authMod, fs };
  return fb;
}

export async function watchAuth(callback) {
  const f = await load();
  return f.authMod.onAuthStateChanged(f.auth, callback);
}

export async function signIn() {
  const f = await load();
  try {
    await f.authMod.signInWithPopup(f.auth, new f.authMod.GoogleAuthProvider());
  } catch (e) {
    logEvent('auth.error', { code: e.code ?? null, message: e.message });
    throw e;
  }
}

export async function signOutUser() {
  const f = await load();
  await f.authMod.signOut(f.auth);
}

export async function createCloudAdapter(uid) {
  const f = await load();
  const { fs, db } = f;
  const col = (name) => fs.collection(db, 'users', uid, name);
  const ref = (name, id) => fs.doc(db, 'users', uid, name, id);
  const settingsRef = fs.doc(db, 'users', uid, 'meta', 'settings');
  const fail = (op) => (e) => logEvent('sync.error', { op, code: e.code ?? null, message: e.message });

  return {
    kind: 'cloud',
    uid,
    // 모음 네 개와 설정을 «동시에» 읽는다. 하나씩 차례로 읽으면 새로 고침 뒤 계정 데이터로 바뀌기까지
    // 2.45~2.66초 걸렸다(9/24 실측, auth.signin readyMs) — 로그인 판정이 느리다는 문제의 주원인.
    async loadAll() {
      const [snaps, s] = await Promise.all([Promise.all(COLLECTIONS.map((c) => fs.getDocs(col(c)))), fs.getDoc(settingsRef)]);
      const out = {};
      COLLECTIONS.forEach((c, i) => (out[c] = snaps[i].docs.map((d) => d.data())));
      out.settings = s.exists() ? s.data() : {};
      return out;
    },
    put(c, doc) {
      fs.setDoc(ref(c, doc.id), doc).catch(fail(`put ${c}`));
    },
    remove(c, id) {
      fs.deleteDoc(ref(c, id)).catch(fail(`remove ${c}`));
    },
    putSettings(s) {
      fs.setDoc(settingsRef, s).catch(fail('settings'));
    },
    appendLog(entry) {
      const id = `${entry.t}_${Math.random().toString(36).slice(2, 7)}`;
      // 로그 쓰기 실패를 다시 로그로 쓰면 되풀이되므로 콘솔에만 남긴다
      fs.setDoc(ref('logs', id), entry).catch((e) => console.error('[firebase] 로그 쓰기 실패', e));
    },
    async loadLogs() {
      const snap = await fs.getDocs(fs.query(col('logs'), fs.orderBy('t')));
      return snap.docs.map((d) => d.data());
    },
  };
}
