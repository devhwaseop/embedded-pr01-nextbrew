// 홈 · 기록 목록 · 기록 상세 (AI 공유는 share.js)

import { h, fill, section, fmtDateTime, term, toast, googleButton, modal, copyText } from '../dom.js';
import { WORDS } from '../../core/words.js';
import { store, loadActive, localOnlyCounts, copyAll, createLocalAdapter } from '../../core/store.js';
import { logEvent } from '../../core/log.js';
import { n2, formatSec, formatDelta, beanStock, timerOf, SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS } from '../../core/schema.js';
import { lowBeanNotice } from './beans.js';
import { sideBySide } from '../../core/diff.js';
import { firebaseEnabled, signIn } from '../../platform/firebase.js';
import { timerTable, conditionsList, comparisonBlock, ratioChange } from './brew.js';
import { brewFigure, compareFigure, compassFigure } from '../charts.js';
import { measurementOf } from '../../core/grindMeasure.js';
import { measureSummary, measureView } from '../measureImport.js';
import { readCompass, adviseNext, umPerClickFor } from '../../core/compass.js';
import { readAdviceText, validateAdvice, adviceResultPrompt, currentValues, followLines, ADVICE_ITEMS, CONFIDENCE_WORDS } from '../../core/adviceImport.js';

// 기록 한 줄(9/26 사용자 요청): 왼쪽 = 「레시피 · 원두」와 날짜(사이를 조금 띄움), 오른쪽 = 걸린 시간과 설문 상태를 담은 작은 상자.
// 오른쪽 상자는 두 줄 높이의 가운데에 두고 줄바꿈하지 않는다 — 제목이 길어도 「설문 완료」가 두 줄로 깨지지 않게 제목 쪽이 줄어든다.
// 상태 글자는 「설문 완료·설문 대기」(9/26 사용자 요청 — 「노트」만 쓰면 맛의 노트인지 종이 노트인지 애매하다). 화면 이름은 「테이스팅 노트」 그대로.
function brewRow(b) {
  return h(
    'a',
    { class: 'list-row brew-row', href: `#/brew/${b.id}` },
    h('div', { class: 'brew-row-main' }, h('div', null, `${b.recipe.name} · ${b.bean?.name ?? '원두 미입력'}`), h('div', { class: 'hint' }, fmtDateTime(b.timer.startedAt))),
    h('div', { class: 'row-meta' }, h('span', null, formatSec(timerOf(b).totalSec)), h('span', { class: b.survey ? 'muted' : 'badge' }, b.survey ? '설문 완료' : '설문 대기')),
  );
}

// 계정 배너 한 칸(9/26 사용자 요청 — 다른 안내 칸처럼 두 줄): 「계정에 저장 중」(굵게) / 이메일
const accountLine = (title, email) => h('div', { class: 'account-line' }, h('b', null, title), email ? h('div', null, email) : null);

const LOCAL_WORDS = { brews: '추출', beans: '원두', grinders: '그라인더', servers: '서버', recipes: '레시피', drippers: '드리퍼', measurements: '분쇄 측정', blends: '블렌드 템플릿' };

async function moveLocalToAccount(btn) {
  btn.disabled = true;
  const n = await copyAll(createLocalAdapter(), store.adapter);
  logEvent('migrate', { ...n, via: 'banner' });
  toast(`계정으로 옮겼습니다: 추출 ${n.brews}건`);
  setTimeout(() => location.reload(), 600);
}

// loginLink = 배너 아래에 구글 로그인 버튼을 둘지(처음 값 켬 — 홈·설정 모두 같은 모양, 9/25)
// 9/25 사용자 요청: 「로그인」 글자 링크로 설정 화면에 보내지 말고, 그 자리에서 바로 구글 로그인을 띄운다.
export function storageBanner({ loginLink = true } = {}) {
  // 새로 고침 직후 계정 확인 중이면 「로그인하지 않아…」로 잘못 보이지 않게
  if (store.mode !== 'cloud' && store.pendingAccount) return h('div', { class: 'banner pending' }, accountLine('계정 확인 중…', store.pendingAccount));
  if (store.mode === 'cloud') {
    const lo = localOnlyCounts();
    const detail = Object.keys(LOCAL_WORDS).filter((k) => lo[k]).map((k) => `${LOCAL_WORDS[k]} ${lo[k]}`).join(' · ');
    const move = lo.total ? h('button', { type: 'button', onClick: (e) => moveLocalToAccount(e.currentTarget) }, '계정으로 옮기기') : null;
    return h(
      'div',
      { class: 'banners' },
      h('div', { class: 'banner ok' }, accountLine('계정에 저장 중', store.user?.email ?? '')),
      lo.total ? h('div', { class: 'banner local-only' }, h('div', null, `이 기기에만 있는 기록 ${lo.total}건`, h('span', { class: 'term-sub' }, detail)), move) : null,
    );
  }
  if (firebaseEnabled()) {
    return h('div', { class: 'banner login' }, h('div', null, '로그인하지 않아 이 기기에만 저장 중입니다.'), loginLink ? loginButton() : null);
  }
  return h('div', { class: 'banner' }, '이 기기에만 저장 중입니다(Firebase 설정 전).');
}

