// AI 공유 묶음 — 기록 한 건과 비교 대상 기록을 파일 하나(JSON 또는 MD)로 묶는다(사용자 결정 9/24).
// - 담는 기록: 이번 추출 + 직전 추출(레시피·원두 무관) + 레시피와 원두가 같은 가장 최근 추출(있을 때만)
// - 같은 기록이 두 역할이면 한 번만 넣고 역할을 둘 다 적는다(AI가 두 건으로 오해하지 않게).
// - JSON = 데이터로 보관하기 좋은 형식, MD = AI에게 질문할 때 붙이기 좋은 형식. 로그는 넣지 않는다.
// - 기록 목록에서 여러 건을 골라 한 파일로 묶을 수도 있다(9/26 사용자 요청 — buildSelectionPackage).
// - AI 공유는 «한 번의 상황 판단»이라 편향을 줄이는 것이 먼저다(9/26 사용자 판단 기준): 「선택 안 함」 항목은 값이 아니므로
//   파일에 아예 넣지 않는다(aiBrew · facts.js surveyRows). 설정의 JSON 내보내기(core/export.js)는 데이터 보관이라 형식을 맞추려고 그대로 둔다.

import { n2, SCHEMA_VERSION, formatSec, timerOf, roastLabel, profileLine, isActive, inactiveLine } from './schema.js';
import { APP_NAME } from './export.js';
import { beanKey } from './diff.js';
import { adviceFormatText, followLines } from './adviceImport.js';
import { BLEND_KINDS, blendKind, partsLine, brewBeanIds } from './blend.js';
import { DRIPPER_SHAPES, DRIPPER_METHODS, SOURCE_KINDS } from '../data/drippers.js';
import { findFilter, filterLine } from '../data/filters.js';
import { conditionRows, stepRows, surveyRows } from './facts.js';
import { WORDS } from './words.js';
import { formatRatio } from './recipe.js';

export const SHARE_ROLES = {
  current: '이번 추출',
  previous: '직전 추출(레시피·원두 무관)',
  sameBean: '원두가 같은 가장 최근 추출(레시피 무관)',
  sameRecipe: '레시피가 같은 가장 최근 추출(원두 무관)',
  sameRecipeAndBean: '레시피와 원두가 같은 가장 최근 추출',
  selected: '고른 기록',
};
// 비교 기록으로 고를 수 있는 역할(9/26 사용자 요청 — 여러 개 함께 고른다). 처음 기본 = 전과 같은 둘(직전 · 레시피·원두가 같은 최근)
export const COMPARE_ROLES = ['previous', 'sameBean', 'sameRecipe', 'sameRecipeAndBean'];
export const DEFAULT_COMPARE = ['previous', 'sameRecipeAndBean'];
export function compareOf(list) {
  const picked = (Array.isArray(list) ? list : DEFAULT_COMPARE).filter((r) => COMPARE_ROLES.includes(r));
  return COMPARE_ROLES.filter((r) => picked.includes(r)); // 순서를 고정한다
}

// AI 에게 보내는 기록 한 건: 「선택 안 함」(null) 테이스팅 항목을 빼고(맛 항목 목록 안), 분쇄 측정 사진(dataURL)은 뺀다(파일이 커지고 AI 판단에 안 쓰인다).
// 항목을 고르지 않았어도 종류·메모를 적었으면 그것만 남긴다.
export function aiSurvey(s) {
  if (!s) return s;
  const items = {};
  for (const [k, v] of Object.entries(s.items ?? {})) {
    if (v.level != null) items[k] = v;
    else if (v.kinds?.length || v.note) {
      const { level, ...rest } = v;
      items[k] = rest;
    }
  }
  // 설문 칸 이름은 형식이라 남기고 값만 null(9/26 사용자 결정 — 형식 때문에 못 빼는 자리는 null): 만족도·잡미·내 표현·노트 인식.
  // 잡미: 고른 것 → 목록, 안 고름(= 없음, 9/26 사용자 판단) → null(MD 는 「없음」 — facts.js surveyRows). offFlavorNone 은 잠시 있던 「없음」 칩의 값이라 싣지 않는다.
  const { offFlavorNone: _none, items: _, ...rest } = s;
  return {
    ...rest,
    items,
    liking: s.liking ?? null,
    offFlavors: s.offFlavors?.length ? s.offFlavors : null,
    myNotes: s.myNotes?.length ? s.myNotes : null,
    notePerception: Object.keys(s.notePerception ?? {}).length ? s.notePerception : null,
  };
}
const noPhoto = (m) => {
  if (!m?.photo) return m;
  const { photo, ...rest } = m;
  return rest;
};
export function aiBrew(b) {
  const g = b.conditions?.grind;
  return {
    ...b,
    conditions: g?.measurement ? { ...b.conditions, grind: { ...g, measurement: noPhoto(g.measurement) } } : b.conditions,
    result: b.result?.grindMeasurement ? { ...b.result, grindMeasurement: noPhoto(b.result.grindMeasurement) } : b.result,
    survey: aiSurvey(b.survey),
  };
}

