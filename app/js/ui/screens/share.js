// AI로 공유 — 이번 기록과 비교 대상 기록을 파일 하나로 묶어 저장하거나 운영체제 공유창으로 보낸다(사용자 결정 9/24).
// 9/25 사용자 결정: 프롬프트를 보여 주고(고칠 수 있음) 복사 단추 두 개(코드 상자 모서리 아이콘 + [프롬프트 복사])로 복사하게 한다.
//   [공유하기]는 파일만 보낸다 — 공유창에 글을 같이 실어도 AI 앱이 그 글을 입력칸에 넣는지는 앱마다 달라서, 프롬프트는 붙여 넣기로 전한다.
// 흐름: 화면을 열거나 형식을 바꾸면 「묶는 중」(버퍼링)을 보인 뒤 파일을 미리 만들어 둔다.
//       [공유하기]는 만들어 둔 파일을 바로 넘긴다 — 누른 뒤에 만들면 브라우저가 «사용자 동작이 아님»으로 막을 수 있어서다.
// 파일 공유 가능 형식은 브라우저가 정한다. 크롬(PC·안드로이드)은 확장자·MIME 허용 목록에 없는 파일을
// share() 에서 «Permission denied»(NotAllowedError)로 거절하는데, canShare() 는 이 목록을 보지 않아 true 를 낸다
// (9/25 사용자 보고 → 크롬 원본 share_service_impl.cc·ShareServiceImpl.java·navigator_share.cc 확인. 목록에 .md·.json 없음, .txt 있음).
// 그래서 공유창으로 보낼 때만 같은 내용을 .txt(text/plain)로 싸서 보낸다. [파일 저장]은 고른 형식(.md·.json) 그대로다.

import { h, fill, section, chips, toast, fmtDateTime, autoGrow } from '../dom.js';
import { icon } from '../icons.js';
import { brewNotFound, SELECTION_KEY, adviceImportBox } from './records.js';
import { store } from '../../core/store.js';
import { SHARE_FORMATS, SHARE_SCOPES } from '../../core/schema.js';
import { buildSharePackage, buildSelectionPackage, shareFileName, shareSheetName, toJSON, toMarkdown, defaultSharePrompt, SHARE_ROLES, COMPARE_ROLES, compareOf } from '../../core/share.js';
import { logEvent } from '../../core/log.js';
import { SHARE_FORMAT_WORDS, SHARE_SCOPE_WORDS, COMPARE_WORDS } from '../../core/words.js';