const loginButton = () => googleButton({ onClick: () => signIn().catch((e) => toast(`로그인 실패: ${e.code ?? e.message}`)) });

// 기록 주소를 열었는데 이 저장소에 그 기록이 없을 때(사용자 요청 9/25 — 전에는 「기록을 찾을 수 없습니다.」 한 줄뿐).
// 홈의 로그인 안내와 같은 칸 모양. 로그인 전: 계정에 있을 수 있으니 로그인 버튼 / 로그인 뒤: 다른 사람의 기록 + 지금 계정.
// 기록·결과·설문·공유 화면이 함께 쓴다.
export function brewNotFound() {
  let box;
  if (store.mode === 'cloud') {
    box = h('div', { class: 'banner login' }, h('div', null, '다른 사람의 기록이므로 접근할 수 없습니다.'), h('div', { class: 'banner ok' }, accountLine('계정에 저장 중', store.user?.email ?? '')));
  } else if (store.pendingAccount) {
    box = h('div', { class: 'banner pending' }, accountLine('계정 확인 중…', store.pendingAccount)); // 확인이 끝나면 main.js 가 다시 그린다
  } else if (firebaseEnabled()) {
    box = h('div', { class: 'banner login' }, h('div', { class: 'pre-line' }, '기록이 기기에 없습니다.\n계정에 저장된 기록이라면 로그인 후 확인할 수 있습니다.'), loginButton());
  } else {
    box = h('div', { class: 'banner' }, '기록이 기기에 없습니다.');
  }
  return h('div', { class: 'screen' }, h('h1', null, '기록'), box);
}

export function homeScreen() {
  const brews = store.brews();
  const waiting = brews.filter((b) => !b.survey).slice(0, 5);
  const active = loadActive();
  return h(
    'div',
    { class: 'screen' },
    h('h1', null, 'NextBrew'),
    storageBanner(),
    active?.state?.status === 'running' ? h('a', { class: 'button primary big wide', href: '#/timer' }, '진행 중인 추출로 돌아가기') : null,
    active?.state?.status === 'ready' ? h('a', { class: 'button primary big wide', href: '#/timer' }, '준비한 추출로 돌아가기') : null,
    // 남은 원두가 10g 이하인 원두(사용자 요청 9/25) — 다 썼으면 그 자리에서 「소모」로 바꾼다
    ...store.list('beans').filter((x) => beanStock(x, brews, store.list('beans')).low).map((x) => lowBeanNotice(x, brews, 'home')),
    h('a', { class: 'button primary big wide', href: '#/prep' }, '추출하기'),
    waiting.length ? section('테이스팅 노트를 기다리는 기록', ...waiting.map(brewRow)) : null,
    section('최근 기록', ...(brews.length ? brews.slice(0, 3).map(brewRow) : [h('div', { class: 'hint' }, '아직 기록이 없습니다.')])),
  );
}

