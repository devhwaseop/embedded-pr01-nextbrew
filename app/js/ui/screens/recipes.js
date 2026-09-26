// 레시피 화면(사용자 결정 9/24): AI 로 레시피 추가 · 확인하고 고치기 · 직접 입력 · 목록(수정·삭제)
//
// 흐름: [프롬프트 복사] → AI 대화창에 붙여 넣고 레시피 원문을 넣어 보냄 → AI 답(JSON)을 붙여 넣거나 파일로 불러옴
//       → 앱이 읽고(특수문자는 고쳐 읽음) 항목별 입력칸에 채움 → 칸을 고칠 때마다 다시 검사 → 미리 보기 → 저장
// 입력칸을 고칠 때는 검사 결과 칸만 다시 그린다(화면 전체를 다시 그리면 입력 중인 칸의 커서가 튄다).

import { h, fill, section, field, chips, toast, modal, tags, linkButton } from '../dom.js';
import { beansSegment } from './beans.js';
import { store } from '../../core/store.js';
import { logEvent } from '../../core/log.js';
import { PRESETS, findPreset } from '../../data/presets.js';
import { userRecipes } from '../../core/recipeBook.js';
import { recipePrompt, toImportFormat, readRecipeText, validateRecipeImport, blankRecipe } from '../../core/recipeImport.js';
import { buildPlan, recipeTags, formatRatio } from '../../core/recipe.js';
import { n2, formatSec } from '../../core/schema.js';
import { planFigure } from '../charts.js';

// 프롬프트 예시 = 앱에 들어 있는 쿠라스 프리셋(형식·검사기와 어긋나지 않게 테스트가 묶는다)
const EXAMPLE = toImportFormat(findPreset('kurasu-japanese-iced') ?? PRESETS[0]);
const KIND_WORDS = { bloom: '뜸', pour: '푸어' };