export function findShareRelations(brews, current) {
  // 비활성 기록(9/27 — 실패·시험 추출 등)은 비교 기록으로 담지 않는다. 그 기록을 직접 골라 공유하는 것은 된다.
  const earlier = brews
    .filter((b) => b.id !== current.id && isActive(b) && b.timer?.startedAt < current.timer.startedAt)
    .sort((a, b) => b.timer.startedAt - a.timer.startedAt);
  const key = beanKey(current);
  return {
    previous: earlier[0] ?? null,
    sameBean: key ? earlier.find((b) => beanKey(b) === key) ?? null : null,
    sameRecipe: earlier.find((b) => b.recipe.id === current.recipe.id) ?? null,
    sameRecipeAndBean: key ? earlier.find((b) => b.recipe.id === current.recipe.id && beanKey(b) === key) ?? null : null,
  };
}

function formatDateTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const stripMeta = ({ schemaVersion, updatedAt, ...rest }) => rest;

// 이 기록에서 쓴 원두를 모두 싣는다: 블렌드 템플릿으로 섞었으면 섞은 원두들, 미리 섞은 블렌드면 그 구성 원두까지(9/26)
function addBeans(beanInfo, beans, brew) {
  const queue = brewBeanIds(brew);
  while (queue.length) {
    const id = queue.shift();
    if (beanInfo[id]) continue;
    const bean = beans.find((x) => x.id === id);
    if (!bean) continue;
    beanInfo[id] = stripMeta(bean);
    if (bean.blend?.by === 'me') queue.push(...(bean.blend.parts ?? []).map((p) => p.beanId).filter(Boolean));
  }
}
// 이 기록의 드리퍼 특징(9/26 — 기본 목록·AI·직접 입력이 같은 형식). AI 가 드리퍼를 기억으로 짐작하지 않게 함께 싣는다.
function addDripper(info, drippers, brew) {
  const id = brew.conditions?.dripperId;
  const dp = id ? drippers.find((x) => x.id === id) : null;
  if (dp && !info[id]) info[id] = stripMeta(dp);
}

// scope = 'with'(비교 기록 함께) | 'single'(단일 기록만), compare = 담을 비교 역할(COMPARE_ROLES 중 — 9/26 사용자 요청으로 고른다)
export function buildSharePackage({ brews, beans = [], drippers = [], current, now = Date.now(), scope = 'with', compare = DEFAULT_COMPARE }) {
  const roles = scope === 'single' ? [] : compareOf(compare);
  const found = scope === 'single' ? {} : findShareRelations(brews, current);
  const rel = Object.fromEntries(COMPARE_ROLES.map((r) => [r, roles.includes(r) ? found[r] ?? null : null]));
  const byId = new Map();
  const add = (b, role) => {
    if (!b) return;
    if (!byId.has(b.id)) byId.set(b.id, { roles: [], brew: b });
    byId.get(b.id).roles.push(role);
  };
  add(current, 'current');
  for (const r of roles) add(rel[r], r);

  const recipes = {};
  const beanInfo = {};
  const dripperInfo = {};
  const list = [...byId.values()].map(({ roles, brew }) => {
    // 레시피 원본은 아래 recipes 에 한 번만 둔다
    const { snapshot, ...recipe } = brew.recipe;
    if (snapshot && !recipes[recipe.id]) recipes[recipe.id] = snapshot;
    addBeans(beanInfo, beans, brew);
    addDripper(dripperInfo, drippers, brew);
    return { roles, ...aiBrew(brew), recipe };
  });

  return {
    app: APP_NAME,
    kind: 'share',
    scope,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date(now).toISOString(),
    roles: SHARE_ROLES,
    relations: { current: current.id, ...Object.fromEntries(COMPARE_ROLES.map((r) => [r, rel[r]?.id ?? null])), compare: roles },
    brews: list,
    recipes,
    beans: beanInfo,
    drippers: dripperInfo,
  };
}