// 기록 목록(9/26 사용자 요청): 한 줄을 길게 누르면 고르기 모드 — 줄마다 체크 칸, 아래에 [취소] [공유].
// [공유]를 누르면 AI 공유 화면(형식 MD·JSON · 프롬프트)으로 가서 고른 기록을 한 파일로 묶는다(core/share.js buildSelectionPackage).
// 고른 ID 는 주소가 아니라 sessionStorage 에 둔다(이 탭 안에서만 — 공유 화면이 읽는다).
export const SELECTION_KEY = 'nb.shareSelection';
const LONG_PRESS_MS = 500; // 안드로이드·iOS 의 길게 누르기와 같은 값(0.5초)
export function historyScreen() {
  const brews = store.brews();
  const root = h('div', { class: 'screen' });
  let sel = null; // 고르기 모드면 Set
  const enter = (id, via) => {
    sel = new Set([id]);
    logEvent('share.selectStart', { via, total: brews.length }, { brewId: id });
    draw();
  };
  // 길게 누르기: 0.5초 누르고 있으면 고르기 모드. 그사이 손가락이 움직이면(스크롤·끌어 넘기기) 취소. 떼면 링크 이동은 막는다.
  const longPress = (row, id) => {
    let timer = null;
    let start = null;
    let fired = false;
    const stop = () => { clearTimeout(timer); timer = null; };
    row.addEventListener('pointerdown', (e) => {
      fired = false;
      start = [e.clientX, e.clientY];
      timer = setTimeout(() => { fired = true; navigator.vibrate?.(15); enter(id, 'longpress'); }, LONG_PRESS_MS);
    });
    row.addEventListener('pointermove', (e) => start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10 && stop());
    row.addEventListener('pointerup', stop);
    row.addEventListener('pointercancel', stop);
    row.addEventListener('click', (e) => fired && e.preventDefault());
    // 안드로이드 크롬은 길게 누르면 링크 메뉴(contextmenu)를 띄운다 → 그 대신 고르기 모드
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!fired) { stop(); fired = true; enter(id, 'contextmenu'); } });
    return row;
  };
  const pickRow = (b) => {
    const box = h('input', { type: 'checkbox', checked: sel.has(b.id), 'aria-label': `${b.recipe.name} 고르기` });
    box.addEventListener('change', () => { if (box.checked) sel.add(b.id); else sel.delete(b.id); draw(); });
    return h(
      'label',
      { class: `list-row pick-row${sel.has(b.id) ? ' on' : ''}` },
      box,
      h('div', { class: 'grow' }, h('div', null, `${b.recipe.name} · ${b.bean?.name ?? '원두 미입력'}`), h('div', { class: 'hint' }, fmtDateTime(b.timer.startedAt))),
      h('div', { class: 'right' }, formatSec(timerOf(b).totalSec)),
    );
  };
  function draw() {
    if (!brews.length) return fill(root, h('h1', null, '기록 (0)'), h('div', { class: 'hint' }, '아직 기록이 없습니다.'));
    // 목록은 홈 「최근 기록」처럼 칸 안에 줄마다 상자(9/26 사용자 요청 — 기록·원두·레시피 목록 통일)
    if (!sel) {
      return fill(
        root,
        h('h1', null, `기록 (${brews.length})`),
        section(null, h('div', { class: 'hint sub-hint' }, '길게 누르면 여러 기록을 골라 AI 로 함께 공유할 수 있습니다.'), ...brews.map((b) => longPress(brewRow(b), b.id))),
      );
    }
    fill(
      root,
      h('h1', null, `${sel.size}건 고름`),
      section(null, ...brews.map(pickRow)),
      h(
        'div',
        { class: 'select-bar' },
        h('button', { type: 'button', onClick: () => { logEvent('share.selectCancel', { count: sel.size }); sel = null; draw(); } }, '취소'),
        h('button', {
          type: 'button',
          class: 'primary',
          disabled: sel.size === 0,
          onClick: () => {
            // 목록 순서(최근 먼저)가 아니라 ID 만 넘긴다 — 묶을 때 시간순으로 다시 늘어놓는다
            sessionStorage.setItem(SELECTION_KEY, JSON.stringify([...sel]));
            location.hash = '#/share/selected';
          },
        }, `공유 (${sel.size})`),
      ),
    );
  }
  draw();
  return root;
}

