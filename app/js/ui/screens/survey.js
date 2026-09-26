// 마신 뒤 맛 설문 — 가정안(사용해 보고 판단하기로 함, 9/23)
// - 강도는 왼쪽 끝이 「없음」인 한 방향 슬라이더, 만족도는 가운데가 「보통」인 양방향 슬라이더
// - 모든 슬라이더에 「선택 안 함」: 누르면 슬라이더가 꺼지고 값이 비워진다(가운데 값으로 저장하지 않는다)
// - 항목 이름을 누르면 메모 칸이 열린다(슬라이더는 그대로 두고 보조로 적는다)
// - 종류는 칩으로 고른다(산미: 상큼한/시큼한 등)

import { h, fill, section, chips, tagEditor, termOf, levelSlider } from '../dom.js';
import { WORDS } from '../../core/words.js';
import { store } from '../../core/store.js';
import { SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS, OFF_FLAVORS, NOTE_PERCEPTION, FLAVOR_CHIPS, emptySurvey } from '../../core/schema.js';
import { logEvent } from '../../core/log.js';
import { lastNotePerceptions } from '../../core/suggest.js';
import { timerTable, conditionsList } from './brew.js';
import { brewNotFound } from './records.js';
import { fmtDateTime } from '../dom.js';

function noteToggle(label, note, onNote) {
  const box = h('textarea', { rows: 2, placeholder: `${label}에 대해 적기`, value: note ?? '', class: note ? '' : 'hidden', onInput: (e) => onNote(e.target.value) });
  const title = h(
    'button',
    {
      type: 'button',
      class: 'item-title',
      onClick: () => {
        box.classList.toggle('hidden');
        if (!box.classList.contains('hidden')) box.focus();
      },
    },
    label,
    h('span', { class: 'muted' }, ' ✎'),
  );
  return { title, box };
}

// 슬라이더 한 줄: 공용 levelSlider(원두 배전도와 같은 것) + 항목 이름을 누르면 여는 메모 칸
function scaleRow({ label, words, value, onChange, note, onNote }) {
  const { title, box } = onNote ? noteToggle(label, note, onNote) : { title: h('div', { class: 'item-title' }, label), box: null };
  return h('div', null, levelSlider({ label: title, words, value, onChange }), box);
}