// 여러 건 골라 공유(9/26 사용자 요청 — 기록 목록을 길게 눌러 고른다): 고른 기록만 시간순으로. 역할은 모두 「고른 기록」,
// relations.current = 가장 최근 것(AI 가 결과 JSON 의 brewId 로 쓴다), relations.selected = 고른 순서가 아니라 시간순 ID.
export function buildSelectionPackage({ brews, beans = [], drippers = [], ids, now = Date.now() }) {
  const picked = brews.filter((b) => ids.includes(b.id)).sort((a, b) => a.timer.startedAt - b.timer.startedAt);
  const recipes = {};
  const beanInfo = {};
  const dripperInfo = {};
  const list = picked.map((brew) => {
    const { snapshot, ...recipe } = brew.recipe;
    if (snapshot && !recipes[recipe.id]) recipes[recipe.id] = snapshot;
    addBeans(beanInfo, beans, brew);
    addDripper(dripperInfo, drippers, brew);
    return { roles: ['selected'], ...aiBrew(brew), recipe };
  });
  return {
    app: APP_NAME,
    kind: 'share',
    scope: 'selected',
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date(now).toISOString(),
    roles: { selected: SHARE_ROLES.selected },
    relations: { current: picked[picked.length - 1]?.id ?? null, previous: null, sameRecipeAndBean: null, selected: picked.map((b) => b.id) },
    brews: list,
    recipes,
    beans: beanInfo,
    drippers: dripperInfo,
  };
}

