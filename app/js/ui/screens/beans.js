// 원두 목록 · 원두 등록
// 항목은 SCA 외재적 평가 양식의 재배·가공 항목(국가·지역·생산자·품종·가공 방식)을 참고했다 — 사용자 확인 예정.
// 노트 추천은 이전에 등록한 같은 산지·가공 원두에서만 가져온다(core/suggest.js).

import { h, section, field, choiceList, tagEditor, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { createBean, PROCESS_TYPES } from '../../core/schema.js';
import { suggestNotes } from '../../core/suggest.js';
import { logEvent } from '../../core/log.js';
import { loadDraft, saveDraft } from './brew.js';

export function beansScreen() {
  const beans = store.list('beans').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return h(
    'div',
    { class: 'screen' },
    h('h1', null, '원두'),
    h('a', { class: 'button primary wide', href: '#/bean/new' }, '＋ 원두 등록'),
    ...beans.map((b) =>
      h(
        'a',
        { class: 'list-row', href: `#/bean/${b.id}` },
        h('div', null, h('div', null, b.name), h('div', { class: 'hint' }, [b.roaster, b.country, b.process].filter(Boolean).join(' · '))),
        h('div', { class: 'right hint' }, (b.notes ?? []).slice(0, 3).join(', ')),
      ),
    ),
    beans.length ? null : h('div', { class: 'hint' }, '등록한 원두가 없습니다.'),
  );
}

export function beanFormScreen(id) {
  const existing = id === 'new' ? null : store.get('beans', id);
  if (id !== 'new' && !existing) return h('div', { class: 'screen' }, '원두를 찾을 수 없습니다.');
  const bean = existing ? structuredClone(existing) : createBean();
  const others = () => store.list('beans');
  const usedProcesses = [...new Set([...PROCESS_TYPES, ...others().map((b) => b.process).filter(Boolean)])];

  const text = (key, placeholder = '') => h('input', { type: 'text', value: bean[key] ?? '', placeholder, onInput: (e) => (bean[key] = e.target.value) });
  const notesBox = h('div');
  const drawNotes = () => {
    const sug = suggestNotes(others(), { country: bean.country, process: bean.process, excludeId: bean.id });
    notesBox.replaceChildren(
      sug.length ? h('div', { class: 'hint' }, `같은 산지로 전에 등록한 노트: ${sug.join(', ')}`) : null,
      tagEditor({ options: sug, selected: bean.notes, onChange: (v) => (bean.notes = v), placeholder: '봉투에 적힌 노트' }),
    );
  };
  const country = text('country', '예: 에티오피아');
  country.addEventListener('change', drawNotes);

  function save() {
    bean.name = (bean.name ?? '').trim();
    if (!bean.name) return toast('원두 이름을 넣어 주세요.');
    store.put('beans', bean);
    logEvent('bean.save', { beanId: bean.id, name: bean.name });
    // 준비 화면에서 등록하러 왔으면 방금 등록한 원두를 골라 두고 돌아간다
    if (sessionStorage.getItem('nb.returnTo') === '#/prep') {
      sessionStorage.removeItem('nb.returnTo');
      const d = loadDraft();
      if (d) saveDraft({ ...d, beanId: bean.id, beanName: '' });
      location.hash = '#/prep';
    } else {
      location.hash = '#/beans';
    }
  }

  drawNotes();
  return h(
    'div',
    { class: 'screen' },
    h('h1', null, existing ? '원두 수정' : '원두 등록'),
    section(
      null,
      field('이름 *', text('name', '예: 예가체프 G1')),
      field('로스터리', text('roaster')),
      field('국가', country),
      field('지역', text('region')),
      field('농장·생산자', text('producer')),
      field('품종', text('variety')),
      field('가공 방식', choiceList({ options: usedProcesses, value: bean.process || null, onChange: (v) => { bean.process = v; drawNotes(); } })),
      field('노트', notesBox),
      field('메모', h('textarea', { rows: 2, value: bean.memo ?? '', onInput: (e) => (bean.memo = e.target.value) })),
    ),
    h('button', { class: 'primary big wide', onClick: save }, '저장'),
  );
}