// 입력칸 글 → 값: 비우면 null, 숫자면 숫자, "1:10" 이면 초, 그 밖은 글 그대로(검사기가 알려 준다)
function parseField(v, { time = false } = {}) {
  const s = v.trim();
  if (s === '') return null;
  const m = time && s.match(/^(\d+):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(Number(s)) ? Number(s) : s;
}

// 붙여 넣은 JSON 을 폼이 다룰 수 있는 모양으로(값은 그대로 두고 틀만 맞춘다 — 틀린 값은 검사기가 알려 준다)
function shapeDraft(raw) {
  const d = structuredClone(raw ?? {});
  if (!d.source || typeof d.source !== 'object') d.source = { title: null, url: null, author: null };
  if (!Array.isArray(d.steps)) d.steps = [];
  d.steps = d.steps.map((s) => (s && typeof s === 'object' ? s : {}));
  for (const k of ['pourTips', 'notes', 'uncertain']) if (!Array.isArray(d[k])) d[k] = d[k] == null ? [] : [String(d[k])];
  return d;
}

export function recipesScreen() {
  const root = h('div', { class: 'screen' });
  let draft = null; // 가져오기 형식 객체(폼이 고친다)
  let via = null; // paste | file | manual | edit
  let editingId = null;
  let readFixes = []; // 읽으면서 고친 특수문자
  let parseError = null;

  const pasteBox = h('textarea', { rows: 5, placeholder: 'AI 답을 여기에 붙여 넣으세요. 앞뒤 설명 글이나 ```json 표시가 있어도 됩니다.' });
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,.txt,application/json,text/plain',
    class: 'hidden',
    onChange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      pasteBox.value = await f.text();
      load('file');
    },
  });
  const promptText = recipePrompt(EXAMPLE);
  const promptBox = h('details', null, h('summary', null, '프롬프트 내용 보기'), h('pre', { class: 'preview' }, promptText));
  const result = h('div', { class: 'import-result' });
  let editorEl = null;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptText);
      toast('프롬프트를 복사했습니다. AI 대화창에 붙여 넣고 맨 아래에 레시피를 넣어 보내세요.');
    } catch {
      promptBox.open = true;
      toast('복사하지 못했습니다. 아래 「프롬프트 내용 보기」의 글을 길게 눌러 복사해 주세요.');
    }
  }

  function load(from) {
    try {
      const { raw, fixes } = readRecipeText(pasteBox.value);
      // 한 번 검사해 고쳐 읽은 값(15g → 15, "0:45" → 45)을 폼에 넣고, 그 안내는 「읽으면서 고친 것」으로 옮긴다
      const first = validateRecipeImport(shapeDraft(raw));
      draft = shapeDraft(first.clean ?? raw);
      via = from;
      editingId = null;
      readFixes = [...fixes, ...first.warnings.filter((w) => w.includes('읽었습니다'))];
      parseError = null;
    } catch (e) {
      parseError = e.message;
      draft = null;
      logEvent('recipe.importFail', { stage: 'parse', errors: [e.message], via: from });
    }
    draw();
    (editorEl ?? result).scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function startManual() {
    draft = blankRecipe();
    via = 'manual';
    editingId = null;
    readFixes = [];
    parseError = null;
    draw();
    editorEl?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function startEdit(r) {
    draft = toImportFormat(r);
    via = 'edit';
    editingId = r.id;
    readFixes = [];
    parseError = null;
    draw();
    editorEl?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  async function remove(r) {
    const k = await modal({
      title: `「${r.name}」 레시피를 지울까요?`,
      body: '이 레시피로 남긴 기록은 그대로 남습니다(기록마다 그때의 레시피 사본이 들어 있습니다).',
      actions: [{ key: 'no', label: '닫기' }, { key: 'yes', label: '지우기', primary: true }],
    });
    if (k !== 'yes') return;
    store.remove('recipes', r.id);
    logEvent('recipe.delete', { recipeId: r.id, name: r.name });
    toast('지웠습니다.');
    draw();
  }

  // ── 폼 ──
  const txt = (get, set, placeholder = '') =>
    h('input', { type: 'text', value: get() ?? '', placeholder, onChange: (e) => { set(e.target.value.trim() === '' ? null : e.target.value.trim()); check(); } });
  const numIn = (get, set, { time = false, placeholder = '' } = {}) =>
    h('input', { type: 'text', inputMode: time ? 'text' : 'decimal', value: get() ?? '', placeholder, onChange: (e) => { set(parseField(e.target.value, { time })); check(); } });
  const lines = (get, set, placeholder) =>
    h('textarea', { rows: 2, value: (get() ?? []).join('\n'), placeholder, onChange: (e) => { set(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)); check(); } });

  function stepEditor(s, i) {
    const d = draft;
    return h(
      'div',
      { class: 'step-edit' },
      h('div', { class: 'step-edit-head' }, h('b', null, `${i + 1}번째 단계`), d.steps.length > 1 ? h('button', { type: 'button', class: 'inline-btn', onClick: () => { d.steps.splice(i, 1); draw(); } }, '이 단계 빼기') : null),
      field('종류', chips({ options: ['뜸', '푸어'], selected: KIND_WORDS[s.kind] ?? null, onChange: (v) => { s.kind = v === '뜸' ? 'bloom' : v === '푸어' ? 'pour' : null; check(); } })),
      field('이름', txt(() => s.label, (v) => (s.label = v), '예: 1차 푸어')),
      h(
        'div',
        { class: 'two-col' },
        field('시작(초)', numIn(() => s.startSec, (v) => (s.startSec = v), { time: true, placeholder: '예: 40 또는 0:40' })),
        field('누적 물(g)', numIn(() => s.untilG, (v) => (s.untilG = v), { placeholder: '예: 100' })),
      ),
      field('설명(원문에 있을 때만)', txt(() => s.hint, (v) => (s.hint = v), '비워 두면 없음')),
    );
  }

  function editor() {
    const d = draft;
    const src = d.source;
    return section(
      editingId ? '레시피 수정' : via === 'manual' ? '직접 입력' : '확인하고 고치기',
      h('div', { class: 'hint' }, '칸을 고치면 바로 다시 검사합니다. 시각은 «첫 물을 붓기 시작한 순간 = 0초» 기준이고, 누적 물은 그 단계를 다 부었을 때 저울 값입니다.'),
      field('레시피 이름', txt(() => d.name, (v) => (d.name = v), '예: 쿠라스 재팬 아이스')),
      field('핫/아이스', chips({ options: ['핫', '아이스'], selected: d.style === 'iced' ? '아이스' : d.style === 'hot' ? '핫' : null, onChange: (v) => { d.style = v === '아이스' ? 'iced' : v === '핫' ? 'hot' : null; check(); } })),
      field('드리퍼', txt(() => d.dripper, (v) => (d.dripper = v), '예: Hario V60')),
      h(
        'div',
        { class: 'two-col' },
        field('원두량(g)', numIn(() => d.doseG, (v) => (d.doseG = v))),
        field('뜨거운 물 합계(g)', numIn(() => d.hotWaterG, (v) => (d.hotWaterG = v))),
        field('얼음(g)', numIn(() => d.iceG, (v) => (d.iceG = v), { placeholder: '핫이면 0' })),
        field('물 온도(℃)', numIn(() => d.tempC, (v) => (d.tempC = v), { placeholder: '없으면 비움' })),
      ),
      field('분쇄', txt(() => d.grind, (v) => (d.grind = v), '예: 중간보다 약간 가늘게')),
      field('배전도', txt(() => d.roast, (v) => (d.roast = v), '예: 라이트 로스트')),
      h('div', { class: 'field-label' }, '붓는 단계'),
      ...d.steps.map(stepEditor),
      h('button', {
        type: 'button',
        onClick: () => {
          const last = d.steps[d.steps.length - 1];
          const n = d.steps.filter((x) => x.kind === 'pour').length + 1;
          d.steps.push({ kind: 'pour', label: `${n}차 푸어`, startSec: typeof last?.startSec === 'number' ? last.startSec + 30 : null, untilG: typeof d.hotWaterG === 'number' ? d.hotWaterG : null, hint: null });
          draw();
        },
      }, '＋ 단계 추가'),
      h(
        'div',
        { class: 'two-col' },
        field('종료 목표(초)', numIn(() => d.endSec, (v) => (d.endSec = v), { time: true, placeholder: '예: 130 또는 2:10' })),
        field('한 번 붓는 시간(초)', numIn(() => d.pourSec, (v) => (d.pourSec = v), { placeholder: '원문에 없으면 비움' })),
      ),
      field('붓는 모양', txt(() => d.pourMethod, (v) => (d.pourMethod = v), '예: 나선형 · 없으면 비움')),
      field('붓기 팁(한 줄에 하나)', lines(() => d.pourTips, (v) => (d.pourTips = v), '모든 붓기에 걸리는 원문의 팁')),
      field('준비·마무리(한 줄에 하나)', lines(() => d.notes, (v) => (d.notes = v), '예: 얼음을 서버에 먼저 넣고 시작합니다.')),
      field('가수(g)', numIn(() => d.dilutionG, (v) => (d.dilutionG = v), { placeholder: '추출 뒤 더하는 물, 없으면 0' })),
      field('출처 제목', txt(() => src.title, (v) => (src.title = v))),
      field('출처 주소', txt(() => src.url, (v) => (src.url = v), 'https://…')),
      field('만든 사람', txt(() => src.author, (v) => (src.author = v))),
      result,
    );
  }

  const box = (kind, title, items) => h('div', { class: `notice ${kind}` }, h('b', null, title), h('ul', null, ...items.map((x) => h('li', null, x))));

  function preview(r) {
    const plan = buildPlan(r, r.refDoseG);
    const ice = plan.iceG;
    return h(
      'div',
      { class: 'import-preview' },
      h('div', { class: 'field-label' }, '미리 보기'),
      h('div', null, h('b', null, r.name)),
      tags(recipeTags(r)),
      h('div', { class: 'hint' }, [`원두 ${n2(plan.doseG)}g`, `뜨거운 물 ${n2(plan.hotWaterG)}g`, `원두와 물의 비율 ${formatRatio(plan.ratioHot)}`, ice ? `얼음 ${n2(ice)}g` : null, r.tempC != null ? `${r.tempC}℃` : null, r.grindNote || null].filter(Boolean).join(' · ')),
      planFigure(plan),
      h(
        'table',
        { class: 'plan' },
        h('tr', null, h('th', null, '단계'), h('th', null, '시작'), h('th', null, '저울 누적 목표')),
        ...plan.steps.map((s) => h('tr', null, h('td', null, s.label), h('td', null, formatSec(s.startSec)), h('td', null, `${n2(s.targetCumG)}g`))),
        h('tr', null, h('td', null, '종료 목표'), h('td', null, formatSec(plan.endSec)), h('td', null, '')),
      ),
      h('div', { class: 'hint' }, '원문과 숫자가 맞는지 한 번 대조해 주세요 — 특히 단계 시각과 누적 물. 형식은 앱이 검사하지만, AI 가 숫자를 잘못 옮긴 것은 앱이 알 수 없습니다.'),
    );
  }

  function check() {
    if (!draft) return;
    const editing = editingId ? store.get('recipes', editingId) : null;
    const names = [...PRESETS, ...userRecipes()].map((r) => r.name).filter((n) => n !== editing?.name);
    const res = validateRecipeImport(draft, { existingNames: names });
    fill(
      result,
      readFixes.length ? box('info', '읽으면서 고친 것', readFixes) : null,
      res.errors.length ? box('error', `고칠 곳 ${res.errors.length}개 — 위 칸에서 바로 고칠 수 있습니다`, res.errors) : null,
      res.warnings.length ? box('warn', '확인할 것', res.warnings) : null,
      draft.uncertain?.length ? box('warn', '원문에서 확인할 것(AI 가 적은 것)', draft.uncertain) : null,
      res.recipe ? preview(res.recipe) : null,
      h(
        'div',
        { class: 'row wrap' },
        h('button', { type: 'button', class: 'primary', disabled: !res.recipe, onClick: () => save(res) }, editingId ? '고친 내용 저장' : '레시피 저장'),
        h('button', { type: 'button', onClick: () => { draft = null; editingId = null; draw(); } }, '닫기'),
      ),
    );
  }

  function save(res) {
    const r = res.recipe;
    if (editingId) {
      const old = store.get('recipes', editingId);
      r.id = editingId;
      r.importedAt = old?.importedAt ?? r.importedAt;
      r.editedAt = new Date().toISOString();
    }
    store.put('recipes', r);
    logEvent(editingId ? 'recipe.edit' : 'recipe.import', { recipeId: r.id, name: r.name, steps: r.steps.length, warnings: res.warnings.length, uncertain: r.uncertain.length, via });
    toast(editingId ? '고친 내용을 저장했습니다.' : '저장했습니다. 준비 화면의 레시피 목록에 나옵니다.');
    draft = null;
    editingId = null;
    pasteBox.value = '';
    draw();
  }

  function recipeRow(r, mine) {
    return h(
      'div',
      { class: 'recipe-row list-row' }, // 칸 안의 상자(9/26 — 기록·원두 목록과 같은 모양)
      h('div', null, h('div', null, r.name), tags(recipeTags(r))),
      mine
        ? h('div', { class: 'row' }, h('button', { type: 'button', onClick: () => startEdit(r) }, '수정'), h('button', { type: 'button', onClick: () => remove(r) }, '지우기'))
        : h('span', { class: 'muted' }, '기본'),
    );
  }

  function draw() {
    editorEl = draft ? editor() : null;
    const mine = userRecipes();
    fill(
      root,
      beansSegment('recipes'),
      h('h1', { class: 'sr-only' }, '레시피'),
      section(
        'AI로 레시피 추가',
        h(
          'ol',
          { class: 'guide' },
          h('li', null, '[프롬프트 복사]를 눌러 ChatGPT·Gemini·Claude 같은 AI 대화창에 붙여 넣고, 맨 아래에 레시피 글이나 링크를 넣어 보냅니다.'),
          h('li', null, 'AI 답을 복사해 아래 칸에 붙여 넣거나, 파일로 받았으면 [파일에서 불러오기]를 누릅니다.'),
          h('li', null, '[확인하기]를 누르면 앱이 검사하고 칸마다 채워 보여 줍니다. 틀린 곳은 그 자리에서 고칠 수 있습니다.'),
          h('li', null, '원문과 숫자가 맞는지 확인한 뒤 [레시피 저장]을 누릅니다.'),
        ),
        h('button', { type: 'button', class: 'primary wide', onClick: copyPrompt }, '프롬프트 복사'),
        promptBox,
        pasteBox,
        h('div', { class: 'row wrap' }, h('button', { type: 'button', onClick: () => load('paste') }, '확인하기'), h('button', { type: 'button', onClick: () => fileInput.click() }, '파일에서 불러오기'), fileInput),
        parseError ? box('error', '읽지 못했습니다', [parseError]) : null,
        h('button', { type: 'button', class: 'wide', onClick: startManual }, '직접 입력'),
      ),
      editorEl,
      section('레시피 목록', ...PRESETS.map((r) => recipeRow(r, false)), ...mine.map((r) => recipeRow(r, true)), mine.length ? null : h('div', { class: 'hint' }, '아직 추가한 레시피가 없습니다.')),
      linkButton({ href: '#/prep', label: '추출 준비로' }),
    );
    if (draft) check();
  }

  draw();
  return root;
}
