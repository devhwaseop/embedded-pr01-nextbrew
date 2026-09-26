// 원두 탭의 [그라인더] · [드리퍼] · [서버] 칸(사용자 요청 9/26 — 설정에서 옮김, 드리퍼는 신설. 원두·레시피와 같은 «추출에 쓰는 저장 항목»).
// 기록은 이 항목들을 ID 로 가리킨다 — 이름·서버 자체 무게를 고치면 옛 기록도 따라가고, 그라인더 영점은 그때 값 그대로다(core/migrate.js).
// 그라인더 칸에서 분쇄 측정을 올리면 어떤 원두의 측정인지 팝업에서 고른다(ui/measureImport.js).

import { h, fill, section, field, stepper, toast, term, chips, pickOne, copyText } from '../dom.js';
import { DRIPPER_CATALOG, DRIPPER_SHAPES, DRIPPER_METHODS, SOURCE_KINDS, findCatalog, catalogFields, catalogName } from '../../data/drippers.js';
import { dripperPrompt, readDripperText, validateDripperImport, dripperPatch, applyDripperPatch, DRIPPER_FIELDS } from '../../core/dripperImport.js';
import { loadDraft, saveDraft } from './brew.js';
import { store } from '../../core/store.js';
import { n2, createGrinder, createServer, createDripper } from '../../core/schema.js';
import { measureImportButton, measureListItem } from '../measureImport.js';
import { WORDS } from '../../core/words.js';
import { logEvent } from '../../core/log.js';
import { estimateUmPerClick } from '../../core/compass.js';
import { beansSegment } from './beans.js';

// 클릭당 µm 를 비워 두면 쓸 값: 이 그라인더 기록들의 (영점 반영값, 참고 µm)로 구한 기울기
function umHint(g) {
  const est = g.id ? estimateUmPerClick(store.brews(), g.id) : null;
  return est ? `비우면 기록 ${est.n}건으로 추정한 약 ${n2(est.value)}µm 를 씁니다.` : '비워 두면, 참고 µm 를 서로 다른 눈금에서 두 번 이상 적었을 때 기록으로 추정합니다.';
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
    g.id && store.get('grinders', g.id) ? measureBlock(g) : null,
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

// 이 그라인더로 잰 분쇄 측정(원두별) + 올리기 — 저장한 그라인더만(영점을 알아야 표시값을 계산한다)
function measureBlock(g) {
  const list = store.list('measurements').filter((m) => m.grinderId === g.id).sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? ''));
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'field-label' }, `분쇄 측정 ${list.length}건`),
    ...list.slice(0, 5).map((m) => measureListItem(m, { showBean: true, showGrinder: false })),
    list.length > 5 ? h('div', { class: 'hint' }, `나머지 ${list.length - 5}건은 원두 화면에서 원두별로 봅니다.`) : null,
    ...measureImportButton({ grinder: g, via: 'grinder', label: '이 그라인더로 잰 측정 올리기(사진·CSV)', onDone: () => { toast('원두별 측정에 넣었습니다.'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }),
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
      h('div', { class: 'hint' }, '영점은 언제든 바꿀 수 있습니다. 이미 저장된 기록은 그때의 영점을 그대로 가집니다. 이름을 고치면 옛 기록도 따라 바뀝니다.'),
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
      h('div', { class: 'hint' }, `결과 화면에서 서버 총 무게를 재면 여기 무게를 빼서 ${WORDS.netWeight.label}를 계산합니다. 이름·무게를 고치면 그 서버를 쓴 옛 기록도 따라 바뀝니다.`),
      serverList,
      h('button', { onClick: () => serverList.append(serverRow(createServer())) }, '＋ 서버 추가'),
    ),
  );
}

// ── 드리퍼(9/26) ──────────────────────────────────────────────
// 기본 목록(data/drippers.js) · AI 답 · 직접 입력 모두 같은 칸을 쓴다(사용자 결정 — 형식 통일, AI 가 드리퍼 특징을 모를 수 있어서).
// 기록은 ID 로 가리킨다 — 이름 오타(v60 → a60)를 고치면 옛 기록도 따라 바뀐다. 기본 목록은 등록하지 않아도 추출 준비에서 바로 고른다.
export function dripperSummary(dp) {
  return [dp.shape ? DRIPPER_SHAPES[dp.shape] : null, dp.method ? DRIPPER_METHODS[dp.method].replace(/\(.*\)/, '') : null, dp.holes, dp.material, dp.cups].filter(Boolean).join(' · ');
}
function sourceKinds(dp) {
  return [...new Set((dp.sources ?? []).map((x) => SOURCE_KINDS[x.kind]).filter(Boolean))].join(' · ');
}