function surveySummary(s) {
  if (!s) return h('div', { class: 'hint' }, '아직 테이스팅 노트를 쓰지 않았습니다.');
  const rows = [];
  for (const it of SURVEY_ITEMS) {
    const v = s.items[it.key];
    const word = v.level == null ? '선택 안 함' : INTENSITY_WORDS[v.level - 1];
    rows.push(h('dt', null, it.label), h('dd', null, [word, ...(v.kinds ?? [])].join(' · '), v.note ? h('div', { class: 'note' }, v.note) : null));
  }
  rows.push(h('dt', null, WORDS.offFlavor.label), h('dd', null, s.offFlavors.length ? s.offFlavors.join(', ') : '없음', s.offFlavorNote ? h('div', { class: 'note' }, s.offFlavorNote) : null));
  const perceived = Object.entries(s.notePerception ?? {});
  if (perceived.length) rows.push(h('dt', null, WORDS.notePerception.label), h('dd', null, perceived.map(([n, p]) => `${n}: ${p}`).join(' · ')));
  rows.push(h('dt', null, WORDS.myNotes.label), h('dd', null, s.myNotes.length ? s.myNotes.join(', ') : '—'));
  rows.push(h('dt', null, '만족도'), h('dd', null, s.liking == null ? '선택 안 함' : LIKING_WORDS[s.liking - 1]));
  if (s.extraNote) rows.push(h('dt', null, '추가 입력'), h('dd', null, h('div', { class: 'note' }, s.extraNote)));
  return h('dl', { class: 'kv' }, ...rows);
}

// 두 기록을 양쪽에 나란히 — 다른 줄은 강조, 시간은 ±2초를 넘을 때만 다르다고 본다
function compareTable(b, partner, kind) {
  const rows = sideBySide(b, partner);
  let lastSection = null;
  const trs = [];
  for (const r of rows) {
    if (r.section !== lastSection) {
      trs.push(h('tr', { class: 'sec' }, h('th', { colspan: 3 }, r.section)));
      lastSection = r.section;
    }
    trs.push(h('tr', { class: r.differs ? 'differs' : '' }, h('td', null, term(r.label, r.sub)), h('td', null, r.a, r.note ? h('div', { class: 'diff' }, r.note) : null), h('td', null, r.b)));
  }
  const diffCount = rows.filter((r) => r.differs && r.label !== '레시피').length;
  return h(
    'div',
    null,
    h('div', { class: 'hint' }, kind === 'sameRecipe' ? '같은 레시피의 직전 기록과 비교합니다.' : '같은 레시피 기록이 없어, 같은 원두의 직전 기록과 비교합니다(레시피가 다름).'),
    h('div', { class: 'hint' }, `다른 항목 ${diffCount}개 · 직접 적은 메모는 비교하지 않고 아래 「맛」에 모두 보입니다.`),
    h('table', { class: 'compare' }, h('tr', null, h('th', null, '항목'), h('th', null, '이번'), h('th', null, fmtDateTime(partner.timer.startedAt))), ...trs),
  );
}

// 다음 추출 제안(사용자 결정 9/24 — 커피 컴퍼스, core/compass.js). 설문한 기록에만 보인다.
function adviceSection(b) {
  if (!b.survey) return null;
  const roast = b.bean?.id ? store.get('beans', b.bean.id)?.roast || null : null;
  const c = readCompass(b.survey, { roast });
  const grinder = b.conditions.grind?.grinderId ? store.get('grinders', b.conditions.grind.grinderId) : null;
  const upc = umPerClickFor(grinder, store.brews());
  const adv = adviseNext(c, { umPerClick: upc?.value ?? null });
  if (!adv) return section('다음 추출 제안', h('div', { class: 'hint' }, '테이스팅 노트에 답한 항목이 없어 제안하지 않습니다.'));
  return section(
    '다음 추출 제안',
    compassFigure(c),
    h('ul', { class: 'advice' }, ...adv.lines.map((l) => h('li', null, l))),
    // 몇 클릭인지 알면 다음에 맞출 그라인더 표시값까지(9/26)
    adv.clicks && b.conditions.grind?.dial != null ? h('div', { class: 'hint' }, `다음 그라인더 표시값: ${b.conditions.grind.dial} → ${b.conditions.grind.dial + adv.clicks}`) : null,
    adv.grindUm && !adv.clicks ? h('div', { class: 'hint' }, '설정 → 그라인더에 클릭당 µm 를 적거나, 참고 µm 를 두 눈금 이상에서 기록하면 클릭 수로 알려 드립니다.') : null,
    adv.doseDeltaG ? h('div', { class: 'hint' }, ratioChange(b.conditions, adv.doseDeltaG)) : null,
    c.cues.length ? h('div', { class: 'hint' }, `근거: ${c.cues.map((x) => x.text).join(' · ')}`) : null,
    upc ? h('div', { class: 'source' }, `클릭당 약 ${n2(upc.value)}µm (${upc.source === 'manual' ? '설정에 적은 값' : `기록 ${upc.n}건으로 추정`})`) : null,
    h('div', { class: 'source' }, '방향: Barista Hustle 「Coffee Compass」 · 조정 단위(30µm·0.5g): 언스페셜티 브루잉 가이드. 다음 추출 준비 화면에도 보입니다.'),
  );
}

