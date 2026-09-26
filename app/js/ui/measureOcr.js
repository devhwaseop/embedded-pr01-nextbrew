// 분쇄 측정 사진 글자 인식(사용자 결정 9/26 — 사진은 앱 안에서 읽는다, 인식률을 세밀하게 맞춰서).
// 엔진: Tesseract.js 7(WebAssembly, 폰 안에서 돈다 — 사진이 밖으로 나가지 않는다). 처음 한 번 엔진·한국어·영어 자료(약 4.5MB)를 받고,
// 그 뒤로는 브라우저 저장소(IndexedDB)에 둔 것을 쓴다. 사진을 고를 때만 불러온다(앱을 여는 속도와 무관).
//
// 맞춘 것(9/26 사용자 캡처 + 크기·압축·자르기를 바꾼 변형으로 실측 — docs/agent-notes/작업 체크리스트.md):
//  1) 카드 찾기: 줄마다 어두운 점의 비율로 짙은 카드를 나누고, 파란 점이 많은 카드(그래프)는 읽지 않는다 — 그래프 눈금 숫자가 값으로 섞이지 않게.
//  2) 다듬기: 카드마다 흑백 → 밝기 뒤집기(짙은 바탕의 흰 글씨를 흰 바탕 검은 글씨로) → 폭을 일정하게(글자 높이를 맞춤) → 여백.
//  3) 두 번 읽기: ① 한국어+영어로 카드 전체를 읽어 「표준편차」 글자 위치로 두 칸을 나누고,
//     ② 숫자 줄만 잘라 숫자·점·± 만 허용해 다시 읽는다. 둘이 같으면 믿을 만함, 다르면 확인 창에서 그 칸을 강조한다.
//  4) 그라인더 이름은 등록한 그라인더 이름에 가까우면 그 이름으로 붙인다(core/grindMeasure.js snapMachine).

import { parseHeaderText, parseStatsCells, decimalsIn, vote, snapMachine, measureWarnings, PHOTO_SOURCE } from '../core/grindMeasure.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
// width 1800·이진화 끔 = 9/26 변형 실측에서 가장 많이 맞힌 조합(원본·1080·558px JPEG 모두 5칸). 이진화는 작은 JPEG 의 숫자를 뭉갰다.
export const OCR_DEFAULTS = { width: 1800, retryWidth: 2400, psm: '6', digitsPsm: '8', binarize: false, pad: 24 };
// 못 읽은 카드는 retryWidth 로 한 번 더(9/26 실측: 419px·JPEG 품질 40 사진이 1800 에서는 숫자 0칸, 2400 에서 5칸)

let workerP = null;
async function getWorker(onProgress) {
  if (!workerP) {
    workerP = (async () => {
      const T = await import(TESSERACT_URL);
      const createWorker = T.createWorker ?? T.default?.createWorker;
      return createWorker(['kor', 'eng'], 1, { logger: (m) => onProgress?.(m) });
    })();
    workerP.catch(() => (workerP = null)); // 받기에 실패하면 다음에 다시 시도
  }
  return workerP;
}

const lumOf = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// 사진 → 캔버스(가로 최대 2000 — 폰 원본 사진이 커도 메모리를 아낀다)
async function toCanvas(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 2000 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

// 짙은 카드 찾기 → [{ x, y, w, h, chart }] (원본 좌표)
export function findCards(canvas) {
  const W = 300;
  const k = canvas.width / W;
  const H = Math.round(canvas.height / k);
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const sx = small.getContext('2d');
  sx.drawImage(canvas, 0, 0, W, H);
  const d = sx.getImageData(0, 0, W, H).data;
  const dark = (x, y) => lumOf(d, (y * W + x) * 4) < 110;
  // 카드 줄 = 줄 전체가 대체로 어둡거나, 카드 왼쪽 가장자리 띠(폭의 1~6% — 글자가 없는 여백)가 어두운 줄.
  // 굵은 흰 제목 줄은 전체로는 밝아서 띠로 잡는다(9/26 — 작은 사진에서 머리 카드가 두 조각 났다)
  const x0s = Math.round(W * 0.01);
  const x1s = Math.round(W * 0.06);
  const rows = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    let band = 0;
    for (let x = 0; x < W; x++) {
      const dk = dark(x, y);
      n += dk;
      if (x >= x0s && x < x1s) band += dk;
    }
    rows.push(n / W > 0.55 || band / (x1s - x0s) > 0.9);
  }
  const segs = [];
  for (let y = 0; y < H; y++) {
    if (!rows[y]) continue;
    let e = y;
    while (e + 1 < H && (rows[e + 1] || (e + 2 < H && rows[e + 2]))) e++; // 한 줄짜리 끊김은 잇는다
    if (e - y >= 12) segs.push([y, e]);
    y = e;
  }
  // 짙은 카드가 없으면(밝은 화면으로 찍은 사진) 사진 전체를 한 장으로 읽는다
  if (!segs.length) return [{ x: 0, y: 0, w: canvas.width, h: canvas.height, chart: false, invert: false }];
  return segs.map(([y0, y1]) => {
    let x0 = 0;
    let x1 = W - 1;
    const colDark = (x) => { let n = 0; for (let y = y0; y <= y1; y++) n += dark(x, y); return n / (y1 - y0 + 1); };
    while (x0 < W / 2 && colDark(x0) < 0.5) x0++;
    while (x1 > W / 2 && colDark(x1) < 0.5) x1--;
    let blue = 0;
    let all = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      all++;
      if (d[i + 2] - d[i] > 45 && d[i + 2] > 110) blue++;
    }
    return { x: Math.round(x0 * k), y: Math.round(y0 * k), w: Math.round((x1 - x0 + 1) * k), h: Math.round((y1 - y0 + 1) * k), chart: blue / all > 0.02, invert: true };
  });
}