export function drippersScreen() {
  const list = store.list('drippers').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return h(
    'div',
    { class: 'screen' },
    beansSegment('drippers'),
    h('h1', { class: 'sr-only' }, '드리퍼'),
    backToPrep(),
    h('a', { class: 'button primary wide', href: '#/dripper/new' }, '＋ 드리퍼 등록'),
    section(
      '내 드리퍼',
      h('div', { class: 'hint' }, '추출 준비에서 고르는 드리퍼입니다. 이름을 고치면 그 드리퍼를 쓴 옛 기록도 따라 바뀝니다.'),
      ...list.map((dp) =>
        h('a', { class: 'list-row', href: `#/dripper/${dp.id}` }, h('div', null, h('div', null, dp.name), h('div', { class: 'hint' }, dripperSummary(dp) || '특징을 아직 적지 않았습니다'), sourceKinds(dp) ? h('div', { class: 'hint' }, sourceKinds(dp)) : null)),
      ),
      list.length ? null : h('div', { class: 'hint' }, '등록한 드리퍼가 없습니다.'),
    ),
    section(
      '기본 목록',
      h('div', { class: 'hint' }, `유명 드리퍼 ${DRIPPER_CATALOG.length}종입니다. 등록하지 않아도 추출 준비에서 바로 고를 수 있고, 고르면 내 드리퍼에 들어옵니다. 특징은 제조사(없으면 판매처) 페이지에 적힌 것만 넣었습니다.`),
      h(
        'details',
        { class: 'sub-details' },
        h('summary', null, '기본 목록 보기'),
        ...DRIPPER_CATALOG.map((c) =>
          h('div', { class: 'list-row' }, h('div', null, h('div', null, `${c.brand} ${c.model}`), h('div', { class: 'hint' }, [c.sizes.map(([n]) => n).join('·'), c.shape ? DRIPPER_SHAPES[c.shape] : null, DRIPPER_METHODS[c.method].replace(/\(.*\)/, '')].filter(Boolean).join(' · ')), h('div', { class: 'hint' }, SOURCE_KINDS[c.sources[0].kind]))),
        ),
      ),
    ),
  );
}