// AI 제안(사용자 요청 9/25 — 레시피 가져오기처럼 AI 답(JSON)을 받아 다음 추출 값을 앱에 넣는다. core/adviceImport.js).
// 받은 제안은 이 기록에 붙고, 다음 추출 준비 화면의 [AI 제안대로 맞추기]가 쓴다.
const NEXT_ROWS = [
  ['grindDial', '그라인더 표시값', ''],
  ['doseG', '원두량', 'g'],
  ['hotWaterG', '뜨거운 물', 'g'],
  ['tempC', '물 온도', '℃'],
];
function nextRows(advice, brew) {
  const cur = currentValues(brew);
  return h(
    'dl',
    { class: 'kv' },
    ...NEXT_ROWS.flatMap(([k, label, unit]) => {
      const v = advice.next[k];
      const c = cur[k];
      const text = v == null ? '그대로(값 없음)' : c == null ? `${v}${unit}` : v === c ? `${v}${unit} 그대로` : `${c} → ${v}${unit}`;
      return [h('dt', null, label), h('dd', { class: v != null && c != null && v !== c ? 'changed' : '' }, text)];
    }),
  );
}
export function adviceView(advice, brew) {
  return [
    advice.summary ? h('div', null, advice.summary) : null,
    nextRows(advice, brew),
    advice.changes.length ? h('ul', { class: 'advice' }, ...advice.changes.map((c) => h('li', null, h('b', null, `${ADVICE_ITEMS[c.item]} `), c.text))) : null,
    advice.good.length ? h('div', { class: 'hint' }, `잘 된 점: ${advice.good.join(' · ')}`) : null,
    advice.issues.length ? h('div', { class: 'hint' }, `아쉬운 점: ${advice.issues.join(' · ')}`) : null,
    advice.questions.length ? h('div', { class: 'hint' }, `AI 의 질문: ${advice.questions.join(' · ')}`) : null,
  ];
}
// AI 답(JSON) 넣기 공용 칸(9/26 사용자 결정 A안 — 답 안의 기록 ID(brewId)로 맞는 기록을 찾아 저장한다).
// 기록 화면 「AI 제안」과 AI 공유 화면 맨 아래에 같은 것을 둔다 — 어디서 붙여 넣어도 그 답의 기록으로 간다.
// 기록 ID 가 비었거나 이 기기에 없는 기록이면 fallback(이 기록 · 공유한 기록 중 가장 최근)에 넣되, 그렇다고 알리고 넣을 기록을 보인 뒤 저장한다.
// where = record | share(로그용), onSaved(기록) = 저장 뒤 부르는 곳이 할 일
export function adviceImportBox({ fallback = null, where, onSaved = null }) {
  const pasteBox = h('textarea', { rows: 5, placeholder: 'AI 가 준 JSON 을 여기에 붙여 넣으세요. 앞뒤 설명 글이나 ```json 표시가 있어도 됩니다.' });
  const result = h('div', { class: 'stack' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json,.txt,.md,text/plain',
    class: 'hidden',
    onChange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      pasteBox.value = await f.text();
      check('file');
    },
  });
  const title = (x) => `${fmtDateTime(x.timer.startedAt)} · ${x.recipe.name} · ${x.bean?.name ?? '원두 미입력'}`;
  function check(via) {
    let raw;
    let fixes = [];
    try {
      ({ raw, fixes } = readAdviceText(pasteBox.value));
    } catch (e) {
      logEvent('aiAdvice.importFail', { stage: 'parse', errors: [e.message], via, where }, { brewId: fallback?.id ?? null });
      return fill(result, h('div', { class: 'notice error' }, e.message));
    }
    const want = typeof raw?.brewId === 'string' ? raw.brewId.trim() : '';
    const found = want ? store.get('brews', want) : null;
    const target = found ?? fallback;
    if (!target) {
      logEvent('aiAdvice.importFail', { stage: 'route', errors: [`brewId ${want || '없음'}`], via, where });
      return fill(result, h('div', { class: 'notice error' }, want ? `기록 ID(${want})에 맞는 기록이 이 기기에 없습니다.` : '답에 기록 ID(brewId)가 없습니다. 그 기록 화면에서 붙여 넣어 주세요.'));
    }
    const routed = found ? 'brewId' : 'fallback';
    // 못 찾아 fallback 에 넣을 때는 검사가 «다른 기록의 답»으로 막지 않게 그 기록 ID 로 본다(알림은 아래에 따로)
    const { advice, errors, warnings } = validateAdvice(found ? raw : { ...raw, brewId: target.id }, { brew: target });
    if (errors.length) {
      logEvent('aiAdvice.importFail', { stage: 'validate', errors: errors.slice(0, 5), via, where }, { brewId: target.id });
      return fill(result, h('div', { class: 'notice error' }, `고칠 곳 ${errors.length}개`, h('ul', null, ...errors.map((m) => h('li', null, m)))));
    }
    const notes = [
      ...fixes,
      ...warnings,
      routed === 'fallback' ? (want ? `brewId: 「${want}」 기록을 이 기기에서 찾지 못해 아래 기록에 넣습니다.` : 'brewId: 비어 있어 아래 기록에 넣습니다.') : null,
    ].filter(Boolean);
    fill(
      result,
      notes.length ? h('div', { class: 'notice warn' }, '확인해 주세요', h('ul', null, ...notes.map((m) => h('li', null, m)))) : null,
      h('div', { class: 'field-label' }, '넣을 기록'),
      h('a', { href: `#/brew/${target.id}` }, title(target)),
      target.aiAdvice ? h('div', { class: 'hint' }, '이 기록에 넣어 둔 AI 제안이 있어 새 답으로 바꿉니다.') : null,
      h('div', { class: 'import-preview' }, h('div', { class: 'field-label' }, '미리 보기'), ...adviceView(advice, target)),
      h('button', {
        type: 'button',
        class: 'primary wide',
        onClick: () => {
          const replaced = Boolean(target.aiAdvice);
          target.aiAdvice = advice;
          store.put('brews', target);
          logEvent('aiAdvice.import', { changes: advice.changes.length, next: Object.keys(advice.next).filter((k) => advice.next[k] != null), warnings: notes.length, confidence: advice.confidence, via, where, routed, replaced }, { brewId: target.id });
          toast('AI 제안을 기록에 저장했습니다. 다음 추출 준비 화면에서 쓸 수 있습니다.');
          pasteBox.value = '';
          fill(result, h('div', { class: 'notice' }, '저장했습니다: ', h('a', { href: `#/brew/${target.id}` }, title(target))));
          onSaved?.(target);
        },
      }, 'AI 제안 저장'),
    );
  }
  return [
    pasteBox,
    h('div', { class: 'row' }, h('button', { type: 'button', onClick: () => check('paste') }, '확인하기'), h('button', { type: 'button', onClick: () => fileInput.click() }, '파일에서 불러오기')),
    fileInput,
    result,
  ];
}