// AI 에게 보낼 기본 프롬프트(사용자 결정 9/25 — 기본 질문 = 다음 추출 조정 제안).
// kind = 'one'(기록 한 건 + 비교 기록) | 'selected'(목록에서 고른 여러 건 — 9/26). 고친 글은 종류마다 따로 남는다(설정 sharePrompt · sharePromptSelected).
// 공유 화면에서 보고·고치고·복사한다. 고친 글은 설정 sharePrompt 에 남는다(비우거나 기본으로 되돌리면 이 글).
// 공유 파일에는 AI 에게 하는 말이 없고 기록만 있어서 이 글이 질문 역할을 한다. 역할 이름은 파일 표기(SHARE_ROLES)를 그대로 쓴다.
export function defaultSharePrompt(kind = 'one') {
  const intro = kind === 'selected'
    ? [
        '첨부한 파일은 핸드드립 추출 기록 앱 NextBrew 에서 제가 고른 기록 여러 건입니다(.txt 안에 Markdown 또는 JSON, 시간순).',
        '가장 아래(가장 최근) 기록이 다음 추출의 출발점이고, 나머지는 비교용입니다. 기록 사이에 무엇이 바뀌었고 맛이 어떻게 달라졌는지 함께 봐 주세요.',
        '',
        '이 기록들을 보고 다음 추출에서 무엇을 바꾸면 좋을지 제안해 주세요.',
      ]
    : [
        '첨부한 파일은 핸드드립 추출 기록 앱 NextBrew 에서 내보낸 기록입니다(.txt 안에 Markdown 또는 JSON).',
        `「${SHARE_ROLES.current}」이 방금 내린 커피이고, ${COMPARE_ROLES.map((r) => `「${SHARE_ROLES[r]}」`).join('·')}은 비교용입니다(공유할 때 고른 것만 담깁니다). 「담지 않음」이거나 파일에 없는 역할은 없는 대로 봐 주세요.`,
        '',
        '이 기록을 보고 다음 추출에서 무엇을 바꾸면 좋을지 제안해 주세요.',
      ];
  return [
    ...intro,
    '- 한 번에 한두 가지만 바꿉니다. 분쇄(굵게·가늘게 — 그라인더 클릭이나 µm), 원두량(물은 그대로), 물 온도 중에서 고르고, 얼마나 바꿀지 숫자로 적어 주세요.',
    '- 제안마다 기록의 어떤 값(테이스팅 노트·타이머·조건)을 근거로 했는지 적어 주세요.',
    '- 기록에 없는 값은 지어내지 말고, 판단에 꼭 필요한 정보가 빠졌으면 먼저 물어봐 주세요.',
    // 9/26 사용자 요청: 추가 얼음을 안 적은 아이스 기록을 «안 넣음»으로 읽지 않게
    '- 아이스 기록의 「추가 얼음」이 「기록 안 함」이면, 마실 때 얼음을 더 넣었을 수 있지만 양은 모른다는 뜻입니다(0g 이 아닙니다).',
    // 9/26 사용자 결정: 「선택 안 함」 항목은 파일에서 뺀다 — 빠진 항목을 «없음»으로 읽지 않게
    '- 테이스팅 노트에 없는 항목은 제가 고르지 않은 것입니다. 없는 항목은 판단에 쓰지 말아 주세요.',
    '',
    // 결과를 앱으로 가져오기(사용자 결정 9/25 「둘 다」): 형식은 처음부터 주고, 결론이 나면 한 번만 묻는다
    '결론이 나면 대화 끝에 한 번만 「앱에 넣을 결과(JSON)를 드릴까요?」라고 물어봐 주세요. 제가 달라고 하면 아래 형식으로 주세요.',
    '',
    adviceFormatText(),
  ].join('\n');
}

// 공유창(navigator.share)용 이름: nextbrew-20260925-0712.md → nextbrew-20260925-0712(md).txt (사용자 요청 9/25 — 괄호 표기)
// 크롬은 허용 목록에 없는 .md·.json 파일 공유를 막는다(9/25 — screens/share.js 머리말). 내용 형식은 괄호 안에 남긴다.
export function shareSheetName(name) {
  return name.replace(/\.(md|json)$/, '($1).txt');
}

export function shareFileName(pkg, format) {
  const cur = pkg.brews.find((b) => b.id === pkg.relations.current) ?? pkg.brews[pkg.brews.length - 1];
  const stamp = formatDateTime(cur.timer.startedAt).replace(/[-:]/g, '').replace(' ', '-');
  // 여러 건 골라 공유(9/26)는 건수를 붙인다: nextbrew-20260926-0712-3brews.md
  return `nextbrew-${stamp}${pkg.scope === 'selected' ? `-${pkg.brews.length}brews` : ''}.${format}`;
}

// ── 파일 내용 ────────────────────────────────────────────────
export function toJSON(pkg) {
  return JSON.stringify(pkg, null, 2);
}

const esc = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');

function brewTitle(b) {
  return `${formatDateTime(b.timer.startedAt)} · ${b.recipe.name} · ${b.bean?.name ?? '원두 미입력'}`;
}

