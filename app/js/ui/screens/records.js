// 홈 · 기록 목록 · 기록 상세 (AI 공유는 share.js)

import { h, section, fmtDateTime, term, toast, googleButton } from '../dom.js';
import { WORDS } from '../../core/words.js';
import { store, loadActive, localOnlyCounts, copyAll, createLocalAdapter } from '../../core/store.js';
import { logEvent } from '../../core/log.js';
import { formatSec, formatDelta, beanStock, SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS } from '../../core/schema.js';
import { lowBeanNotice } from './beans.js';
import { sideBySide } from '../../core/diff.js';
import { firebaseEnabled, signIn } from '../../platform/firebase.js';
import { timerTable, conditionsList, comparisonBlock, ratioChange } from './brew.js';
import { brewFigure, compareFigure, compassFigure } from '../charts.js';
import { readCompass, adviseNext, umPerClickFor } from '../../core/compass.js';

function brewRow(b) {
  return h(
    'a',
    { class: 'list-row', href: `#/brew/${b.id}` },
    h('div', null, h('div', null, `${b.recipe.name} · ${b.bean?.name ?? '원두 미입력'}`), h('div', { class: 'hint' }, fmtDateTime(b.timer.startedAt))),
    h('div', { class: 'right' }, formatSec(b.timer.totalSec), h('div', { class: b.survey ? 'muted' : 'badge' }, b.survey ? '설문 완료' : '설문 대기')),
  );
}

const LOCAL_WORDS = { brews: '추출', beans: '원두', grinders: '그라인더', servers: '서버', recipes: '레시피' };

async function moveLocalToAccount(btn) {
  btn.disabled = true;
  const n = await copyAll(createLocalAdapter(), store.adapter);
  logEvent('migrate', { ...n, via: 'banner' });
  toast(`계정으로 옮겼습니다: 추출 ${n.brews}건`);
  setTimeout(() => location.reload(), 600);
}

// loginLink = 배너 아래에 구글 로그인 버튼을 둘지 — 설정 화면에서는 로그인 버튼이 따로 있어 뺀다.
// 9/25 사용자 요청: 「로그인」 글자 링크로 설정 화면에 보내지 말고, 그 자리에서 바로 구글 로그인을 띄운다.
export function storageBanner({ loginLink = true } = {}) {
  // 새로 고침 직후 계정 확인 중이면 「로그인하지 않아…」로 잘못 보이지 않게
  if (store.mode !== 'cloud' && store.pendingAccount) return h('div', { class: 'banner pending' }, `계정 확인 중… · ${store.pendingAccount}`);
  if (store.mode === 'cloud') {
    const lo = localOnlyCounts();
    const detail = Object.keys(LOCAL_WORDS).filter((k) => lo[k]).map((k) => `${LOCAL_WORDS[k]} ${lo[k]}`).join(' · ');
    const move = lo.total ? h('button', { type: 'button', onClick: (e) => moveLocalToAccount(e.currentTarget) }, '계정으로 옮기기') : null;
    return h(
      'div',
      { class: 'banners' },
      h('div', { class: 'banner ok' }, `계정에 저장 중 · ${store.user?.email ?? ''}`),
      lo.total ? h('div', { class: 'banner local-only' }, h('div', null, `이 기기에만 있는 기록 ${lo.total}건`, h('span', { class: 'term-sub' }, detail)), move) : null,
    );
  }
  if (firebaseEnabled()) {
    return h(
      'div',
      { class: 'banner login' },
      h('div', null, '로그인하지 않아 이 기기에만 저장 중입니다.'),
      loginLink ? googleButton({ onClick: () => signIn().catch((e) => toast(`로그인 실패: ${e.code ?? e.message}`)) }) : null,
    );
  }
  return h('div', { class: 'banner' }, '이 기기에만 저장 중입니다(Firebase 설정 전).');
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
    ...store.list('beans').filter((x) => beanStock(x, brews).low).map((x) => lowBeanNotice(x, brews, 'home')),
    h('a', { class: 'button primary big wide', href: '#/prep' }, '추출하기'),
    waiting.length ? section('설문을 기다리는 기록', ...waiting.map(brewRow)) : null,
    section('최근 기록', ...(brews.length ? brews.slice(0, 3).map(brewRow) : [h('div', { class: 'hint' }, '아직 기록이 없습니다.')])),
  );
}