// 드리퍼 등록·수정. draft = 기본 목록·AI 로 칸을 채운 뒤 다시 그릴 때 넘기는, 아직 저장하지 않은 드리퍼
export function dripperFormScreen(id, { draft = null } = {}) {
  const existing = id === 'new' ? null : store.get('drippers', id);
  if (id !== 'new' && !existing) return h('div', { class: 'screen' }, '드리퍼를 찾을 수 없습니다.');
  const dp = draft ? structuredClone(draft) : existing ? { ...createDripper({ id: existing.id }), ...structuredClone(existing) } : createDripper();
  const startName = existing?.name ?? '';
  const redraw = () => screen.replaceWith(dripperFormScreen(id, { draft: dp }));
  const cat = dp.catalogKey ? findCatalog(dp.catalogKey) : null;

  // 기본 목록에서 고르기: 목록의 칸 값으로 채운다(이름이 비었거나 전에 자동으로 붙은 이름이면 목록 이름으로)
  async function fromCatalog() {
    const r = await pickOne({
      title: '기본 목록에서 고르기',
      hint: '제조사(없으면 판매처) 페이지에 적힌 특징만 채웁니다. 페이지에 없는 칸은 비워 둡니다.',
      items: DRIPPER_CATALOG.map((c) => ({ value: c.key, label: `${c.brand} ${c.model}`, sub: [c.sizes.map(([n]) => n).join('·'), c.shape ? DRIPPER_SHAPES[c.shape] : null, SOURCE_KINDS[c.sources[0].kind]].filter(Boolean).join(' · ') })),
      emptyText: '',
    });
    if (!r?.value) return;
    const autoBefore = !dp.name || (cat && dp.name === catalogName(cat.key, dp.size));
    Object.assign(dp, catalogFields(r.value, findCatalog(r.value).sizes[0][0]));
    if (autoBefore) dp.name = catalogName(dp.catalogKey, dp.size);
    logEvent('dripper.catalogPick', { dripperId: dp.id, key: dp.catalogKey, size: dp.size });
    redraw();
  }

  const text = (key, placeholder = '') => h('input', { type: 'text', value: dp[key] ?? '', placeholder, onInput: (e) => (dp[key] = e.target.value.trim() || null) });
  const pickChips = (words, key) =>
    chips({ options: Object.values(words), selected: dp[key] ? words[dp[key]] : null, onChange: (label) => (dp[key] = Object.keys(words).find((k) => words[k] === label) ?? null) });

  // AI 로 특징 채우기(원두 가져오기와 같은 흐름): 프롬프트 복사 → AI 앱 → 답 붙여 넣기 → 칸마다 골라 채우기(저장은 [저장])
  const aiBox = h('div', { class: 'stack' });
  const aiPaste = h('textarea', { rows: 3, placeholder: 'AI 답(JSON)을 여기에 붙여 넣기' });
  const aiFile = h('input', { type: 'file', accept: 'application/json,.json,.txt,text/plain', class: 'hidden' });
  async function aiLoad(via) {
    let raw;
    let fixes = [];
    try {
      const t = via === 'file' ? await aiFile.files[0].text() : aiPaste.value;
      aiFile.value = '';
      ({ raw, fixes } = readDripperText(t));
    } catch (e) {
      logEvent('dripper.aiImportFail', { dripperId: dp.id, stage: 'read', via, message: e.message });
      return fill(aiBox, h('div', { class: 'notice error' }, e.message));
    }
    const { value, errors, warnings } = validateDripperImport(raw);
    if (errors.length || !value) {
      logEvent('dripper.aiImportFail', { dripperId: dp.id, stage: 'check', via, errors });
      return fill(aiBox, h('div', { class: 'notice error' }, '확인이 필요합니다', h('ul', null, ...errors.map((x) => h('li', null, x)))));
    }
    const rows = dripperPatch(dp, value);
    const picked = new Set(rows.filter((r) => !r.same && !r.conflict).map((r) => r.key));
    fill(
      aiBox,
      [...fixes, ...warnings].length ? h('div', { class: 'notice' }, '고쳐 읽은 곳', h('ul', null, ...[...fixes, ...warnings].map((x) => h('li', null, x)))) : null,
      value.uncertain.length ? h('div', { class: 'notice warn' }, 'AI 가 자신 없다고 한 칸', h('ul', null, ...value.uncertain.map((x) => h('li', null, x)))) : null,
      value.sources.length ? h('div', { class: 'hint' }, `AI 가 댄 출처: ${value.sources.map((x) => x.label).join(' · ')}`) : null,
      rows.length
        ? h(
            'div',
            { class: 'stack' },
            ...rows.map((r) => {
              const box = h('input', { type: 'checkbox', checked: picked.has(r.key), disabled: r.same });
              box.addEventListener('change', () => (box.checked ? picked.add(r.key) : picked.delete(r.key)));
              return h('label', { class: `list-row pick-row${r.conflict ? ' conflict' : ''}` }, box, h('div', { class: 'grow' }, h('div', null, r.label), h('div', { class: 'hint' }, r.same ? `같음: ${r.to}` : r.from ? `지금 ${r.from} → ${r.to}` : r.to)));
            }),
            h('button', {
              type: 'button',
              class: 'primary wide',
              onClick: () => {
                applyDripperPatch(dp, value, [...picked]);
                if (!dp.name) dp.name = [dp.brand, dp.model, dp.size].filter(Boolean).join(' ');
                logEvent('dripper.aiImport', { dripperId: dp.id, via, fields: [...picked], skipped: rows.filter((r) => !picked.has(r.key)).map((r) => r.key), sources: value.sources.length, uncertain: value.uncertain.length, warnings: warnings.length });
                toast('칸을 채웠습니다. 확인한 뒤 [저장]을 눌러 주세요.');
                redraw();
              },
            }, '고른 칸 채우기'),
          )
        : h('div', { class: 'hint' }, '채울 값이 없습니다.'),
    );
  }
  aiFile.addEventListener('change', () => aiFile.files[0] && aiLoad('file'));
  const aiSection = h(
    'details',
    { class: 'card ai-bean' },
    h('summary', null, '특징을 AI 로 채우기'),
    h(
      'ol',
      { class: 'guide' },
      h('li', null, '기본 목록에 없는 드리퍼일 때 씁니다. 이름을 먼저 적고 [프롬프트 복사] → AI 앱(ChatGPT·Gemini·Claude)에 붙여 넣어 보냅니다(사진을 함께 보내도 됩니다).'),
      h('li', null, 'AI 답(JSON)을 아래 칸에 붙여 넣고 [확인하기] → 채울 칸을 고르고 [고른 칸 채우기] → [저장].'),
      h('li', null, 'AI 는 드리퍼 특징을 잘못 알 수 있어 출처 주소를 함께 받습니다. 출처가 없으면 알려 드립니다.'),
    ),
    h('button', {
      type: 'button',
      class: 'wide',
      onClick: async () => {
        const ok = await copyText(dripperPrompt(dp.name || [dp.brand, dp.model, dp.size].filter(Boolean).join(' ')));
        logEvent('dripper.aiPromptCopy', { dripperId: dp.id, ok });
        toast(ok ? '프롬프트를 복사했습니다. AI 앱에 보내 주세요.' : '복사하지 못했습니다.');
      },
    }, '프롬프트 복사'),
    aiPaste,
    h('div', { class: 'row wrap' }, h('button', { type: 'button', onClick: () => aiLoad('paste') }, '확인하기'), h('button', { type: 'button', onClick: () => aiFile.click() }, '파일에서 불러오기'), aiFile),
    aiBox,
  );

  // 저장: 기본 목록 값에서 손으로 바꾼 칸은 출처에 «직접 고친 칸»으로 남긴다(제조사 자료로 오해하지 않게). 출처가 없으면 «직접 입력».
  function save() {
    dp.name = (dp.name ?? '').trim();
    if (!dp.name) return toast('이름을 넣어 주세요.');
    if (store.list('drippers').some((x) => x.id !== dp.id && x.name === dp.name)) return toast('같은 이름의 드리퍼가 있습니다.');
    const base = dp.catalogKey ? catalogFields(dp.catalogKey, dp.size) : null;
    const edited = base ? DRIPPER_FIELDS.map(([k]) => k).filter((k) => !['material', 'note'].includes(k) && (base[k] ?? null) !== (dp[k] ?? null)) : [];
    dp.sources = (dp.sources ?? []).filter((x) => x.kind !== 'user');
    const filled = DRIPPER_FIELDS.filter(([k]) => dp[k] != null && dp[k] !== '').map(([k]) => k);
    if (edited.length) dp.sources.push({ kind: 'user', label: `직접 고친 칸: ${edited.map((k) => DRIPPER_FIELDS.find(([x]) => x === k)[1]).join('·')}`, url: null, checkedAt: null });
    else if (!dp.sources.length && filled.length) dp.sources.push({ kind: 'user', label: '직접 입력', url: null, checkedAt: null });
    store.put('drippers', dp);
    logEvent('dripper.save', { dripperId: dp.id, name: dp.name, renamedFrom: startName && startName !== dp.name ? startName : null, catalogKey: dp.catalogKey, filled, edited, via: 'form' });
    if (sessionStorage.getItem('nb.returnTo') === '#/prep') {
      sessionStorage.removeItem('nb.returnTo');
      const d = loadDraft();
      if (d) saveDraft({ ...d, dripperId: dp.id, dripper: dp.name });
      location.hash = '#/prep';
    } else location.hash = '#/drippers';
  }

  const screen = h(
    'div',
    { class: 'screen' },
    h('h1', null, existing ? '드리퍼 수정' : '드리퍼 등록'),
    h('button', { type: 'button', class: 'wide', onClick: fromCatalog }, dp.catalogKey ? '기본 목록에서 다시 고르기' : '기본 목록에서 고르기'),
    aiSection,
    section(
      null,
      field('이름 *', h('input', { type: 'text', value: dp.name ?? '', placeholder: '예: Hario V60 01 투명', onInput: (e) => (dp.name = e.target.value) })),
      field('브랜드', text('brand', '예: HARIO')),
      field('모델', text('model', '예: V60')),
      // 기본 목록에서 왔으면 크기·재질을 목록에서 고른다(크기를 바꾸면 잔 수도 목록 값으로)
      cat
        ? field('크기', chips({
            options: cat.sizes.map(([n]) => n),
            selected: dp.size,
            onChange: (v) => {
              if (!v) return redraw();
              const auto = dp.name === catalogName(cat.key, dp.size);
              dp.size = v;
              dp.cups = cat.sizes.find(([n]) => n === v)[1];
              if (auto) dp.name = catalogName(cat.key, v);
              redraw();
            },
          }), dp.cups ? `잔 수·용량: ${dp.cups}` : null)
        : field('크기', text('size', '예: 02')),
      cat ? null : field('잔 수·용량', text('cups', '예: 1~4잔')),
      cat && cat.materials.length > 1
        ? field('재질', chips({ options: cat.materials, selected: dp.material, onChange: (v) => (dp.material = v) }), '가진 드리퍼의 재질을 골라 주세요.')
        : field('재질', text('material', '예: 세라믹')),
      field('모양', pickChips(DRIPPER_SHAPES, 'shape')),
      field('추출 방식', pickChips(DRIPPER_METHODS, 'method')),
      field('구멍', text('holes', '예: 큰 구멍 1개')),
      field('안쪽 결', text('ribs', '예: 나선형 결')),
      field('필터', text('filter', '예: V60 종이 필터 02')),
      field('특징·메모', h('textarea', { rows: 2, value: dp.note ?? '', onInput: (e) => (dp.note = e.target.value) })),
    ),
    dp.sources?.length
      ? section('자료', ...dp.sources.map((x) => h('div', { class: 'source' }, `${SOURCE_KINDS[x.kind] ?? x.kind}: `, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.label) : x.label, x.checkedAt ? ` (${x.checkedAt} 확인)` : '')))
      : null,
    h('button', { class: 'primary big wide', onClick: save }, '저장'),
  );
  return screen;
}
