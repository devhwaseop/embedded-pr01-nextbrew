// 원두 탭의 [그라인더] · [서버] 칸(사용자 요청 9/26 — 설정에서 옮김. 원두·레시피와 같은 «추출에 쓰는 저장 항목»).
// 내용은 9/24~25 설정 화면의 그라인더·서버 칸 그대로다.

import { h, section, field, stepper, toast, term } from '../dom.js';
import { store } from '../../core/store.js';
import { createGrinder, createServer } from '../../core/schema.js';
import { WORDS } from '../../core/words.js';
import { logEvent } from '../../core/log.js';
import { estimateUmPerClick } from '../../core/compass.js';
import { beansSegment } from './beans.js';

// 클릭당 µm 를 비워 두면 쓸 값: 이 그라인더 기록들의 (영점 반영값, 참고 µm)로 구한 기울기
function umHint(g) {
  const est = g.id ? estimateUmPerClick(store.brews(), g.id) : null;
  return est ? `비우면 기록 ${est.n}건으로 추정한 약 ${est.value}µm 를 씁니다.` : '비워 두면, 참고 µm 를 서로 다른 눈금에서 두 번 이상 적었을 때 기록으로 추정합니다.';
}

function grinderRow(g) {
  const draft = { ...g };
  return h(
    'div',
    { class: 'grinder-row' },
    h('input', { type: 'text', value: draft.name, placeholder: '그라인더 이름', onInput: (e) => (draft.name = e.target.value) }),
    field('영점(클릭)', stepper({ value: draft.zeroOffset, step: 1, min: -99, max: 99, onChange: (v) => (draft.zeroOffset = v ?? 0) }), '예: 110(-3)이면 −3'),
    // 클릭당 µm(선택, 사용자 결정 9/24 — 다음 추출 제안을 클릭 수로 바꾸는 데 쓴다). 비우면 기록의 참고 µm 로 추정한다.
    field(term('클릭당 µm', '선택 · 그라인더 표시값이 1 커질 때 굵어지는 µm'), stepper({ value: draft.umPerClick, step: 1, min: -500, max: 500, unit: 'µm', onChange: (v) => (draft.umPerClick = v) }),
      umHint(g)),
    h(
      'button',
      {
        type: 'button',
        onClick: () => {
          if (!draft.name.trim()) return toast('이름을 넣어 주세요.');
          const saved = store.put('grinders', { ...g, name: draft.name.trim(), zeroOffset: draft.zeroOffset, umPerClick: draft.umPerClick ?? null });
          logEvent('grinder.save', { grinderId: saved.id, name: saved.name, zeroOffset: saved.zeroOffset, umPerClick: saved.umPerClick });
          toast('저장했습니다.');
        },
      },
      '저장',
    ),
  );
}

// 서버(추출 받는 그릇): 이름 + 자체 무게. 결과 화면에서 총 무게에서 뺀다.
function serverRow(sv) {
  const draft = { ...sv };
  return h(
    'div',
    { class: 'grinder-row' },
    h('input', { type: 'text', value: draft.name, placeholder: '서버 이름 (예: 하리오 서버 600)', onInput: (e) => (draft.name = e.target.value) }),
    field('서버 자체 무게', stepper({ value: draft.tareG, step: 1, min: 0, max: 3000, unit: 'g', onChange: (v) => (draft.tareG = v) }), '빈 서버를 저울에 올린 값'),
    h(
      'button',
      {
        type: 'button',
        onClick: () => {
          if (!draft.name.trim()) return toast('이름을 넣어 주세요.');
          if (draft.tareG == null) return toast('서버 무게를 넣어 주세요.');
          const saved = store.put('servers', { ...sv, name: draft.name.trim(), tareG: draft.tareG });
          logEvent('server.save', { serverId: saved.id, name: saved.name, tareG: saved.tareG });
          toast('저장했습니다.');
        },
      },
      '저장',
    ),
  );
}


// 준비 화면에서 [그라인더 등록…]으로 왔으면 돌아가는 단추
function backToPrep() {
  if (sessionStorage.getItem('nb.returnTo') !== '#/prep') return null;
  return h('button', { class: 'wide', onClick: () => { sessionStorage.removeItem('nb.returnTo'); location.hash = '#/prep'; } }, '← 준비 화면으로 돌아가기');
}

export function grindersScreen() {
  const grinderList = h('div', null, ...store.list('grinders').map(grinderRow));
  return h(
    'div',
    { class: 'screen' },
    beansSegment('grinders'),
    h('h1', { class: 'sr-only' }, '그라인더'),
    backToPrep(),
    section(
      '그라인더',
      h('div', { class: 'hint' }, '영점은 언제든 바꿀 수 있습니다. 이미 저장된 기록은 그때의 영점을 그대로 가집니다.'),
      grinderList,
      h('button', { onClick: () => grinderList.append(grinderRow(createGrinder())) }, '＋ 그라인더 추가'),
      // 보조 자료(사용자 결정 9/24): 데이터를 앱에 옮기지 않고 링크만 둔다 — 이용 허락 표시가 없고 두 곳 모두 크라우드소싱 추정치라서
      h(
        'div',
        { class: 'source' },
        '다른 그라인더의 클릭·µm를 맞춰 볼 때(추정치, 참고용): ',
        h('a', { href: 'https://honestcoffeeguide.com/coffee-grind-size-chart/', target: '_blank', rel: 'noopener' }, 'Honest Coffee Guide 분쇄 크기 표'),
        ' · ',
        h('a', { href: 'https://beeancoffee.com/grinder-setting-converter/', target: '_blank', rel: 'noopener' }, 'Beean Coffee 설정 변환기'),
      ),
      // 언스페셜티(사용자 추가 9/24): 인쇄한 측정지 위에서 찍은 사진으로 «내» 분쇄의 평균 µm 를 잰다 — 추정표가 아니라 측정이라 줄을 나눈다.
      // 개발기 칼럼(측정 원리)은 에이전트 확인용으로 받은 것이라 앱에는 두지 않는다(사용자 정정 9/24).
      h(
        'div',
        { class: 'source' },
        '내 분쇄를 사진으로 재 볼 때(A4 측정지 인쇄): ',
        h('a', { href: 'https://community.unspecialty.com/compass/grinder', target: '_blank', rel: 'noopener' }, '언스페셜티 분쇄도 가이드'),
      ),
    ),
    // 레시피 추가·관리는 원두 탭의 [원두 | 레시피] 전환으로 옮겼다(사용자 결정 9/25 — 설정에 있으면 애매하다)
  );
}

export function serversScreen() {
  const serverList = h('div', null, ...store.list('servers').map(serverRow));
  return h(
    'div',
    { class: 'screen' },
    beansSegment('servers'),
    h('h1', { class: 'sr-only' }, '서버'),
    section(
      '서버',
      h('div', { class: 'hint' }, `결과 화면에서 서버 총 무게를 재면 여기 무게를 빼서 ${WORDS.netWeight.label}를 계산합니다.`),
      serverList,
      h('button', { onClick: () => serverList.append(serverRow(createServer())) }, '＋ 서버 추가'),
    ),
  );
}
