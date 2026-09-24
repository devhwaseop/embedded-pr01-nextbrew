// 타이머가 도는 동안 화면이 꺼지지 않게 한다(Screen Wake Lock API).
// 탭이 가려지면 브라우저가 잠금을 풀기 때문에, 다시 보일 때 다시 요청한다.
// 지원하지 않거나 거절되면 한 번만 로그에 남긴다(같은 실패를 되풀이해 적지 않는다).

import { logEvent } from '../core/log.js';

let lock = null;
let wanted = false;
let reported = false;

async function acquire() {
  if (!('wakeLock' in navigator)) {
    if (!reported) logEvent('wakelock.fail', { reason: 'unsupported' });
    reported = true;
    return;
  }
  try {
    lock = await navigator.wakeLock.request('screen');
  } catch (e) {
    if (!reported) logEvent('wakelock.fail', { reason: `${e.name}: ${e.message}` });
    reported = true;
  }
}

function onVisible() {
  if (wanted && document.visibilityState === 'visible' && (!lock || lock.released)) acquire();
}

export async function keepAwake() {
  wanted = true;
  document.addEventListener('visibilitychange', onVisible);
  await acquire();
}

export function releaseAwake() {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisible);
  lock?.release().catch(() => {});
  lock = null;
}