function aiAdviceSection(b) {
  const box = h('div', { class: 'stack' });
  const imp = adviceImportBox({ fallback: b, where: 'record', onSaved: (t) => t.id === b.id && draw() });
  async function copyResultPrompt() {
    const ok = await copyText(adviceResultPrompt());
    logEvent('aiAdvice.promptCopy', { ok }, { brewId: b.id });
    if (ok) toast('결과 받기 프롬프트를 복사했습니다. AI 대화창에 붙여 넣어 보내세요.');
    else {
      imp[0].value = adviceResultPrompt(); // 붙여 넣기 칸에 넣어 두고 직접 복사하게
      imp[0].select();
      toast('복사하지 못했습니다. 칸에 넣어 둔 글을 길게 눌러 복사해 주세요.');
    }
  }
  const importer = () => [
    h(
      'ol',
      { class: 'guide' },
      h('li', null, '[AI로 공유]로 기록을 AI 에게 보내고 이야기합니다.'),
      h('li', null, '결론이 나면 AI 가 「앱에 넣을 결과를 드릴까요?」라고 묻습니다. 달라고 하면 JSON 을 줍니다. 묻지 않으면 [결과 받기 프롬프트 복사]로 요청하세요.'),
      h('li', null, 'AI 답의 코드 블록을 복사해 아래에 붙여 넣고 [확인하기]를 누릅니다(파일로 받았으면 [파일에서 불러오기]). 답 안의 기록 ID 로 그 답의 기록에 넣습니다.'),
    ),
    h('button', { type: 'button', class: 'wide', onClick: copyResultPrompt }, '결과 받기 프롬프트 복사'),
    ...imp,
  ];
  function draw() {
    const a = b.aiAdvice;
    if (!a) return fill(box, ...importer());
    fill(
      box,
      h('div', { class: 'hint' }, `${fmtDateTime(Date.parse(a.importedAt))}에 넣음${a.confidence ? ` · AI 확신 ${CONFIDENCE_WORDS[a.confidence]}` : ''}${a.model ? ` · ${a.model}` : ''}`),
      ...adviceView(a, b),
      h('div', { class: 'hint' }, '다음 추출 준비 화면의 [AI 제안대로 맞추기]로 이 값을 채울 수 있습니다.'),
      h('details', { class: 'sub-details' }, h('summary', null, '다시 넣기'), ...importer()),
      h('div', { class: 'row-line' }, h('span'), h('button', {
        type: 'button',
        class: 'inline-btn quiet',
        onClick: async () => {
          const k = await modal({ title: 'AI 제안을 지울까요?', body: '이 기록에 붙은 AI 제안만 지웁니다. 기록은 그대로입니다.', actions: [{ key: 'no', label: '닫기' }, { key: 'yes', label: '지우기', primary: true }] });
          if (k !== 'yes') return;
          logEvent('aiAdvice.delete', { importedAt: a.importedAt }, { brewId: b.id });
          delete b.aiAdvice;
          store.put('brews', b);
          draw();
        },
      }, 'AI 제안 지우기')),
    );
  }
  draw();
  return section('AI 제안', box);
}