export function toMarkdown(pkg) {
  const out = [];
  const find = (id) => pkg.brews.find((b) => b.id === id) ?? null;
  const cur = find(pkg.relations.current);

  out.push(`# ${APP_NAME} 추출 기록`, '');
  out.push(`만든 시각: ${formatDateTime(Date.parse(pkg.createdAt))} · 기록 ${pkg.brews.length}건`, '');
  if (pkg.scope === 'selected') {
    out.push(table(['순서(시간순)', '기록'], pkg.brews.map((b, i) => [`${i + 1}${b.id === pkg.relations.current ? ' (가장 최근)' : ''}`, brewTitle(b)])), '');
  }
  // 고르지 않은 역할은 «없는» 게 아니라 «담지 않은» 것이다 — AI 가 이전 기록이 없다고 오해하지 않게 역할마다 적는다(9/26 — 역할을 고른다).
  // 같은 기록이 앞 역할에도 걸렸으면 「○○과 같은 기록」으로 적는다(파일에는 한 번만 담긴다).
  if (pkg.scope !== 'selected') {
    const chosen = pkg.relations.compare ?? COMPARE_ROLES.filter((r) => pkg.relations[r]);
    const seen = new Map([[pkg.relations.current, 'current']]);
    const rows = [[SHARE_ROLES.current, brewTitle(cur)]];
    for (const r of COMPARE_ROLES) {
      const id = pkg.relations[r];
      let v;
      if (pkg.scope === 'single') v = '담지 않음(단일 기록만 공유)';
      else if (!chosen.includes(r)) v = '담지 않음(고르지 않음)';
      else if (!id) v = '없음';
      else if (seen.has(id)) v = `「${SHARE_ROLES[seen.get(id)]}」과 같은 기록`;
      else v = brewTitle(find(id));
      if (id && !seen.has(id)) seen.set(id, r);
      rows.push([SHARE_ROLES[r], v]);
    }
    out.push(table(['역할', '기록'], rows), '');
  }

  for (const b of pkg.brews) {
    // 기록 ID: AI 가 앱에 넣을 결과(JSON)의 brewId 로 그대로 옮겨 적는다(9/25 — AI 제안 가져오기가 기록을 맞춰 본다)
    out.push(`## ${b.roles.map((r) => SHARE_ROLES[r]).join(' · ')}`, '', brewTitle(b), '', `기록 ID: ${b.id}`, '');
    // 비활성 기록(9/27): 사용자가 비교에서 뺀 기록 — 사유를 함께 적는다(AI 가 평소 기록과 같은 무게로 읽지 않게)
    if (b.inactive) out.push(`- 비활성 기록(사용자가 비교·제안에서 뺀 기록)${inactiveLine(b) ? `: ${inactiveLine(b)}` : ''}`, '');
    // 글로만 읽히므로 부가 설명을 괄호로 붙인다: 「가수 (추출 후 추가한 물)」
    out.push('### 조건', '', table(['항목', '값'], conditionRows(b).map(([k, v, sub]) => [sub ? `${k} (${sub})` : k, v])), '');
    // 필터 특징(9/26 — 기본 목록의 필터면 제조사 자료의 특징을 한 줄로)
    const fc = findFilter(b.conditions?.filter);
    if (fc) out.push(`- 필터 특징(제조사 자료): ${filterLine(fc)}`, '');
    // 따른 AI 제안(9/26): 어느 기록의 제안을 따랐는지 · 맞춘 값 · 맞춘 뒤 손으로 바꾼 칸 · 그때 제안 요약
    const fa = b.followedAdvice;
    if (fa) {
      out.push(...[
        '### 따른 AI 제안',
        '',
        `- ${fa.fromStartedAt ? formatDateTime(fa.fromStartedAt) : '이전'} 추출(기록 ID: ${fa.fromBrewId})의 AI 제안대로 맞춰 내렸습니다.`,
        ...followLines(fa).map((l) => `- ${l}`),
        fa.dialSkipped ? '- 제안이 달린 기록과 그라인더가 달라 그라인더 표시값은 맞추지 않았습니다.' : null,
        fa.advice?.summary ? `- 그때 제안: ${fa.advice.summary}` : null,
        '',
      ].filter((x) => x !== null));
    }
    out.push(
      '### 타이머',
      '',
      table(
        ['단계', WORDS.target.label, '레시피 끝', '실제 끝', '판정'],
        stepRows(b).map((s) => [s.label, `${n2(s.targetCumG)}g`, formatSec(s.plannedEndSec), formatSec(s.actualEndSec), s.verdict?.text ?? '—']),
      ),
      '',
      `총 ${formatSec(timerOf(b).totalSec)} (레시피 ${formatSec(b.timer.plannedTotalSec)})`,
      '',
    );
    const s = surveyRows(b.survey);
    out.push('### 맛', '', s ? table(['항목', '값'], s) : '아직 테이스팅 노트를 쓰지 않았습니다.', '');
  }

  for (const r of Object.values(pkg.recipes)) {
    out.push(`## 레시피 · ${r.name}`, '');
    if (r.source?.url) out.push(`- 출처: ${r.source.url}`);
    out.push(`- 기준: 원두 ${n2(r.refDoseG)}g · 뜨거운 물 ${Math.round(r.refDoseG * r.waterRatio)}g · ${WORDS.ratio.label} ${formatRatio(r.waterRatio)} · ${r.tempC}℃${r.iceRatio ? ` · 얼음 ${Math.round(r.refDoseG * r.iceRatio)}g` : ''}`);
    if (r.grindNote) out.push(`- 분쇄: ${r.grindNote}`);
    for (const t of r.pourTips ?? []) out.push(`- ${t}`);
    out.push('', table(['단계', '시작', `${WORDS.target.label}(기준 원두량)`], r.steps.map((s, i) => [s.label, formatSec(s.startSec), `${i === r.steps.length - 1 ? Math.round(r.refDoseG * r.waterRatio) : Math.round(r.refDoseG * r.waterRatio * s.cumPct)}g`])), '');
  }

  for (const bean of Object.values(pkg.beans)) {
    out.push(`## 원두 · ${bean.name}`, '');
    const rows = [
      ['로스터', bean.roaster],
      // 블렌드(9/26): 종류와 구성 — 로스터리 블렌드는 산지별, 내가 섞은 블렌드는 섞은 원두별 무게
      ['종류', blendKind(bean) !== 'single' ? BLEND_KINDS[blendKind(bean)] : ''],
      ['구성', blendKind(bean) === 'roaster' ? partsLine(bean.blend.parts, { kind: 'origin' }) : blendKind(bean) === 'me' ? partsLine(bean.blend.parts) : ''],
      ['나라', bean.country],
      ['지역', bean.region],
      ['생산자', bean.producer],
      ['품종', bean.variety],
      ['가공방식', bean.process],
      ['배전도', roastLabel(bean)],
      // 디카페인은 켰을 때만(꺼짐 = 기본값이라 적지 않는다), 로스터리 맛 지표는 척도와 함께(9/26)
      ['디카페인', bean.decaf ? '예' : ''],
      // 제조일·개봉일·보관은 봉투에 있어(9/26 B안) 각 기록의 「원두 상태」 줄(그 추출 때 일수)로 나간다
      ['노트', (bean.notes ?? []).join(', ')],
      ['로스터리 맛 지표', profileLine(bean.roasterProfile)],
      ['메모', bean.memo],
    ].filter(([, v]) => v);
    out.push(rows.length ? table(['항목', '값'], rows) : '등록된 정보가 없습니다.', '');
  }

  // 드리퍼 특징(9/26): 자료 종류(제조사·판매처·AI·직접 입력)를 함께 적어 어디서 온 값인지 보이게
  for (const dp of Object.values(pkg.drippers ?? {})) {
    out.push(`## 드리퍼 · ${dp.name}`, '');
    const rows = [
      ['제품', [dp.brand, dp.model, dp.size !== '기본' ? dp.size : null].filter(Boolean).join(' ')], // 크기가 하나뿐인 제품의 「기본」은 적지 않는다
      ['잔 수·용량', dp.cups],
      ['모양', dp.shape ? DRIPPER_SHAPES[dp.shape] : ''],
      ['추출 방식', dp.method ? DRIPPER_METHODS[dp.method] : ''],
      ['구멍', dp.holes],
      ['안쪽 결', dp.ribs],
      ['재질', dp.material],
      ['필터', dp.filter],
      ['특징', dp.note],
      ['자료', (dp.sources ?? []).map((x) => `${SOURCE_KINDS[x.kind] ?? x.kind}${x.url ? ` ${x.url}` : ''}`).join(' · ')],
    ].filter(([, v]) => v);
    out.push(rows.length ? table(['항목', '값'], rows) : '특징을 적지 않은 드리퍼입니다(이름만).', '');
  }
  return out.join('\n');
}
