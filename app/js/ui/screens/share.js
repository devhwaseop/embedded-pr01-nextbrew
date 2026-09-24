// AI로 공유 — 이번 기록과 비교 대상 기록을 파일 하나로 묶어 저장하거나 운영체제 공유창으로 보낸다(사용자 결정 9/24).
// 흐름: 화면을 열거나 형식을 바꾸면 「묶는 중」(버퍼링)을 보인 뒤 파일을 미리 만들어 둔다.
//       [공유하기]는 만들어 둔 파일을 바로 넘긴다 — 누른 뒤에 만들면 브라우저가 «사용자 동작이 아님»으로 막을 수 있어서다.
// 파일 공유 가능 형식은 브라우저가 정한다. MDN 목록(2026-09-24 확인)에 .json·.md 는 없어서,
// canShare 로 확인해 안 되면 같은 내용을 글로 공유한다. [파일 저장]은 어디서나 된다.

import { h, section, chips, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { SHARE_FORMATS, SHARE_SCOPES } from '../../core/schema.js';
import { buildSharePackage, shareFileName, toJSON, toMarkdown, SHARE_ROLES } from '../../core/share.js';
import { logEvent } from '../../core/log.js';
import { SHARE_FORMAT_WORDS, SHARE_SCOPE_WORDS } from '../../core/words.js';

const BUFFER_MS = 800; // 「묶는 중」을 최소 이만큼 보여 준다(새 파일이 만들어졌다는 걸 눈으로 확인하게)
const LABELS = Object.fromEntries(SHARE_FORMATS.map((f) => [f, SHARE_FORMAT_WORDS[f].label]));
const DESCRIBE = Object.fromEntries(SHARE_FORMATS.map((f) => [LABELS[f], SHARE_FORMAT_WORDS[f].sub]));
const SCOPE_LABELS = Object.fromEntries(SHARE_SCOPES.map((k) => [k, SHARE_SCOPE_WORDS[k].label]));
const SCOPE_DESCRIBE = Object.fromEntries(SHARE_SCOPES.map((k) => [SCOPE_LABELS[k], SHARE_SCOPE_WORDS[k].sub]));
const TYPES = { md: 'text/markdown', json: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shareScreen(id) {
  const b = store.get('brews', id);
  if (!b) return h('div', { class: 'screen' }, '기록을 찾을 수 없습니다.');
  const root = h('div', { class: 'screen' });
  let format = SHARE_FORMATS.includes(store.settings().shareFormat) ? store.settings().shareFormat : 'md';
  let scope = SHARE_SCOPES.includes(store.settings().shareScope) ? store.settings().shareScope : 'with';
  let ready = null; // { format, pkg, text, name, file, method }
  let buildNo = 0;

  async function prepare() {
    const no = ++buildNo;
    ready = null;
    draw();
    const started = Date.now();
    const pkg = buildSharePackage({ brews: store.list('brews'), beans: store.list('beans'), current: b, scope });
    const text = format === 'json' ? toJSON(pkg) : toMarkdown(pkg);
    const name = shareFileName(pkg, format);
    const file = new File([text], name, { type: TYPES[format] });
    const method = navigator.canShare?.({ files: [file] }) ? 'file' : navigator.share ? 'text' : null;
    await sleep(Math.max(0, BUFFER_MS - (Date.now() - started)));
    if (no !== buildNo) return; // 그사이 형식을 또 바꿨으면 이 결과는 버린다
    ready = { format, pkg, text, name, file, method };
    logEvent('share.build', { format, scope, brews: pkg.brews.length, previous: Boolean(pkg.relations.previous), sameRecipeAndBean: Boolean(pkg.relations.sameRecipeAndBean) }, { brewId: b.id });
    draw();
  }

  async function doShare() {
    const r = ready;
    try {
      if (r.method === 'file') await navigator.share({ files: [r.file], title: r.name });
      else await navigator.share({ title: r.name, text: r.text });
      logEvent('share.done', { format: r.format, method: r.method }, { brewId: b.id });
    } catch (e) {
      logEvent('share.fail', { format: r.format, method: r.method, name: e.name, message: e.message }, { brewId: b.id });
      if (e.name !== 'AbortError') toast(`공유하지 못했습니다: ${e.message}`);
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
    if (ready.pkg.scope === 'single') return h('ul', { class: 'hint' }, h('li', null, `${SHARE_ROLES.current}: `, h('a', { href: `#/brew/${rel.current}` }, '이 기록')));
    const row = (role, id, extra) => h('li', null, `${SHARE_ROLES[role]}: `, id ? h('a', { href: `#/brew/${id}` }, extra ?? '보기') : '없음');
    return h(
      'ul',
      { class: 'hint' },
      row('current', rel.current, '이 기록'),
      row('previous', rel.previous),
      rel.sameRecipeAndBean && rel.sameRecipeAndBean === rel.previous
        ? h('li', null, `${SHARE_ROLES.sameRecipeAndBean}: 직전 추출과 같은 기록`)
        : row('sameRecipeAndBean', rel.sameRecipeAndBean),
    );
  }

  function draw() {
    root.replaceChildren(
      h('h1', null, 'AI로 공유'),
      // 고정 안내는 제목 아래, 고른 것에 따라 바뀌는 설명은 칩 아래(설정 화면 AI 공유 칸과 같은 배치)
      h('div', { class: 'hint' }, '형식과 담을 기록의 기본값은 설정에서 바꿀 수 있습니다.'),
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
      section(
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
            ready.method === 'text' ? h('div', { class: 'hint' }, `이 브라우저는 .${ready.format} 파일 공유를 지원하지 않아, 공유하기는 같은 내용을 글로 보냅니다.`) : null,
            ready.method == null ? h('div', { class: 'hint' }, '이 브라우저에는 공유창이 없습니다. 파일 저장을 써 주세요.') : null,
            h('details', null, h('summary', null, '내용 미리 보기'), h('pre', { class: 'preview' }, ready.text)),
          )
        : section(null, h('div', { class: 'buffering', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), '묶는 중…')),
      h('a', { class: 'button wide', href: `#/brew/${b.id}` }, '기록으로 돌아가기'),
    );
  }

  prepare();
  return root;
}