// 카드 하나를 인식하기 좋게: 흑백 · 뒤집기 · 폭 맞추기 · (선택) 오츠 이진화 · 여백
export function prepare(canvas, card, opt = OCR_DEFAULTS) {
  const s = opt.width / card.w;
  const w = Math.round(card.w * s);
  const hgt = Math.round(card.h * s);
  const c = document.createElement('canvas');
  c.width = w + opt.pad * 2;
  c.height = hgt + opt.pad * 2;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(canvas, card.x, card.y, card.w, card.h, opt.pad, opt.pad, w, hgt);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Array(256).fill(0);
  const inside = (i) => {
    const px = (i / 4) % c.width;
    const py = Math.floor(i / 4 / c.width);
    return px >= opt.pad && px < opt.pad + w && py >= opt.pad && py < opt.pad + hgt;
  };
  for (let i = 0; i < d.length; i += 4) {
    let v = inside(i) ? lumOf(d, i) : card.invert ? 0 : 255; // 여백은 바탕색
    if (card.invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
    hist[Math.round(v)]++;
  }
  if (opt.binarize) {
    const t = otsu(hist, d.length / 4);
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > t ? 255 : 0;
  }
  x.putImageData(img, 0, 0);
  return { canvas: c, scale: s, pad: opt.pad };
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      t = i;
    }
  }
  return t;
}

const linesOf = (data) => (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));

