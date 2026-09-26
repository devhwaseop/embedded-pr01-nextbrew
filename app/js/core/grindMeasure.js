// 분쇄도 측정 결과 가져오기(사용자 결정 9/26) — 언스페셜티 분쇄도 가이드의 [Export CSV] 파일(주 경로)과
// 결과 화면 사진([이미지 저장하기]·캡처, 앱 안 글자 인식 — ui/measureOcr.js). 이 파일은 둘 다의 «읽은 글 → 값» 부분이다(화면 없음·테스트 대상).
//
// 파일 모양(9/26 실제 파일로 확인): 머리 줄 Index,Particles,Labels,Volume Density,Count Density,Accuracy,Machine,Click,Memo,Uid
//   - 첫 줄에만: Accuracy(사진의 「± 141.31 µm」), Machine(그라인더 이름), Click, Memo(사용자가 적은 메모), Uid
//   - Labels = 입자 크기 칸(µm, 16.91 ~ 2317.99, 로그 간격 50칸), Volume Density · Count Density = 칸별 부피·개수 비율(%, 합 100)
//   - Particles = 86개 값인데 단위가 밝혀져 있지 않고 크기 칸과 맞지 않아 쓰지 않는다
//   - 파일 이름 particle-M1347.69-3525.csv 의 M 뒤 숫자 = 사진의 「평균 크기」(사이트가 낸 값 그대로)
// 사이트는 평균·표준편차 계산식을 밝히지 않는다. 칸 분포로 여러 식을 맞춰 보니 «면적 가중 평균(칸 아래 경계)» 이 가장 가까웠다
// (실측 파일: 평균 1340.1 vs 사진 1347.69, 표준편차 339.8 vs 352.18). 그래서
//   평균 = 파일 이름의 값(없으면 이 추정값), 표준편차 = 추정값을 채워 두고 가져오기 창에서 사진 값으로 고치게 한다.

export const MEASURE_SOURCE = 'unspecialty-csv';

// CSV 한 덩어리 → 줄마다 칸 배열. 따옴표(메모에 쉼표가 있을 때)·줄바꿈 CRLF·BOM 을 처리한다.
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const num = (v) => (v == null || String(v).trim() === '' ? null : Number(v));

// 누적 비율이 pct(%)에 닿는 크기(µm) — 칸 값을 그 칸의 아래 경계에 두고, 이웃 칸 사이는 로그 크기로 잇는다
function sizeAt(bins, key, pct) {
  let cum = 0;
  for (let i = 0; i < bins.length; i++) {
    const v = bins[i][key];
    if (cum + v >= pct && v > 0) {
      if (i === 0) return bins[0].um;
      const f = (pct - cum) / v;
      return Math.exp(Math.log(bins[i - 1].um) + f * (Math.log(bins[i].um) - Math.log(bins[i - 1].um)));
    }
    cum += v;
  }
  return bins[bins.length - 1]?.um ?? null;
}
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

// 칸 분포로 계산한 값들
export function measureStats(bins) {
  const w = bins.map((b) => b.count * b.um ** 2); // 면적 가중(개수 × 지름²)
  const W = w.reduce((a, x) => a + x, 0);
  const mean = W ? bins.reduce((a, b, i) => a + w[i] * b.um, 0) / W : null;
  const sd = W ? Math.sqrt(bins.reduce((a, b, i) => a + w[i] * (b.um - mean) ** 2, 0) / W) : null;
  const peak = bins.reduce((best, b) => (b.vol > (best?.vol ?? -1) ? b : best), null);
  const minCount = Math.min(...bins.map((b) => b.count).filter((c) => c > 0));
  return {
    meanEstimate: r2(mean),
    sdEstimate: r2(sd),
    d10: r2(sizeAt(bins, 'vol', 10)),
    d50: r2(sizeAt(bins, 'vol', 50)),
    d90: r2(sizeAt(bins, 'vol', 90)),
    modeUm: peak?.um ?? null,
    particles: Number.isFinite(minCount) ? Math.round(100 / minCount) : null, // 개수 비율의 최소 단위 = 1개(실측 1.1765% → 85개)
  };
}