// 따른 AI 제안(9/26 사용자 결정): 이 추출이 어느 기록의 제안을 따랐는지(그 기록으로 가는 링크) · 맞춘 값과 맞춘 뒤 바꾼 칸 · 그때 제안 원문(복사본)
function followedSection(b) {
  const fa = b.followedAdvice;
  if (!fa) return null;
  const src = store.get('brews', fa.fromBrewId);
  const when = fa.fromStartedAt ? fmtDateTime(fa.fromStartedAt) : '이전';
  return section(
    '따른 AI 제안',
    h('div', null, src ? h('a', { href: `#/brew/${src.id}` }, `${when} 추출`) : `${when} 추출(지운 기록)`, '의 AI 제안대로 맞춰 내렸습니다.'),
    h('ul', { class: 'advice' }, ...followLines(fa).map((l) => h('li', null, l))),
    fa.dialSkipped ? h('div', { class: 'hint' }, '제안이 달린 기록과 그라인더가 달라 그라인더 표시값은 맞추지 않았습니다.') : null,
    fa.advice ? h('details', { class: 'sub-details' }, h('summary', null, '그때 제안 보기'), ...adviceView(fa.advice, src)) : null,
  );
}

export function detailScreen(id) {
  const b = store.get('brews', id);
  if (!b) return brewNotFound();
  const { lines, prev } = comparisonBlock(b);
  return h(
    'div',
    { class: 'screen' },
    h('h1', null, b.recipe.name),
    h('div', { class: 'hint' }, `${fmtDateTime(b.timer.startedAt)} · 총 ${formatSec(timerOf(b).totalSec)} (레시피 ${formatSec(b.timer.plannedTotalSec)})`),
    section('지난 추출과 비교', ...lines.filter((l) => l.tagName !== 'A'), prev.partner ? compareFigure(b, prev.partner, '지난 추출') : null, prev.partner ? compareTable(b, prev.partner, prev.partnerKind) : null),
    section('타이머', timerTable(b), brewFigure(b)),
    measurementOf(b) ? section('분쇄 측정', h('div', { class: 'hint' }, measureSummary(measurementOf(b))), measureView(measurementOf(b))) : null,
    section('조건', conditionsList(b)),
    followedSection(b),
    section('맛', surveySummary(b.survey)),
    adviceSection(b),
    aiAdviceSection(b),
    h(
      'div',
      { class: 'row wrap' },
      h('a', { class: 'button', href: `#/brew/${b.id}/result` }, '결과 수정'),
      h('a', { class: 'button primary', href: `#/brew/${b.id}/survey` }, b.survey ? '테이스팅 노트 수정' : '테이스팅 노트 쓰기'),
      h('a', { class: 'button', href: `#/brew/${b.id}/share` }, 'AI로 공유'),
    ),
  );
}