export function surveyScreen(id) {
  const b = store.get('brews', id);
  if (!b) return brewNotFound();
  const s = structuredClone(b.survey ?? emptySurvey());
  // 블렌드 템플릿으로 섞은 기록(9/26)은 섞은 원두들의 노트를 모은다
  const bean = b.bean?.id
    ? store.get('beans', b.bean.id)
    : b.bean?.parts?.length
      ? { notes: [...new Set(b.bean.parts.flatMap((p) => store.get('beans', p.id)?.notes ?? []))] }
      : null;
  // 원두 노트 인식 미리 채우기(사용자 요청 9/25): 처음 쓰는 테이스팅 노트면, 같은 원두의 이전 기록에서 노트마다 «가장 최근에 답한 값»을 채운다.
  // 노트별로 따로 찾는다(한 기록을 통째로 옮기지 않음). 저장하면 이 기록에만 들어가고, 이전 기록은 바뀌지 않는다.
  const prefilled = b.survey ? {} : lastNotePerceptions(store.brews(), b, bean?.notes ?? []);
  for (const [n, p] of Object.entries(prefilled)) s.notePerception[n] = p.value;
  const detail = h('div', { class: 'hidden' }, timerTable(b), conditionsList(b));

  const itemRows = SURVEY_ITEMS.map((it) => {
    const cur = s.items[it.key];
    return h(
      'div',
      { class: 'survey-item' },
      scaleRow({ label: it.label, words: INTENSITY_WORDS, value: cur.level, onChange: (v) => (cur.level = v), note: cur.note, onNote: (v) => (cur.note = v) }),
      it.kinds.length ? chips({ options: it.kinds, selected: cur.kinds, multi: true, onChange: (v) => (cur.kinds = v) }) : null,
    );
  });

  // 잡미: 느낀 것만 고른다. 안 고르면 «없음»(9/26 사용자 판단 — 「없음」 칩은 뺐다). AI 공유는 MD 「없음」, JSON null(core/share.js · facts.js).
  delete s.offFlavorNone; // 잠시 있던 「없음」 칩의 값(커밋 전)
  const offBox = h('div', null, chips({ options: OFF_FLAVORS, selected: s.offFlavors, multi: true, onChange: (v) => (s.offFlavors = v) }));
  const off = noteToggle('잡미', s.offFlavorNote, (v) => (s.offFlavorNote = v));
  const beanNotes = bean?.notes ?? [];
  const extra = h('textarea', { rows: 3, placeholder: '특징적이거나 위에 없는 것', value: s.extraNote, class: s.extraNote ? '' : 'hidden', onInput: (e) => (s.extraNote = e.target.value) });

  // [저장]·[공유] 두 버튼(사용자 요청 9/25 — 한 버튼을 누르고 창에서 다시 고르던 것을 나눴다). [공유]도 먼저 저장한다.
  function onSave(share) {
    s.answeredAt = new Date().toISOString();
    b.survey = s;
    store.put('brews', b);
    const levels = [...Object.values(s.items).map((i) => i.level), s.liking];
    const pre = Object.keys(prefilled);
    logEvent('survey.save', {
      answered: levels.filter((v) => v != null).length, skipped: levels.filter((v) => v == null).length, share,
      notesPrefilled: pre.length, notesPrefillKept: pre.filter((n) => s.notePerception[n] === prefilled[n].value).length,
    }, { brewId: b.id });
    location.hash = share ? `#/brew/${b.id}/share` : `#/brew/${b.id}`;
  }

  // 「추출 보기」 ↔ 「추출 숨김」(사용자 요청 9/25 — 누른 뒤에도 같은 이름이라 지금 상태가 안 보였다)
  const detailBtn = h('button', { type: 'button', 'aria-expanded': 'false' }, '추출 보기');
  detailBtn.addEventListener('click', () => {
    const open = detail.classList.toggle('hidden') === false;
    detailBtn.textContent = open ? '추출 숨김' : '추출 보기';
    detailBtn.setAttribute('aria-expanded', String(open));
  });

  return h(
    'div',
    { class: 'screen' },
    h('h1', null, '테이스팅 노트'),
    h(
      'div',
      { class: 'row between' },
      h('div', { class: 'hint' }, `${b.recipe.name} · ${b.bean?.name ?? '원두 미입력'} · ${fmtDateTime(b.timer.startedAt)}`),
      detailBtn,
    ),
    detail,
    section('맛', h('div', { class: 'hint' }, '항목 이름을 누르면 메모를 적을 수 있습니다. 고르기 애매하면 「선택 안 함」.'), ...itemRows),
    section(
      null,
      h('div', { class: 'row between' }, off.title),
      offBox,
      off.box,
    ),
    section(
      null,
      h('h2', null, termOf(WORDS.notePerception)),
      Object.keys(prefilled).length ? h('div', { class: 'hint' }, '같은 원두의 지난 테이스팅 노트에서 노트마다 가장 최근 값을 골라 두었습니다. 바꾸거나 그대로 저장하면 이 기록에만 저장됩니다.') : null,
      beanNotes.length
        ? beanNotes.map((n) => {
            const from = prefilled[n] ? h('span', { class: 'term-sub' }, `${fmtDateTime(prefilled[n].at)} 기록에서`) : null;
            return h('div', { class: 'note-row' }, h('span', null, n, from), chips({ options: NOTE_PERCEPTION, selected: s.notePerception[n] ?? null, onChange: (v) => {
              if (v) s.notePerception[n] = v;
              else delete s.notePerception[n];
              from?.remove(); // 손으로 고르면 «가져옴» 표시를 뗀다
            } }));
          })
        : h('div', { class: 'hint' }, '원두에 적힌 노트를 원두 등록에서 넣으면, 여기서 느껴졌는지 물어봅니다.'),
      h('div', { class: 'field-label' }, termOf(WORDS.myNotes)),
      tagEditor({ options: FLAVOR_CHIPS, selected: s.myNotes, onChange: (v) => (s.myNotes = v) }),
    ),
    section('전체 만족도', scaleRow({ label: '이번 잔', words: LIKING_WORDS, value: s.liking, onChange: (v) => (s.liking = v), note: '', onNote: null })),
    h('button', { class: 'wide', onClick: () => { extra.classList.toggle('hidden'); extra.focus(); } }, '추가 입력'),
    extra,
    h('div', { class: 'row two' }, h('button', { class: 'primary big', onClick: () => onSave(false) }, '저장'), h('button', { class: 'big', onClick: () => onSave(true) }, '공유')),
  );
}
