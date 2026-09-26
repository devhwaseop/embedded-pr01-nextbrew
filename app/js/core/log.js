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
  'brew.start': '추출 시작(타이머 화면의 [시작]) — data: { recipeId, doseG, hotWaterG, iceG(넣은 얼음), iceTargetG(추천 얼음), dripper, ratio(원두와 물의 비율 1:x 의 x), customRatio(레시피 비율과 다르게 정했으면 true), readySec(준비 화면에서 넘어온 뒤 [시작]까지 초), via(button|ring — 아래 버튼·원 전체, 9/25) }',
  'brew.readyBack': '타이머 대기 화면에서 시작 전에 [뒤로] — data: { waitedSec }',
  'brew.step': '단계 전환 — data: { from, to, plannedSec(원문 목표), actualSec, deltaSec, verdict(ok|early|late), via(button|ring|stillAsk), backdated(방치 확인에서 레시피 시각으로 고침), pressedLateSec(그때 늦은 초) }',
  'brew.end': '종료(되돌리기 시간이 지나 저장 직전) — data: { totalSec, plannedTotalSec, deltaSec, verdict, via(button|ring, 9/25 전 기록은 null) }',
  'brew.undo': '되돌리기 — data: { what(step|end), from(되돌리기 전 단계), to(돌아간 단계), afterSec(누른 뒤 몇 초 만에) }',
  'brew.pressAbort': '버튼·원을 누른 채 밖으로 밀어 실행하지 않음 — data: { button(start|next|end), via(button|ring), stepIndex }',
  'brew.stillAsk': '방치 확인을 띄움 — data: { stepIndex, stepLabel, overSec(목표를 넘긴 초) }',
  'brew.stillHere': '방치 확인에 [계속 추출] — data: { stepIndex, answeredAfterSec(뜬 뒤 몇 초 만에) }',
  'brew.abandon': '답이 없어 기록 없이 끝냄 — data: { stepIndex, stepLabel, askAtSec, stopAtSec, lastPressSec, openedLateSec(다시 열었을 때 한도를 넘긴 초, 화면이 켜져 있었으면 0) }',
  'brew.cancel': '취소(기록 저장 안 함) — data: { recipeId, stepIndex, stepLabel, elapsedSec, via(timer|stillAsk) }',
  'brew.resume': '새로고침 뒤 진행 중 추출 이어받음 — data: { stepIndex, elapsedSec }',
  'brew.saved': '기록 저장 — data: { where(local|cloud) }',
  'result.update': '결과 보정 — data: { field, value, linked(무게 칸 연동으로 함께 바뀐 칸, 9/26) }',
  'survey.save': '테이스팅 노트(맛 설문) 저장 — data: { answered, skipped, share(bool), notesPrefilled(지난 노트에서 채운 수), notesPrefillKept(그대로 저장한 수) }',
  'bean.save': '원두 저장 — data: { beanId, name, nameAuto(이름 자동 조합), bags(봉투 수 — 9/26 B안, 전에는 status·totalG), consumed(봉투가 모두 소비됨), remainingG(남은 원두 추정 g, 봉투 합), kind(single|roaster|me), parts(블렌드 구성 수) }',
  'blend.save': '블렌드 템플릿 저장(9/26 — 추출할 때 섞는 비율) — data: { blendId, name, parts[{ beanId, ratio }] }',
  'blend.delete': '블렌드 템플릿 삭제 — data: { blendId, name, brews(이 템플릿으로 섞은 기록 수 — 기록은 남는다) }',
  'bag.state': '원두 봉투 상태 바꿈(9/26 B안 — 알림·목록에서 바로) — data: { bagId, beanId, from, to(inUse|inUseFrozen|stored|frozen|consumed), remainingG, via(home|list|form|prep) }',
  'bag.save': '원두 봉투 저장(원두 [저장] 때 바뀐 봉투만) — data: { bagId, beanId, state, from(전 상태, 새 봉투면 null), amountG, roastedOn, freezes(냉동 기간 수) }',
  'bag.delete': '원두 봉투 지움(그 봉투로 내린 기록이 없을 때만) — data: { bagId, beanId }',
  'bag.open': '보관 중인 봉투로 추출을 저장해 사용 중으로 바꿈(9/26) — data: { bagId, beanId, from(stored|frozen), to(inUse|inUseFrozen) }',
  'bean.aiBulk': 'AI 로 여러 원두 한꺼번에 등록(9/26) — data: { via, answered(답의 원두 수), picked, newBeans, addedBags(봉투 수), failed(검사에 걸린 원두 수) }',
  'bean.aiBulkFail': '여러 원두 등록 답 읽기 실패 — data: { stage(read), via, message }',
  'bean.status': '원두 상태 바꿈(사용 중 ↔ 소모) — data: { beanId, status, remainingG(그때 남은 원두 추정 g), via(home|list|form) }',
  'server.save': '서버 저장 — data: { serverId, name, tareG }',
  'server.delete': '서버 지움(9/27 — 쓴 기록은 이름·자체 무게를 기록에 고정) — data: { serverId, name, tareG, brews(고정한 기록 ID 목록) }',
  'server.deleteCancel': '서버 지우기 확인에서 [닫기] — data: { serverId, brews(쓴 기록 수) }',
  'brew.delete': '추출 기록 지움(9/27 사용자 요청 — 되돌릴 수 없음, 이 로그가 남는 기록) — data: { via(list|detail), deleted[{ id, startedAt, recipe, bean, beanId, bagId, doseG, dripper, survey(설문 있었나), inactive }] }',
  'brew.deleteCancel': '추출 기록 지우기 확인에서 [닫기] — data: { ids, via }',
  'brew.inactive': '추출 기록 비활성화·다시 활성화(9/27 — 비교·제안에서 빼기) — data: { ids, on(true = 비활성화), reason(INACTIVE_REASONS 키|null), note, via(list|detail), skipped(이미 그 상태라 건너뛴 수) }',
  'gear.inactive': '드리퍼·그라인더·서버·분쇄 측정·블렌드 템플릿 비활성화·다시 활성화(9/27) — data: { col(drippers|grinders|servers|measurements|blends), id, name, on(true = 비활성화), via }',
  'recipe.reorder': '레시피 목록 순서 바꿈(9/27 — [순서 바꾸기]를 마칠 때 한 번) — data: { order(ID 목록), moves(옮긴 횟수) }',
  'hint.save': '단계 설명 직접 쓰기 — data: { recipeId, index, cleared(bool) }',
  'share.build': 'AI 공유 묶음 만들기 — data: { format, scope(with|single|selected), brews(담은 건수), compare(고른 비교 역할 — 9/26, 전에는 previous·sameRecipeAndBean bool), found(찾은 역할) }',
  'share.compareDefault': '설정에서 기본 비교 기록을 바꿈(9/26) — data: { compare(previous|sameBean|sameRecipe|sameRecipeAndBean 목록) }',
  'share.selectStart': '기록 목록 고르기 모드 시작(9/26) — data: { via(longpress|contextmenu), total(목록 건수) }',
  'share.selectCancel': '고르기 모드 취소 — data: { count(그때 고른 건수) }',
  'share.done': 'AI 공유 — data: { format, method(file|text|download) }',
  'share.fail': 'AI 공유 실패·취소 — data: { format, method, name, message }',
  'share.promptCopy': 'AI 공유 프롬프트 복사 — data: { custom(고친 글이면 true), via(icon|button), ok(클립보드에 들어갔나) }',
  'share.promptEdit': 'AI 공유 프롬프트 고쳐 저장·기본으로 되돌림 — data: { custom, length }',
  'recipe.import': '레시피 가져오기 저장 — data: { recipeId, name, steps, warnings(경고 수), uncertain(AI 가 애매하다고 적은 수), via(paste|file) }',
  'recipe.importFail': '레시피 가져오기 실패 — data: { stage(parse|validate), errors(앞 5개), via }',
  'recipe.edit': '가져온 레시피 고쳐 저장 — data: { recipeId, name, steps, warnings, uncertain, via(edit) }',
  'recipe.delete': '가져온 레시피 삭제 — data: { recipeId, name }',
  'grinder.save': '그라인더 저장 — data: { grinderId, name, zeroOffset, umPerClick }',
  'data.upgrade': '옛 형식 올리기·등록 항목 따라가기(9/26 — core/migrate.js) — data: { via(load|import), steps{ bean.nameAuto·bean.roastLevel(옛 단어→숫자)·dripper.seed·dripper.fromRecord·dripper.catalog(이름만 있던 앱 기본 드리퍼를 기본 목록과 이음)·brew.endState·brew.dripperLink·ref.bean·ref.grinder·ref.server·ref.dripper·ref.blend(템플릿 이름)·ref.blendPart(기록의 원두별 이름)·ref.templatePart·ref.mixPart(블렌드 구성 이름)·dripper.merge(같은 드리퍼 합침 — 남긴 쪽)·brew.dripperMerge(합친 드리퍼를 가리키던 기록 옮김)·brew.dripperRelink(지워진 드리퍼를 가리키던 기록을 같은 이름 드리퍼로): 건수 }, docs{ 컬렉션: 다시 쓴 문서 수 }, removed{ 컬렉션: [합쳐서 없앤 id] } }',
  'ref.follow': '등록 항목(원두·그라인더·서버·드리퍼·블렌드 템플릿)을 고쳐 그것을 가리키는 기록을 따라 바꿈(포인터, 9/26) — data: { col, id, name, brews(바뀐 기록 수), blendParts(구성 이름이 바뀐 템플릿·섞은 블렌드 수) }',
  'prep.measureApply': '추출 준비에서 이 원두의 분쇄 측정대로 맞춤(9/26) — data: { measurementId, beanId, dial{from,to} }',
  'dripper.save': '드리퍼 저장(9/26 신설) — data: { dripperId, name, renamedFrom(이름을 고쳤으면 옛 이름), catalogKey(기본 목록에서 왔으면), filled(값이 있는 칸), edited(기본 목록 값에서 손으로 바꾼 칸), via(form|prep — 준비 화면에서 기본 목록을 골라 바로 등록) }',
  'dripper.delete': '드리퍼 지움(9/26 — 가리키던 기록도 함께) — data: { dripperId, name, brews(함께 지운 기록 수), deleted[{ id, startedAt, recipe, bean }] }',
  'dripper.deleteCancel': '드리퍼 지우기 경고에서 [닫기] — data: { dripperId, brews(지웠다면 함께 지워졌을 기록 수) }',
  'dripper.catalogPick': '드리퍼 등록 화면에서 기본 목록을 고름(저장 전) — data: { dripperId, key, size }',
  'dripper.aiPromptCopy': '드리퍼 특징 AI 프롬프트 복사(9/26) — data: { dripperId, ok }',
  'dripper.aiImport': '드리퍼 특징(AI 답)으로 칸 채움(저장 전) — data: { dripperId, via(paste|file), fields, skipped, sources(AI 가 댄 출처 수), uncertain, warnings }',
  'dripper.aiImportFail': '드리퍼 특징 가져오기 실패 — data: { dripperId, stage(read|check), via, message | errors }',
  'bean.copyFrom': '새 원두 등록에서 이전 원두 내용을 가져옴(9/26) — data: { fromId, fromName, fields(값이 있던 칸) } · 구매 무게·날짜·상태·메모는 옮기지 않음',
  'bean.aiPromptCopy': '로스터리 설명 가져오기 프롬프트 복사(9/26) — data: { beanId, ok }',
  'bean.aiImport': '로스터리 설명(AI 답)으로 원두 칸 채움(저장 전) — data: { beanId, via(paste|file), fields(채운 칸), skipped(안 채운 칸), uncertain, warnings, fixes }',
  'bean.aiImportFail': '로스터리 설명 가져오기 실패 — data: { beanId, stage(read|check), via, message | errors }',
  'prep.decafAssist': '추출 준비 디카페인 보조 단추(9/26) — data: { action(grind|dose), from, to, clicks, umPerClick }',
  'grind.measureImport': '분쇄 측정 넣음(9/26 — 언스페셜티 CSV·사진) — data: { via(prep|result), kind(csv|photo), fileName, machine, click, clickMeaning(zero=영점 반영값|dial=그라인더 표시값), dial(그라인더 표시값), zeroOffset, machineMismatch, meanUm, sdUm, source, edited(인식값에서 사용자가 고친 칸 — 사진 인식률의 근거), ocr{ ms, cards, sure(칸별 두 번 읽어 같았나), readWidth(다시 읽은 폭) }, photoKept(계정 저장일 때만), photoBytes, bins }',
  'grind.measureImportFail': '분쇄 측정 읽기 실패 — data: { kind(csv|photo), stage(parse|ocr), errors | message, fileName, via }',
  'grind.photoRejected': '올린 사진이 분쇄 측정 사진이 아닌 것 같아 물음(9/26) — data: { reasons(까닭), cards(찾은 글 카드 수), values(읽은 평균·클릭 수), choice(retry|manual|cancel), fileName, via }',
  'grind.measureCancel': '분쇄 측정 가져오기 도중 취소 — data: { kind, stage(confirm|click), via }',
  'advice.follow': 'AI 제안대로 맞춘 추출을 저장(9/26 — 기록에 따른 제안을 남김) — data: { fromBrewId, applied(맞춘 칸), adjusted[{ key, applied, actual }](맞춘 뒤 손으로 바꾼 칸) }',
  'advice.apply': '준비 화면에서 지난 추출 제안대로 맞춤 — data: { source(compass|ai, 9/25 전 기록은 없음 = compass), fromBrewId, grindUm, clicks, doseDeltaG, dial{from,to}, doseG{from,to}, waterG, tempC{from,to}(ai), dialSkipped(ai: 그라인더가 달라 다이얼을 안 바꿈) }',
  'aiAdvice.import': 'AI 제안(JSON) 기록에 저장 — data: { changes(바꾸는 것 수), next(값이 있는 칸), warnings, confidence, via(paste|file), where(record|share — 9/26 어디서 넣었나), routed(brewId = 답의 기록 ID 로 찾음 | fallback = 못 찾아 그 화면의 기록에), replaced(전에 넣은 제안을 바꿨나) } · brewId = 넣은 기록',
  'aiAdvice.importFail': 'AI 제안 가져오기 실패 — data: { stage(parse|route(넣을 기록 없음)|validate), errors(앞 5개), via, where }',
  'aiAdvice.delete': 'AI 제안 지움 — data: { importedAt }',
  'aiAdvice.promptCopy': '결과 받기 프롬프트 복사 — data: { ok(클립보드에 들어갔나) }',
  'export': '내보내기 — data: { brews, beans, grinders, servers, recipes, drippers, measurements, blends, logs(포함했으면 줄 수) }',
  'import': '가져오기 — data: { added, skipped(이미 있던 것) }',
  'migrate': '이 기기 기록을 계정으로 옮김 — data: { brews, beans, grinders, servers, recipes, logs(새로 옮긴 줄), logsSkipped(이미 있던 줄), via(banner|설정 버튼이면 없음) }',
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