export function historyScreen() {
  const brews = store.brews();
  return h('div', { class: 'screen' }, h('h1', null, `기록 (${brews.length})`), ...(brews.length ? brews.map(brewRow) : [h('div', { class: 'hint' }, '아직 기록이 없습니다.')]));
}

function surveySummary(s) {
  if (!s) return h('div', { class: 'hint' }, '아직 설문하지 않았습니다.');
  const rows = [];
  for (const it of SURVEY_ITEMS) {
    const v = s.items[it.key];
    const word = v.level == null ? '선택 안 함' : INTENSITY_WORDS[v.level - 1];
    rows.push(h('dt', null, it.label), h('dd', null, [word, ...(v.kinds ?? [])].join(' · '), v.note ? h('div', { class: 'note' }, v.note) : null));
  }
  rows.push(h('dt', null, WORDS.offFlavor.label), h('dd', null, s.offFlavors.length ? s.offFlavors.join(', ') : '—', s.offFlavorNote ? h('div', { class: 'note' }, s.offFlavorNote) : null));
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
  if (!adv) return section('다음 추출 제안', h('div', { class: 'hint' }, '설문에 답한 항목이 없어 제안하지 않습니다.'));
  return section(
    '다음 추출 제안',
    compassFigure(c),
    h('ul', { class: 'advice' }, ...adv.lines.map((l) => h('li', null, l))),
    adv.doseDeltaG ? h('div', { class: 'hint' }, ratioChange(b.conditions, adv.doseDeltaG)) : null,
    c.cues.length ? h('div', { class: 'hint' }, `근거: ${c.cues.map((x) => x.text).join(' · ')}`) : null,
    upc ? h('div', { class: 'source' }, `클릭당 약 ${upc.value}µm (${upc.source === 'manual' ? '설정에 적은 값' : `기록 ${upc.n}건으로 추정`})`) : null,
    h('div', { class: 'source' }, '방향: Barista Hustle 「Coffee Compass」 · 조정 단위(30µm·0.5g): 언스페셜티 브루잉 가이드. 다음 추출 준비 화면에도 보입니다.'),
  );
}

export function detailScreen(id) {
  const b = store.get('brews', id);
  if (!b) return h('div', { class: 'screen' }, '기록을 찾을 수 없습니다.');
  const { lines, prev } = comparisonBlock(b);
  return h(
    'div',
    { class: 'screen' },
    h('h1', null, b.recipe.name),
    h('div', { class: 'hint' }, `${fmtDateTime(b.timer.startedAt)} · 총 ${formatSec(b.timer.totalSec)} (레시피 ${formatSec(b.timer.plannedTotalSec)})`),
    section('지난 추출과 비교', ...lines.filter((l) => l.tagName !== 'A'), prev.partner ? compareFigure(b, prev.partner, '지난 추출') : null, prev.partner ? compareTable(b, prev.partner, prev.partnerKind) : null),
    section('타이머', timerTable(b), brewFigure(b)),
    section('조건', conditionsList(b)),
    section('맛', surveySummary(b.survey)),
    adviceSection(b),
    h(
      'div',
      { class: 'row wrap' },
      h('a', { class: 'button', href: `#/brew/${b.id}/result` }, '결과 수정'),
      h('a', { class: 'button primary', href: `#/brew/${b.id}/survey` }, b.survey ? '설문 수정' : '맛 설문하기'),
      h('a', { class: 'button', href: `#/brew/${b.id}/share` }, 'AI로 공유'),
    ),
  );
}