// 값 카드: 「표준편차」 글자로 칸을 나누고, 숫자 줄을 칸별로 잘라 숫자만 다시 읽는다
async function readStats(worker, prep, opt) {
  await worker.setParameters({ tessedit_pageseg_mode: opt.psm, tessedit_char_whitelist: '', preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(prep.canvas, {}, { blocks: true, text: true });
  const lines = linesOf(data);
  const words = lines.flatMap((l) => l.words);
  const sdWord = words.find((w) => /표준|편차/.test(w.text));
  const split = sdWord ? sdWord.bbox.x0 - 10 : prep.canvas.width / 2;
  // 단어의 가운데가 어느 쪽인가로 나눈다(끝 좌표로 나누면 경계에 걸친 단어가 양쪽에서 빠진다)
  const cell = (side) => lines.map((l) => l.words.filter((w) => ((w.bbox.x0 + w.bbox.x1) / 2 < split) === (side === 'left')).map((w) => w.text).join(' ')).join('\n');
  const cells = { left: cell('left'), right: cell('right') };
  const first = parseStatsCells(cells);
  // 두 번째 읽기: 첫 읽기에서 숫자로 읽힌 단어를 하나씩 잘라 숫자·점만 허용해 다시 읽는다.
  // (줄째로 다시 읽으면 「±」가 1로, 「µm」가 숫자로 붙어 틀렸다 — 9/26 실측)
  const numWords = (side) => lines.flatMap((l) => l.words).filter((w) => decimalsIn(w.text).length && ((w.bbox.x0 + w.bbox.x1) / 2 < split) === (side === 'left')).sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const again = async (w) => {
    if (!w) return null;
    const pad = 6;
    // 단위(µm)가 붙어 읽힌 단어(「352.18um」)는 숫자 글자까지만 자른다 — 글자별 위치(symbols)로
    const digits = (w.symbols ?? []).filter((x) => /[0-9.]/.test(x.text));
    const x1 = digits.length ? Math.max(...digits.map((x) => x.bbox.x1)) : w.bbox.x1;
    const rect = { left: Math.max(0, w.bbox.x0 - pad), top: Math.max(0, w.bbox.y0 - pad), width: x1 - w.bbox.x0 + pad * 2, height: w.bbox.y1 - w.bbox.y0 + pad * 2 };
    const r = await worker.recognize(prep.canvas, { rectangle: rect });
    return decimalsIn(r.data.text)[0] ?? null;
  };
  await worker.setParameters({ tessedit_pageseg_mode: opt.digitsPsm, tessedit_char_whitelist: '0123456789.' });
  const [lw, rw] = [numWords('left'), numWords('right')];
  const second = { meanUm: await again(lw[0]), accuracyUm: await again(lw[1]), sdUm: await again(rw[0]) };
  await worker.setParameters({ tessedit_char_whitelist: '' });
  return { first, second, cells, split, text: data.text, confidence: data.confidence };
}

async function readHeader(worker, prep, opt) {
  await worker.setParameters({ tessedit_pageseg_mode: opt.psm, tessedit_char_whitelist: '', preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(prep.canvas, {}, { blocks: true, text: true });
  // 카드 오른쪽 끝까지 찬 줄은 글이 잘려 다음 줄로 넘어간 것이다 → 한글끼리면 띄지 않고 잇는다(「인도네 / 시아」 → 「인도네시아」)
  const right = prep.canvas.width - prep.pad;
  const lines = linesOf(data).map((l) => ({ text: l.text.trim(), full: l.bbox.x1 > right - prep.canvas.width * 0.04 }));
  let text = '';
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    text += i === 0 ? l.text : prev.full && /[가-힣]$/.test(prev.text) && /^[가-힣]/.test(l.text) ? l.text : `\n${l.text}`;
  });
  return { ...parseHeaderText(text), text, confidence: data.confidence };
}

// 사진 파일 → { measurement, fields(칸별 믿을 만함), raw(인식한 글 — 로그용), ms }
// knownMachines = 등록한 그라인더 이름들, onProgress(0~1, 단계 이름)
export async function readMeasurePhoto(file, { knownMachines = [], onProgress, opt = OCR_DEFAULTS } = {}) {
  const t0 = performance.now();
  onProgress?.(0.05, '엔진 준비');
  const worker = await getWorker((m) => m.status?.includes('load') && onProgress?.(0.05 + 0.25 * (m.progress ?? 0), '엔진 준비'));
  const canvas = await toCanvas(file);
  const cards = findCards(canvas);
  const text = cards.filter((c) => !c.chart);
  // 머리 카드 = 첫 글 카드, 값 카드 = 「평균」이 든 카드(없으면 마지막 글 카드)
  onProgress?.(0.35, '머리 글 읽는 중');
  let header = text.length ? await readHeader(worker, prepare(canvas, text[0], opt), opt) : null;
  if (header && header.click == null) header = await readHeader(worker, prepare(canvas, text[0], { ...opt, width: opt.retryWidth }), opt);
  onProgress?.(0.6, '값 읽는 중');
  // 값 카드는 아래에서부터 찾는다 — 「평균」·「편차」·µm 가 읽힌 카드만(그래프 가로축 숫자가 평균으로 들어가지 않게)
  let stats = null;
  const found = (r) => /평균|편차|[µu]m/.test(r.text) && r.first.meanUm != null;
  for (const width of [opt.width, opt.retryWidth]) {
    for (const card of text.slice(1).reverse()) {
      const r = await readStats(worker, prepare(canvas, card, { ...opt, width }), opt);
      if (found(r)) {
        stats = { ...r, width };
        break;
      }
    }
    if (stats) break;
  }
  onProgress?.(1, '끝');
  const mean = vote(stats?.first.meanUm ?? null, stats?.second.meanUm ?? null);
  const acc = vote(stats?.first.accuracyUm ?? null, stats?.second.accuracyUm ?? null);
  const sd = vote(stats?.first.sdUm ?? null, stats?.second.sdUm ?? null);
  const snap = snapMachine(header?.machine ?? null, knownMachines);
  const measurement = {
    source: PHOTO_SOURCE,
    fileName: file.name || null,
    machine: snap.name,
    click: header?.click ?? null,
    memo: header?.memo ?? null,
    meanUm: mean.value,
    accuracyUm: acc.value,
    sdUm: sd.value,
    meanSource: 'photo',
    sdSource: 'photo',
  };
  const warn = measureWarnings(measurement);
  return {
    measurement,
    fields: { meanUm: { sure: mean.sure && !warn.meanUm, alt: mean.alt }, accuracyUm: { sure: acc.sure && !warn.accuracyUm, alt: acc.alt }, sdUm: { sure: sd.sure && !warn.sdUm, alt: sd.alt }, click: { sure: !warn.click }, machine: { sure: Boolean(snap.name), snapped: snap.snapped } },
    warnings: warn,
    raw: { cards: cards.length, charts: cards.filter((c) => c.chart).length, boxes: cards.map((c) => [c.y, c.h, c.chart ? 'chart' : 'text']), header: header?.text ?? '', stats: stats?.text ?? '', cells: stats?.cells, split: stats?.split, width: stats?.width ?? null, first: stats?.first, second: stats?.second, conf: [header?.confidence, stats?.confidence] },
    ms: Math.round(performance.now() - t0),
  };
}

// 보관용 줄인 사진(계정에 함께 저장 — 사용자 결정 9/26 권장안). 가로 720 · JPEG 품질 0.6 → 보통 60~120KB(dataURL).
// Firestore 문서 한도(1MiB) 안에 들도록 넘으면 더 줄인다.
export async function shrinkPhoto(file, { maxW = 720, quality = 0.6, limit = 300_000 } = {}) {
  const bmp = await createImageBitmap(file);
  let w = Math.min(maxW, bmp.width);
  let q = quality;
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((bmp.height * w) / bmp.width);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    if (url.length <= limit || i === 4) {
      bmp.close?.();
      return { dataUrl: url, width: c.width, height: c.height, bytes: url.length };
    }
    w = Math.round(w * 0.8);
    q = Math.max(0.4, q - 0.05);
  }
  return null;
}
