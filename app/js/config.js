// 앱 설정
//
// FIREBASE_CONFIG: Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)에 나오는 firebaseConfig 객체를 그대로 붙여넣는다.
// 이 값은 비밀이 아니다(데이터는 Firestore 보안 규칙이 지킨다 — 저장소의 firestore.rules).
// null 이면 로그인 없이 이 기기에만 저장한다.
// measurementId 는 콘솔 값을 그대로 옮긴 것일 뿐, 애널리틱스는 켜지 않는다(쓰기로 정한 적 없음).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCOHKgx5iH8nIpNAenBx9pzwndNgyMGfk0',
  authDomain: 'embedded-pr01-nextbrew.firebaseapp.com',
  projectId: 'embedded-pr01-nextbrew',
  storageBucket: 'embedded-pr01-nextbrew.firebasestorage.app',
  messagingSenderId: '260791879093',
  appId: '1:260791879093:web:a73d64ec535288af27c5fc',
  measurementId: 'G-DN0RQT00B3',
};

export const FIREBASE_SDK_VERSION = '12.19.0';

export const APP_VERSION = '0.2.0-dev';