// 파일 글 → { measurement(가져오기 창에서 확인할 값), errors }
export function readMeasureCsv(text, fileName = '') {
  const rows = parseCsv(text);
  if (rows.length < 2) return { measurement: null, errors: ['CSV 에 내용이 없습니다.'] };
  const head = rows[0].map((c) => c.trim());
  const col = (name) => head.indexOf(name);
  const need = ['Labels', 'Volume Density', 'Count Density'];
  const missing = need.filter((n) => col(n) < 0);
  if (missing.length) return { measurement: null, errors: [`언스페셜티 분쇄도 CSV 가 아닌 것 같습니다(없는 칸: ${missing.join(', ')}).`] };
  const at = (row, name) => (col(name) >= 0 ? row[col(name)] : undefined);
  const first = rows[1];
  const bins = rows
    .slice(1)
    .map((r) => ({ um: num(at(r, 'Labels')), vol: num(at(r, 'Volume Density')) ?? 0, count: num(at(r, 'Count Density')) ?? 0 }))
    .filter((b) => b.um != null && Number.isFinite(b.um))
    .sort((a, b) => a.um - b.um);
  if (!bins.length || !bins.some((b) => b.vol > 0)) return { measurement: null, errors: ['크기 분포(Volume Density)가 비어 있습니다.'] };
  const stats = measureStats(bins);
  const fromName = /-M(\d+(?:\.\d+)?)(?:-|\.csv$)/i.exec(fileName)?.[1];
  const click = num(at(first, 'Click'));
  return {
    measurement: {
      source: MEASURE_SOURCE,
      fileName: fileName || null,
      uid: at(first, 'Uid')?.trim() || null,
      machine: at(first, 'Machine')?.trim() || null,
      click: Number.isFinite(click) ? click : null,
      memo: at(first, 'Memo')?.trim() || null,
      accuracyUm: r2(num(at(first, 'Accuracy'))),
      meanUm: fromName ? Number(fromName) : stats.meanEstimate,
      meanSource: fromName ? 'fileName' : 'estimate',
      sdUm: stats.sdEstimate,
      sdSource: 'estimate',
      ...stats,
      bins: bins.map((b) => [b.um, b.vol, b.count]),
    },
    errors: [],
  };
}

// 측정한 Click 이 어떤 값인가(가져오기 창에서 사용자가 고른다 — 사용자 요청 9/26, 용어는 9/26 결정 「그라인더 표시값 / 영점 반영값」)
//   'zero' = 영점 반영값(그라인더 표시값 + 영점) → 그라인더 표시값 = Click − 영점
//   'dial' = 그라인더 표시값(그라인더에 보이는 숫자 그대로)
// 앱의 분쇄 칸은 그라인더 표시값을 적고 영점은 그라인더 설정에 있다(core/schema.js grindActual = 영점 반영값).
export function clickToDial(click, meaning, zeroOffset = 0) {
  if (click == null) return null;
  return meaning === 'zero' ? click - (zeroOffset || 0) : click;
}

// 기록의 분쇄 측정: 결과 화면에서 나중에 붙인 것이 먼저, 없으면 준비 화면에서 불러온 것
export function measurementOf(b) {
  return b?.result?.grindMeasurement ?? b?.conditions?.grind?.measurement ?? null;
}

// 그라인더 이름이 같은지(띄어쓰기·대소문자 무시) — 다르면 가져오기 창에서 알린다
export const sameMachine = (a, b) => Boolean(a && b) && a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

// ── 사진(글자 인식) → 값 ─────────────────────────────────────────────
// 언스페셜티 결과 화면(9/26 사용자 캡처로 확인): 짙은 카드 세 장 —
//   ① 머리 카드: 「분쇄도 분석 결과」 · 「KINGrinder K6 - 120」(그라인더 - Click, 줄이 바뀌어 나올 수 있다) · 메모(여러 줄)
//   ② 그래프 카드(읽지 않는다 — 원 데이터가 없어 사진을 그대로 보인다)
//   ③ 값 카드: 「평균 크기」 「1347.69 ± 141.31 µm」 · 「표준편차」 「352.18µm」
// 인식은 틀릴 수 있어 값마다 «얼마나 믿을 만한가»를 같이 내고, 확인 창에서 사진과 나란히 보여 고치게 한다.
export const PHOTO_SOURCE = 'unspecialty-photo';

// 숫자 자리에서 흔히 헷갈리는 글자를 숫자로(숫자 칸에만 쓴다): O·o→0, l·I·|→1, 쉼표→점, 띄어 읽힌 점 붙이기
export function ocrDigits(s) {
  return String(s ?? '')
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/,/g, '.')
    .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
}

// 소수 둘째 자리까지 적힌 수(사이트 표기 그대로 «1347.69»). 점이 빠지게 읽힌 «134769» 는 받지 않는다(확인 창에서 비워 둔다).
export function decimalsIn(s) {
  return [...ocrDigits(s).matchAll(/(\d{1,4}\.\d{1,2})(?!\d)/g)].map((m) => Number(m[1]));
}