const BUFFER_MS = 800; // 「묶는 중」을 최소 이만큼 보여 준다(새 파일이 만들어졌다는 걸 눈으로 확인하게)
const LABELS = Object.fromEntries(SHARE_FORMATS.map((f) => [f, SHARE_FORMAT_WORDS[f].label]));
const DESCRIBE = Object.fromEntries(SHARE_FORMATS.map((f) => [LABELS[f], SHARE_FORMAT_WORDS[f].sub]));
const SCOPE_LABELS = Object.fromEntries(SHARE_SCOPES.map((k) => [k, SHARE_SCOPE_WORDS[k].label]));
const SCOPE_DESCRIBE = Object.fromEntries(SHARE_SCOPES.map((k) => [SCOPE_LABELS[k], SHARE_SCOPE_WORDS[k].sub]));
const TYPES = { md: 'text/markdown', json: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// id = 기록 ID, 또는 'selected'(기록 목록에서 길게 눌러 고른 여러 건 — 9/26, 고른 ID 는 sessionStorage)
export function shareScreen(id) {
  const selIds = id === 'selected' ? JSON.parse(sessionStorage.getItem(SELECTION_KEY) ?? '[]').filter((x) => store.get('brews', x)) : null;
  if (selIds && !selIds.length) return h('div', { class: 'screen' }, h('h1', null, 'AI로 공유'), h('div', { class: 'hint' }, '고른 기록이 없습니다.'), h('a', { class: 'button wide', href: '#/history' }, '기록 목록으로'));
  // 고른 기록이면 가장 최근 것을 기준 기록으로(로그의 brewId · 파일 이름)
  const b = selIds ? selIds.map((x) => store.get('brews', x)).sort((p, q) => q.timer.startedAt - p.timer.startedAt)[0] : store.get('brews', id);
  if (!b) return brewNotFound();
  const kind = selIds ? 'selected' : 'one';
  const promptKey = selIds ? 'sharePromptSelected' : 'sharePrompt'; // 고친 프롬프트는 종류마다 따로 남긴다
  const root = h('div', { class: 'screen' });
  let format = SHARE_FORMATS.includes(store.settings().shareFormat) ? store.settings().shareFormat : 'md';
  let scope = SHARE_SCOPES.includes(store.settings().shareScope) ? store.settings().shareScope : 'with';
  let compare = compareOf(store.settings().shareCompare); // 담을 비교 기록(9/26) — 처음 값은 설정의 기본
  let ready = null; // { format, pkg, text, name, file, method }
  // AI 답 넣기(9/26 사용자 결정 A안): 공유 → AI 앱 → 돌아와 이 화면 맨 아래에 붙여 넣는다. 답 안의 기록 ID 로 그 기록에 넣는다(records.js adviceImportBox).
  // 형식·범위를 바꿔 화면을 다시 그려도 붙여 넣은 글이 남게 한 번만 만든다.
  const answerSection = section(
    'AI 답 넣기',
    h('div', { class: 'hint' }, `AI 가 앱에 넣을 결과(JSON)를 주면 여기에 붙여 넣습니다. 답 안의 기록 ID 로 그 기록에 넣고, 기록 ID 를 못 찾으면 ${selIds ? '고른 기록 중 가장 최근 것' : '이 기록'}에 넣습니다(넣기 전에 보여 드립니다).`),
    ...adviceImportBox({ fallback: b, where: 'share' }),
  );
  let buildNo = 0;

  // ── 프롬프트(한 번만 만들고 다시 그릴 때 그대로 옮겨 붙인다 — 고치던 글·커서가 날아가지 않게) ──
  const saved = store.settings()[promptKey];
  let promptText = saved?.trim() ? saved : defaultSharePrompt(kind);
  const isCustom = () => promptText.trim() !== defaultSharePrompt(kind).trim();
  const copyIcon = h('button', { type: 'button', class: 'copy-icon', 'aria-label': '프롬프트 복사', title: '복사' }, icon('copy'));
  const promptArea = h('textarea', { class: 'prompt-text', rows: 9, value: promptText, 'aria-label': 'AI 에게 보낼 프롬프트' });
  const resetBtn = h('button', { type: 'button', class: 'inline-btn quiet' }, '기본으로 되돌리기');
  const savedNote = h('div', { class: 'hint' });
  const paintPrompt = () => {
    resetBtn.classList.toggle('hidden', !isCustom());
    savedNote.textContent = isCustom() ? '고친 글은 저장되어 다음 공유에도 쓰입니다.' : '기본 질문: 다음 추출에서 무엇을 바꾸면 좋을지. 고쳐 써도 됩니다.';
  };
  const savePrompt = () => {
    store.setSetting(promptKey, isCustom() ? promptText : null);
    logEvent('share.promptEdit', { custom: isCustom(), length: promptText.length }, { brewId: b.id });
    paintPrompt();
  };
  promptArea.addEventListener('input', () => {
    promptText = promptArea.value;
    paintPrompt();
  });
  promptArea.addEventListener('change', savePrompt); // 칸을 벗어날 때 한 번 저장(글자마다 저장·로그를 남기지 않게)
  resetBtn.addEventListener('click', () => {
    promptText = defaultSharePrompt(kind);
    promptArea.value = promptText;
    autoGrow(promptArea); // 글을 코드로 바꿔 넣으면 input 이 오지 않는다
    savePrompt();
    toast('기본 프롬프트로 되돌렸습니다.');
  });
  async function copyPrompt(via) {
    try {
      await navigator.clipboard.writeText(promptText);
      logEvent('share.promptCopy', { custom: isCustom(), via, ok: true }, { brewId: b.id });
      fill(copyIcon, icon('check'));
      setTimeout(() => fill(copyIcon, icon('copy')), 2000);
      toast('프롬프트를 복사했습니다. [공유하기]로 파일을 AI 앱에 보낸 뒤 붙여 넣으세요.');
    } catch {
      // 클립보드가 막힌 브라우저: 글을 골라 두고 길게 눌러 복사하게 한다
      logEvent('share.promptCopy', { custom: isCustom(), via, ok: false }, { brewId: b.id });
      promptArea.focus();
      promptArea.select();
      toast('복사하지 못했습니다. 골라 둔 글을 길게 눌러 복사해 주세요.');
    }
  }
  copyIcon.addEventListener('click', () => copyPrompt('icon'));
  paintPrompt();
  const promptSection = section(
    '프롬프트',
    // 코드 상자: 오른쪽 위 모서리에 복사 아이콘(AI 대화·마크다운 코드 블록의 복사 단추 방식)
    h('div', { class: 'code-box' }, promptArea, copyIcon),
    h('div', { class: 'row-line' }, savedNote, resetBtn),
    h('button', { type: 'button', class: 'primary wide', onClick: () => copyPrompt('button') }, '프롬프트 복사'),
  );
  const stepsSection = section(
    '보내는 순서',
    h(
      'ol',
      { class: 'guide' },
      h('li', null, '아래 프롬프트를 복사합니다(고쳐 써도 됩니다).'),
      h('li', null, '[공유하기]를 누르고 AI 앱(ChatGPT·Gemini·Claude 등)을 고릅니다.'),
      h('li', null, 'AI 대화창에 파일이 붙으면, 프롬프트를 붙여 넣고 보냅니다.'),
      // 9/25: AI 답(JSON)을 앱으로 가져오기
      h('li', null, 'AI 가 앱에 넣을 결과(JSON)를 주면, 이 화면 맨 아래 「AI 답 넣기」에 붙여 넣습니다(기록 화면 「AI 제안」에서도 됩니다).'),
    ),
  );

  async function prepare() {
    const no = ++buildNo;
    ready = null;
    draw();
    const started = Date.now();
    const pkg = selIds
      ? buildSelectionPackage({ brews: store.list('brews'), beans: store.list('beans'), drippers: store.list('drippers'), ids: selIds })
      : buildSharePackage({ brews: store.list('brews'), beans: store.list('beans'), drippers: store.list('drippers'), current: b, scope, compare });
    const text = format === 'json' ? toJSON(pkg) : toMarkdown(pkg);
    const name = shareFileName(pkg, format);
    const file = new File([text], name, { type: TYPES[format] });
    const sheetFile = new File([text], shareSheetName(name), { type: 'text/plain' });
    const method = navigator.canShare?.({ files: [sheetFile] }) ? 'file' : navigator.share ? 'text' : null;
    await sleep(Math.max(0, BUFFER_MS - (Date.now() - started)));
    if (no !== buildNo) return; // 그사이 형식을 또 바꿨으면 이 결과는 버린다
    ready = { format, pkg, text, name, file, sheetFile, method };
    logEvent('share.build', { format, scope: pkg.scope, brews: pkg.brews.length, compare: pkg.relations.compare ?? null, found: (pkg.relations.compare ?? []).filter((r) => pkg.relations[r]) }, { brewId: b.id });
    draw();
  }

  async function doShare() {
    const r = ready;
    try {
      if (r.method === 'file') await navigator.share({ files: [r.sheetFile], title: r.name });
      else await navigator.share({ title: r.name, text: r.text });
      logEvent('share.done', { format: r.format, method: r.method }, { brewId: b.id });
    } catch (e) {
      logEvent('share.fail', { format: r.format, method: r.method, name: e.name, message: e.message }, { brewId: b.id });
      if (e.name !== 'AbortError') toast(`공유창을 열지 못했습니다(${e.name}). [파일 저장]으로 받아 주세요.`);
    }
  }

  function doDownload() {
    const r = ready;
    const url = URL.createObjectURL(r.file);
    const a = h('a', { href: url, download: r.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    logEvent('share.done', { format: r.format, method: 'download' }, { brewId: b.id });
  }

  function included() {
    const rel = ready.pkg.relations;
    if (ready.pkg.scope === 'selected') {
      return h('ul', { class: 'hint' }, ...ready.pkg.brews.map((x, i) => h('li', null, `${i + 1}. `, h('a', { href: `#/brew/${x.id}` }, `${fmtDateTime(x.timer.startedAt)} · ${x.recipe.name}`), x.id === rel.current ? ' (가장 최근)' : '')));
    }
    if (ready.pkg.scope === 'single') return h('ul', { class: 'hint' }, h('li', null, `${SHARE_ROLES.current}: `, h('a', { href: `#/brew/${rel.current}` }, '이 기록')));
    // 고른 비교 역할마다 찾은 기록 — 앞 역할과 같은 기록이면 그렇게 적는다(파일에는 한 번만 담긴다)
    const seen = new Map([[rel.current, 'current']]);
    const rows = (rel.compare ?? []).map((r) => {
      const id = rel[r];
      if (!id) return h('li', null, `${SHARE_ROLES[r]}: 없음`);
      if (seen.has(id)) return h('li', null, `${SHARE_ROLES[r]}: 「${SHARE_ROLES[seen.get(id)]}」과 같은 기록`);
      seen.set(id, r);
      return h('li', null, `${SHARE_ROLES[r]}: `, h('a', { href: `#/brew/${id}` }, '보기'));
    });
    return h(
      'ul',
      { class: 'hint' },
      h('li', null, `${SHARE_ROLES.current}: `, h('a', { href: `#/brew/${rel.current}` }, '이 기록')),
      ...rows,
      rel.compare?.length ? null : h('li', null, '비교 기록을 고르지 않아 이번 추출만 담겼습니다.'),
    );
  }

  // 비교 기록 고르기(9/26 사용자 요청): 여러 개 함께 고른다(칩을 누를 때마다 다시 묶음) · [모두 선택]/[모두 풀기]
  function compareChooser() {
    const all = compare.length === COMPARE_ROLES.length;
    return h(
      'div',
      { class: 'stack compare-choose' },
      h('div', { class: 'row-line' }, h('span', { class: 'field-label' }, '비교할 기록'),
        h('button', { type: 'button', class: 'inline-btn', onClick: () => { compare = all ? [] : [...COMPARE_ROLES]; prepare(); } }, all ? '모두 풀기' : '모두 선택')),
      chips({
        options: COMPARE_ROLES.map((r) => COMPARE_WORDS[r]),
        selected: compare.map((r) => COMPARE_WORDS[r]),
        multi: true,
        onChange: (v) => {
          compare = compareOf(COMPARE_ROLES.filter((r) => v.includes(COMPARE_WORDS[r])));
          prepare();
        },
      }),
      h('div', { class: 'hint' }, '여러 개 함께 고를 수 있습니다. 같은 기록이 두 역할에 걸리면 한 번만 담깁니다.'),
    );
  }

  function draw() {
    fill(
      root,
      h('h1', null, 'AI로 공유'),
      // 고정 안내는 제목 아래, 고른 것에 따라 바뀌는 설명은 칩 아래(설정 화면 AI 공유 칸과 같은 배치)
      h('div', { class: 'hint' }, '형식과 담을 기록의 기본값은 설정에서 바꿀 수 있습니다.'),
      stepsSection,
      promptSection,
      section(
        '형식',
        chips({
          options: SHARE_FORMATS.map((f) => LABELS[f]),
          selected: LABELS[format],
          describe: DESCRIBE,
          onChange: (v) => {
            const f = SHARE_FORMATS.find((x) => LABELS[x] === v);
            if (!f || f === format) return draw(); // 같은 칩을 다시 눌러 해제된 것은 무시
            format = f;
            prepare();
          },
        }),
      ),
      selIds ? null : section(
        '담을 기록',
        chips({
          options: SHARE_SCOPES.map((k) => SCOPE_LABELS[k]),
          selected: SCOPE_LABELS[scope],
          describe: SCOPE_DESCRIBE,
          onChange: (v) => {
            const k = SHARE_SCOPES.find((x) => SCOPE_LABELS[x] === v);
            if (!k || k === scope) return draw(); // 같은 칩을 다시 눌러 해제된 것은 무시
            scope = k;
            prepare();
          },
        }),
        scope === 'with' ? compareChooser() : null,
      ),
      ready
        ? section(
            '담긴 기록',
            included(),
            h('div', { class: 'hint' }, `${ready.name} · ${(ready.file.size / 1024).toFixed(1)}KB`),
            h(
              'div',
              { class: 'row wrap' },
              ready.method ? h('button', { class: 'primary', onClick: doShare }, '공유하기') : null,
              h('button', { onClick: doDownload }, '파일 저장'),
            ),
            ready.method === 'file' ? h('div', { class: 'hint' }, `공유하기는 같은 내용을 ${ready.sheetFile.name} 로 보냅니다(브라우저가 .${ready.format} 파일 공유를 막아서). 파일 저장은 .${ready.format} 그대로입니다.`) : null,
            ready.method === 'text' ? h('div', { class: 'hint' }, '이 브라우저는 파일 공유를 지원하지 않아, 공유하기는 같은 내용을 글로 보냅니다.') : null,
            ready.method == null ? h('div', { class: 'hint' }, '이 브라우저에는 공유창이 없습니다. 파일 저장을 써 주세요.') : null,
            h('details', null, h('summary', null, '내용 미리 보기'), h('pre', { class: 'preview' }, ready.text)),
          )
        : section(null, h('div', { class: 'buffering', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), '묶는 중…')),
      answerSection,
      selIds ? h('a', { class: 'button wide', href: '#/history' }, '기록 목록으로') : h('a', { class: 'button wide', href: `#/brew/${b.id}` }, '기록으로 돌아가기'),
    );
  }

  prepare();
  return root;
}
