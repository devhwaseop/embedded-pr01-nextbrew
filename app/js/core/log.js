// NextBrew 사건 로그
//
// ── 무엇을 위한 로그인가 ──────────────────────────────────────
// 「무슨 일이 왜 일어났는지」를 나중에 복원하기 위한 기록이다. 디버깅과, 보고서 부록의 사용 기록에 쓴다.
//
// ── 규칙 ─────────────────────────────────────────────────────
// 1. 사건이 생길 때만 한 줄 적는다. 그 순간의 시각(t: epoch ms, at: ISO)을 찍고 시간순으로 쌓는다.
//    매초 틱·아무 일 없는 상태 확인·화면 그리기는 적지 않는다.
// 2. 결과만 적지 않고, 그 판단을 재현할 수 있는 값을 함께 적는다.
//    예) 취소: 몇 번째 단계에서, 시작 후 몇 초에 / 단계 전환: 원문 목표 시각과 실제 시각의 차이
// 3. 취소한 추출은 기록(brew)으로 저장하지 않는다. 그 대신 이 로그에만 남는다.
// 4. 로그는 지우지 않고 모두 보관한다(부록에 전체 사용 기록이 필요). 내보내기에 넣을지는 설정의
//    「내보내기에 디버그 로그 포함」으로 정한다.
//
// ── 한 줄의 모양 ─────────────────────────────────────────────
// { t, at, ev, brewId?, data }   ev 는 아래 EVENTS 의 키 중 하나
//
// ── 사건 목록 ────────────────────────────────────────────────
export const EVENTS = {
  'app.start': '앱 시작 — data: { version, mode(local|cloud), online }',
  'auth.signin': '로그인(계정 데이터로 전환) — data: { uid 앞 6자, readyMs(페이지를 연 뒤 전환까지 ms) }',
  'auth.signout': '로그아웃',
  'auth.error': '로그인 실패 — data: { code, message }',
  'brew.start': '추출 시작 — data: { recipeId, doseG, hotWaterG, iceG, dripper, ratio(원두와 물의 비율 1:x 의 x), customRatio(레시피 비율과 다르게 정했으면 true) }',
  'brew.step': '단계 전환 — data: { from, to, plannedSec(원문 목표), actualSec, deltaSec, verdict(ok|early|late) }',
  'brew.end': '종료(되돌리기 시간이 지나 저장 직전) — data: { totalSec, plannedTotalSec, deltaSec, verdict }',
  'brew.undo': '되돌리기 — data: { what(step|end), from(되돌리기 전 단계), to(돌아간 단계), afterSec(누른 뒤 몇 초 만에) }',
  'brew.pressAbort': '버튼을 누른 채 밖으로 밀어 실행하지 않음 — data: { button(next|end), stepIndex }',
  'brew.stillAsk': '방치 확인을 띄움 — data: { stepIndex, stepLabel, overSec(목표를 넘긴 초) }',
  'brew.stillHere': '방치 확인에 [계속 추출] — data: { stepIndex, answeredAfterSec(뜬 뒤 몇 초 만에) }',
  'brew.abandon': '답이 없어 기록 없이 끝냄 — data: { stepIndex, stepLabel, askAtSec, stopAtSec, lastPressSec, openedLateSec(다시 열었을 때 한도를 넘긴 초, 화면이 켜져 있었으면 0) }',
  'brew.cancel': '취소(기록 저장 안 함) — data: { recipeId, stepIndex, stepLabel, elapsedSec, via(timer|stillAsk) }',
  'brew.resume': '새로고침 뒤 진행 중 추출 이어받음 — data: { stepIndex, elapsedSec }',
  'brew.saved': '기록 저장 — data: { where(local|cloud) }',
  'result.update': '결과 보정 — data: { field, value }',
  'survey.save': '설문 저장 — data: { answered, skipped, share(bool) }',
  'bean.save': '원두 저장 — data: { beanId, name }',
  'server.save': '서버 저장 — data: { serverId, name, tareG }',
  'hint.save': '단계 설명 직접 쓰기 — data: { recipeId, index, cleared(bool) }',
  'share.build': 'AI 공유 묶음 만들기 — data: { format, brews(담은 건수), previous(bool), sameRecipeAndBean(bool) }',
  'share.done': 'AI 공유 — data: { format, method(file|text|download) }',
  'share.fail': 'AI 공유 실패·취소 — data: { format, method, name, message }',
  'grinder.save': '그라인더 저장 — data: { grinderId, name, zeroOffset, umPerClick }',
  'advice.apply': '준비 화면에서 지난 추출 제안대로 맞춤 — data: { fromBrewId, grindUm, clicks, doseDeltaG, dial{from,to}, doseG{from,to}, waterG }',
  'export': '내보내기 — data: { brews, beans, grinders, servers, logs(포함했으면 줄 수) }',
  'import': '가져오기 — data: { added, skipped(이미 있던 것) }',
  'migrate': '이 기기 기록을 계정으로 옮김 — data: { brews, beans, grinders, servers, logs(새로 옮긴 줄), logsSkipped(이미 있던 줄), via(banner|설정 버튼이면 없음) }',
  'sync.error': '클라우드 쓰기 실패 — data: { op, code, message }',
  'storage.error': '기기 저장 실패 — data: { key, message }',
  'wakelock.fail': '화면 꺼짐 방지 실패 — data: { reason }',
  'error': '처리되지 않은 오류 — data: { message, where }',
};

let sink = null;

// 저장소(core/store.js)가 시작할 때 연결한다. 연결 전 사건은 버리지 않고 모아 두었다가 넘긴다.
const pending = [];
export function setLogSink(fn) {
  sink = fn;
  while (pending.length) sink(pending.shift());
}

export function logEvent(ev, data = {}, { brewId = null, now = Date.now() } = {}) {
  if (!(ev in EVENTS)) console.warn('[log] 목록에 없는 사건:', ev);
  const entry = { t: now, at: new Date(now).toISOString(), ev, ...(brewId ? { brewId } : {}), data };
  if (sink) sink(entry);
  else pending.push(entry);
  return entry;
}