// 머리 카드의 글 → { machine, click, memo }. 제목은 빼고, 「이름 - 숫자」가 처음 나오는 곳이 그라인더와 Click 이다.
// 이름과 숫자 사이 줄바꿈(「KINGrinder K6 -」 / 「120」)도 받는다. 그 뒤 글 전체가 메모다.
export function parseHeaderText(text) {
  const flat = String(text ?? '')
    .replace(/분\s*쇄\s*도\s*분\s*석\s*결\s*과/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /([A-Za-z][A-Za-z0-9 .+'/()]*?)\s*-\s*([0-9OoIl|]{1,4})(?![0-9])\s*(.*)$/.exec(flat);
  if (!m) return { machine: null, click: null, memo: flat || null };
  const click = Number(ocrDigits(m[2]));
  return { machine: m[1].trim() || null, click: Number.isFinite(click) ? click : null, memo: m[3].trim() || null };
}

// 값 카드: 줄들(글·위치) → 평균·±·표준편차. 「표준편차」 글자의 왼쪽 끝으로 두 칸을 나눈다(못 찾으면 카드 가운데).
// left = 왼쪽 칸 글(「1347.69 ± 141.31 µm」), right = 오른쪽 칸 글(「352.18µm」) — 칸 나누기는 ui/measureOcr.js 가 단어 위치로 한다.
export function parseStatsCells({ left = '', right = '' }) {
  const l = decimalsIn(String(left).replace(/[±+]/g, ' ± '));
  const r = decimalsIn(right);
  return { meanUm: l[0] ?? null, accuracyUm: l[1] ?? null, sdUm: r[0] ?? null };
}

// 읽은 값이 말이 되나(분쇄 입자 µm) — 벗어나면 확인 창에서 그 칸을 강조한다
export function measureWarnings(m) {
  const out = {};
  if (m.meanUm == null || m.meanUm < 100 || m.meanUm > 3000) out.meanUm = '평균 크기는 보통 100~3000µm 입니다.';
  if (m.accuracyUm != null && m.meanUm != null && m.accuracyUm >= m.meanUm / 2) out.accuracyUm = '± 값이 평균의 절반을 넘습니다.';
  if (m.sdUm == null || (m.meanUm != null && m.sdUm >= m.meanUm)) out.sdUm = '표준편차는 평균보다 작아야 합니다.';
  if (m.click == null || m.click < 0 || m.click > 999) out.click = 'Click 을 읽지 못했습니다.';
  return out;
}

// 두 번 읽은 값 맞춰 보기: 같으면 그 값(믿을 만함), 하나만 있으면 그 값(확인 필요), 다르면 첫 번째 읽기(확인 필요)
export function vote(a, b) {
  if (a != null && b != null) return { value: a === b ? a : a, sure: a === b, alt: a === b ? null : b };
  return { value: a ?? b ?? null, sure: false, alt: null };
}

// 인식한 그라인더 이름을 등록한 그라인더 이름에 붙인다(글자 하나둘 틀린 것 — 「KlNGrinder K6」). 가까운 게 없으면 읽은 그대로.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function snapMachine(name, known = []) {
  if (!name) return { name, snapped: false };
  const key = (s) => s.replace(/\s+/g, '').toLowerCase();
  let best = null;
  for (const k of known.filter(Boolean)) {
    const dist = editDistance(key(name), key(k));
    const rel = dist / Math.max(key(k).length, 1);
    if (rel <= 0.25 && (!best || rel < best.rel)) best = { k, rel };
  }
  return best ? { name: best.k, snapped: best.k !== name } : { name, snapped: false };
}

// 측정 사진이 맞는지(9/26 사용자 요청 — 잘못 올린 사진을 거른다): 언스페셜티 결과 화면의 특징인 µm 단위가 값 카드에 있고
// 평균 크기나 클릭 값을 하나라도 읽었어야 «측정 사진»으로 본다. 아니면 까닭을 들고 가져오기 화면이 묻는다(막지는 않는다 —
// 글자 인식이 µm 를 놓칠 수도 있어 [그래도 직접 적기]를 남긴다). 5장 실측에서 맞는 사진은 모두 통과(9/26).
export function photoCheck({ cards, headerText, statsText, measurement }) {
  const unit = /[µμu]m/.test(statsText);
  const words = /평균|편차|click/i.test(`${headerText}\n${statsText}`);
  const values = [measurement.meanUm, measurement.click].filter((v) => v != null).length;
  const reasons = [];
  if (!cards) reasons.push('결과 카드(글 상자)를 찾지 못했습니다');
  if (!unit) reasons.push('µm 단위를 찾지 못했습니다');
  if (!words) reasons.push('「평균」·「편차」·「Click」 같은 글자를 찾지 못했습니다');
  if (!values) reasons.push('평균 크기·클릭 값을 읽지 못했습니다');
  return { ok: unit && values > 0, unit, words, values, reasons };
}
