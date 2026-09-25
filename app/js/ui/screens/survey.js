// 마신 뒤 맛 설문 — 가정안(사용해 보고 판단하기로 함, 9/23)
// - 강도는 왼쪽 끝이 「없음」인 한 방향 슬라이더, 만족도는 가운데가 「보통」인 양방향 슬라이더
// - 모든 슬라이더에 「선택 안 함」: 누르면 슬라이더가 꺼지고 값이 비워진다(가운데 값으로 저장하지 않는다)
// - 항목 이름을 누르면 메모 칸이 열린다(슬라이더는 그대로 두고 보조로 적는다)
// - 종류는 칩으로 고른다(산미: 상큼한/시큼한 등)

import { h, section, chips, tagEditor, termOf, paintScale } from '../dom.js';
import { WORDS } from '../../core/words.js';
import { store } from '../../core/store.js';
import { SURVEY_ITEMS, INTENSITY_WORDS, LIKING_WORDS, OFF_FLAVORS, NOTE_PERCEPTION, FLAVOR_CHIPS, emptySurvey } from '../../core/schema.js';
import { logEvent } from '../../core/log.js';
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

function scaleRow({ label, words, value, onChange, note, onNote }) {
  let level = value;
  const range = h('input', { type: 'range', min: 1, max: words.length, step: 1, value: level ?? Math.ceil(words.length / 2), class: 'scale' });
  const word = h('div', { class: 'scale-word' });
  const off = h('button', { type: 'button', class: 'chip' }, '선택 안 함');
  const paint = () => {
    paintScale(range);
    range.classList.toggle('off', level == null);
    off.classList.toggle('on', level == null);
    word.textContent = level == null ? '선택 안 함' : words[level - 1];
  };
  const take = () => {
    level = Number(range.value);
    paint();
    onChange(level);
  };
  // 「선택 안 함」 상태에서 가운데를 그냥 눌러도 값이 들어가도록 click 도 받는다
  range.addEventListener('input', take);
  range.addEventListener('click', take);
  off.addEventListener('click', () => {
    level = null;
    paint();
    onChange(null);
  });
  const { title, box } = onNote ? noteToggle(label, note, onNote) : { title: h('div', { class: 'item-title' }, label), box: null };
  paint();
  return h(
    'div',
    // --n = 단계 수: 눈금 단어를 슬라이더의 각 칸 위치에 맞춘다(CSS .scale-row, 원두 배전도 슬라이더와 같은 규칙)
    { class: 'scale-row', style: `--n:${words.length}` },
    h('div', { class: 'row between' }, title, off),
    range,
    h('div', { class: 'ticks' }, ...words.map((w) => h('span', null, w))),
    word,
    box,
  );
}

export function surveyScreen(id) {
  const b = store.get('brews', id);
  if (!b) return brewNotFound();
  const s = structuredClone(b.survey ?? emptySurvey());
  const bean = b.bean?.id ? store.get('beans', b.bean.id) : null;
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

  const off = noteToggle('잡미', s.offFlavorNote, (v) => (s.offFlavorNote = v));
  const beanNotes = bean?.notes ?? [];
  const extra = h('textarea', { rows: 3, placeholder: '특징적이거나 위에 없는 것', value: s.extraNote, class: s.extraNote ? '' : 'hidden', onInput: (e) => (s.extraNote = e.target.value) });

  // [저장]·[공유] 두 버튼(사용자 요청 9/25 — 한 버튼을 누르고 창에서 다시 고르던 것을 나눴다). [공유]도 먼저 저장한다.
  function onSave(share) {
    s.answeredAt = new Date().toISOString();
    b.survey = s;
    store.put('brews', b);
    const levels = [...Object.values(s.items).map((i) => i.level), s.liking];
    logEvent('survey.save', { answered: levels.filter((v) => v != null).length, skipped: levels.filter((v) => v == null).length, share }, { brewId: b.id });
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
    h('h1', null, '맛 설문'),
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
      chips({ options: OFF_FLAVORS, selected: s.offFlavors, multi: true, onChange: (v) => (s.offFlavors = v) }),
      off.box,
    ),
    section(
      null,
      h('h2', null, termOf(WORDS.notePerception)),
      beanNotes.length
        ? beanNotes.map((n) =>
            h('div', { class: 'note-row' }, h('span', null, n), chips({ options: NOTE_PERCEPTION, selected: s.notePerception[n] ?? null, onChange: (v) => (v ? (s.notePerception[n] = v) : delete s.notePerception[n]) })),
          )
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
