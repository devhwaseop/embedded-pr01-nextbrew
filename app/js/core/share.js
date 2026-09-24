// AI 공유 묶음 — 기록 한 건과 비교 대상 기록을 파일 하나(JSON 또는 MD)로 묶는다(사용자 결정 9/24).
// - 담는 기록: 이번 추출 + 직전 추출(레시피·원두 무관) + 레시피와 원두가 같은 가장 최근 추출(있을 때만)
// - 같은 기록이 두 역할이면 한 번만 넣고 역할을 둘 다 적는다(AI가 두 건으로 오해하지 않게).
// - JSON = 데이터로 보관하기 좋은 형식, MD = AI에게 질문할 때 붙이기 좋은 형식. 로그는 넣지 않는다.

import { SCHEMA_VERSION, formatSec } from './schema.js';
import { APP_NAME } from './export.js';
import { beanKey } from './diff.js';
import { conditionRows, stepRows, surveyRows } from './facts.js';
import { WORDS } from './words.js';
import { formatRatio } from './recipe.js';

export const SHARE_ROLES = {
  current: '이번 추출',
  previous: '직전 추출(레시피·원두 무관)',
  sameRecipeAndBean: '레시피와 원두가 같은 가장 최근 추출',
};

export function findShareRelations(brews, current) {
  const earlier = brews
    .filter((b) => b.id !== current.id && b.timer?.startedAt < current.timer.startedAt)
    .sort((a, b) => b.timer.startedAt - a.timer.startedAt);
  const key = beanKey(current);
  return {
    previous: earlier[0] ?? null,
    sameRecipeAndBean: key ? earlier.find((b) => b.recipe.id === current.recipe.id && beanKey(b) === key) ?? null : null,
  };
}

function formatDateTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const stripMeta = ({ schemaVersion, updatedAt, ...rest }) => rest;

// scope = 'with'(비교 기록 함께) | 'single'(이 기록만)
export function buildSharePackage({ brews, beans = [], current, now = Date.now(), scope = 'with' }) {
  const rel = scope === 'single' ? { previous: null, sameRecipeAndBean: null } : findShareRelations(brews, current);
  const byId = new Map();
  const add = (b, role) => {
    if (!b) return;
    if (!byId.has(b.id)) byId.set(b.id, { roles: [], brew: b });
    byId.get(b.id).roles.push(role);
  };
  add(current, 'current');
  add(rel.previous, 'previous');
  add(rel.sameRecipeAndBean, 'sameRecipeAndBean');

  const recipes = {};
  const beanInfo = {};
  const list = [...byId.values()].map(({ roles, brew }) => {
    // 레시피 원본은 아래 recipes 에 한 번만 둔다
    const { snapshot, ...recipe } = brew.recipe;
    if (snapshot && !recipes[recipe.id]) recipes[recipe.id] = snapshot;
    const bean = brew.bean?.id ? beans.find((x) => x.id === brew.bean.id) : null;
    if (bean) beanInfo[bean.id] = stripMeta(bean);
    return { roles, ...brew, recipe };
  });

  return {
    app: APP_NAME,
    kind: 'share',
    scope,
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date(now).toISOString(),
    roles: SHARE_ROLES,
    relations: { current: current.id, previous: rel.previous?.id ?? null, sameRecipeAndBean: rel.sameRecipeAndBean?.id ?? null },
    brews: list,
    recipes,
    beans: beanInfo,
  };
}

export function shareFileName(pkg, format) {
  const cur = pkg.brews.find((b) => b.roles.includes('current'));
  const stamp = formatDateTime(cur.timer.startedAt).replace(/[-:]/g, '').replace(' ', '-');
  return `nextbrew-${stamp}.${format}`;
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
  const prev = find(pkg.relations.previous);
  const same = find(pkg.relations.sameRecipeAndBean);

  out.push(`# ${APP_NAME} 추출 기록`, '');
  out.push(`만든 시각: ${formatDateTime(Date.parse(pkg.createdAt))} · 기록 ${pkg.brews.length}건`, '');
  // 「이 기록만」이면 비교 기록이 «없는» 게 아니라 «담지 않은» 것이다 — AI 가 이전 기록이 없다고 오해하지 않게
  const none = pkg.scope === 'single' ? '담지 않음(이 기록만 공유)' : '없음';
  out.push(
    table(['역할', '기록'], [
      [SHARE_ROLES.current, brewTitle(cur)],
      [SHARE_ROLES.previous, prev ? brewTitle(prev) : none],
      [SHARE_ROLES.sameRecipeAndBean, same ? (same === prev ? '직전 추출과 같은 기록' : brewTitle(same)) : none],
    ]),
    '',
  );

  for (const b of pkg.brews) {
    out.push(`## ${b.roles.map((r) => SHARE_ROLES[r]).join(' · ')}`, '', brewTitle(b), '');
    // 글로만 읽히므로 부가 설명을 괄호로 붙인다: 「가수 (추출 후 추가한 물)」
    out.push('### 조건', '', table(['항목', '값'], conditionRows(b).map(([k, v, sub]) => [sub ? `${k} (${sub})` : k, v])), '');
    out.push(
      '### 타이머',
      '',
      table(
        ['단계', WORDS.target.label, '레시피 끝', '실제 끝', '판정'],
        stepRows(b).map((s) => [s.label, `${s.targetCumG}g`, formatSec(s.plannedEndSec), formatSec(s.actualEndSec), s.verdict?.text ?? '—']),
      ),
      '',
      `총 ${formatSec(b.timer.totalSec)} (레시피 ${formatSec(b.timer.plannedTotalSec)})`,
      '',
    );
    const s = surveyRows(b.survey);
    out.push('### 맛', '', s ? table(['항목', '값'], s) : '아직 설문하지 않았습니다.', '');
  }

  for (const r of Object.values(pkg.recipes)) {
    out.push(`## 레시피 · ${r.name}`, '');
    if (r.source?.url) out.push(`- 출처: ${r.source.url}`);
    out.push(`- 기준: 원두 ${r.refDoseG}g · 뜨거운 물 ${Math.round(r.refDoseG * r.waterRatio)}g · ${WORDS.ratio.label} ${formatRatio(r.waterRatio)} · ${r.tempC}℃${r.iceRatio ? ` · 얼음 ${Math.round(r.refDoseG * r.iceRatio)}g` : ''}`);
    if (r.grindNote) out.push(`- 분쇄: ${r.grindNote}`);
    for (const t of r.pourTips ?? []) out.push(`- ${t}`);
    out.push('', table(['단계', '시작', `${WORDS.target.label}(기준 원두량)`], r.steps.map((s, i) => [s.label, formatSec(s.startSec), `${i === r.steps.length - 1 ? Math.round(r.refDoseG * r.waterRatio) : Math.round(r.refDoseG * r.waterRatio * s.cumPct)}g`])), '');
  }

  for (const bean of Object.values(pkg.beans)) {
    out.push(`## 원두 · ${bean.name}`, '');
    const rows = [
      ['로스터', bean.roaster],
      ['나라', bean.country],
      ['지역', bean.region],
      ['생산자', bean.producer],
      ['품종', bean.variety],
      ['가공', bean.process],
      ['배전도', bean.roast],
      ['노트', (bean.notes ?? []).join(', ')],
      ['메모', bean.memo],
    ].filter(([, v]) => v);
    out.push(rows.length ? table(['항목', '값'], rows) : '등록된 정보가 없습니다.', '');
  }
  return out.join('\n');
}
