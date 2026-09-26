// 분쇄 측정 결과 불러오기 단추와 확인 창 두 개(사용자 결정 9/26) — 준비 화면 「분쇄」와 결과 화면 「분쇄 측정」이 쓴다.
// 받는 것: 언스페셜티 [Export CSV] 파일(주 경로 — 값이 정확하고 그래프 원 데이터가 있다) 또는 결과 화면 사진([이미지 저장하기]·캡처 — 앱 안 글자 인식).
// 흐름: [측정 결과 불러오기] → 파일 고르기(CSV·사진 자동 구분)
//       → ① 「이 값이 맞나요?」 사진(또는 그래프)과 읽은 값을 나란히 — 틀린 칸은 그 자리에서 고친다. 확인이 필요한 칸은 강조
//       → ② 「Click 120 은 어떤 값인가요?」 [영점 반영값] [그라인더 표시값] — 각각 그라인더 표시값이 얼마가 되는지 함께 보인다
//       → [넣기]
// 사진은 줄여서(가로 720 JPEG) 계정에 저장할 때만 기록에 함께 둔다 — 로그인하지 않은 이 기기 저장(localStorage)은 한도(약 5MB)가 작아서다.

import { h, field, stepper, toast } from './dom.js';
import { measureFigure } from './charts.js';
import { readMeasureCsv, clickToDial, sameMachine, measureWarnings, MEASURE_SOURCE, PHOTO_SOURCE } from '../core/grindMeasure.js';
import { readMeasurePhoto, shrinkPhoto } from './measureOcr.js';
import { store } from '../core/store.js';
import { logEvent } from '../core/log.js';

// 창 하나: 제목·내용·단추 → 누른 단추의 key(바깥을 누르면 null)
function sheet({ title, body, actions }) {
  return new Promise((resolve) => {
    const close = (key) => {
      back.remove();
      resolve(key);
    };
    const back = h(
      'div',
      { class: 'modal-back', onClick: (e) => e.target === back && close(null) },
      h(
        'div',
        { class: 'modal sheet', role: 'dialog', 'aria-label': title },
        h('h3', null, title),
        ...body,
        h('div', { class: 'still-actions' }, ...actions.map((a) => h('button', { type: 'button', class: a.primary ? 'primary' : '', onClick: () => close(a.key) }, a.label, a.sub ? h('span', { class: 'term-sub' }, a.sub) : null))),
      ),
    );
    document.body.append(back);
  });
}

// 읽는 동안 보이는 창(닫을 수 없다 — 끝나면 스스로 닫힌다)
function progressSheet() {
  const bar = h('progress', { max: 1, value: 0 });
  const label = h('div', { class: 'hint' }, '사진 읽는 중…');
  const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal sheet', role: 'status' }, h('h3', null, '사진 읽는 중'), bar, label, h('div', { class: 'hint' }, '처음 한 번은 글자 인식 엔진(약 4.5MB)을 받습니다. 사진은 폰 밖으로 보내지 않습니다.')));
  document.body.append(back);
  return { set: (p, text) => { bar.value = p; label.textContent = text; }, close: () => back.remove() };
}

export const MEANING_WORDS = { zero: '영점 반영값', dial: '그라인더 표시값' };
const isCsv = (f) => /\.csv$/i.test(f.name) || f.type === 'text/csv';

// 기록에 붙은 측정의 사진·그래프(CSV 면 원 데이터로 그린 그래프, 사진이면 보관한 사진)
export function measureView(m) {
  if (m.bins?.length) return measureFigure(m);
  if (m.photo?.dataUrl) return h('img', { class: 'measure-photo', src: m.photo.dataUrl, alt: '언스페셜티 분쇄도 결과 사진' });
  return null;
}

// grinder = 지금 고른 그라인더(영점·이름), via = prep|result, onDone(측정) = 확인을 마친 값
export function measureImportButton({ grinder, via, onDone }) {
  const input = h('input', { type: 'file', accept: '.csv,text/csv,image/*', class: 'hidden' });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    const kind = isCsv(f) ? 'csv' : 'photo';
    let m;
    let ocr = null;
    let photoUrl = null;
    if (kind === 'csv') {
      const r = readMeasureCsv(await f.text(), f.name);
      if (!r.measurement) {
        logEvent('grind.measureImportFail', { kind, stage: 'parse', errors: r.errors, fileName: f.name, via });
        return toast(r.errors[0]);
      }
      m = r.measurement;
    } else {
      const p = progressSheet();
      photoUrl = URL.createObjectURL(f);
      try {
        ocr = await readMeasurePhoto(f, { knownMachines: store.list('grinders').map((g) => g.name), onProgress: p.set });
        m = ocr.measurement;
      } catch (e) {
        // 엔진을 못 받았거나(오프라인) 읽기에 실패 — 빈 칸으로 열어 사진을 보며 직접 적게 한다
        logEvent('grind.measureImportFail', { kind, stage: 'ocr', message: String(e?.message ?? e), fileName: f.name, via });
        toast('사진을 읽지 못했습니다. 사진을 보며 값을 직접 적어 주세요.');
        m = { source: PHOTO_SOURCE, fileName: f.name, machine: null, click: null, memo: null, meanUm: null, accuracyUm: null, sdUm: null, meanSource: 'photo', sdSource: 'photo' };
      } finally {
        p.close();
      }
    }
    const z = grinder?.zeroOffset ?? 0;
    const read = { ...m }; // 인식한 그대로(로그: 사용자가 어느 칸을 고쳤나 — 인식률을 재는 근거)
    const v = { machine: m.machine, click: m.click, memo: m.memo, meanUm: m.meanUm, accuracyUm: m.accuracyUm, sdUm: m.sdUm };
    const finish = () => photoUrl && URL.revokeObjectURL(photoUrl);
    for (;;) {
      // ① 값 확인(사진·그래프와 나란히, 모든 칸을 고칠 수 있다)
      const sure = ocr?.fields ?? {};
      const mark = (key) => (kind === 'photo' && !sure[key]?.sure ? 'check-me' : '');
      const num = (key, label, hint, { step = 1, max = 5000, unit = 'µm', decimals = 2 } = {}) =>
        h('div', { class: mark(key) }, field(label, stepper({ value: v[key], step, min: 0, max, unit, decimals, onChange: (x) => (v[key] = x) }), hint));
      const machineInput = h('input', { type: 'text', value: v.machine ?? '', onInput: (e) => (v.machine = e.target.value.trim() || null) });
      const memoInput = h('textarea', { rows: 2, value: v.memo ?? '', onInput: (e) => (v.memo = e.target.value.trim() || null) });
      const unsure = Object.values(sure).some((x) => !x.sure);
      const ok = await sheet({
        title: '이 값이 맞나요?',
        body: [
          kind === 'photo' ? h('img', { class: 'measure-photo', src: photoUrl, alt: '올린 사진' }) : measureFigure(m),
          kind === 'photo'
            ? h('p', { class: 'hint' }, !ocr ? '사진을 보며 값을 적어 주세요.' : unsure ? '사진에서 읽은 값입니다. 테두리 칸은 두 번 읽은 값이 달랐거나 범위를 벗어나 확인이 필요합니다. 메모는 사진과 비교해 주세요.' : '사진에서 두 번 읽어 같은 값만 채웠습니다. 메모는 사진과 비교해 주세요.')
            : h('p', { class: 'hint' }, 'CSV 에서 읽은 값입니다. 표준편차는 CSV 에 없어 분포로 계산한 추정값을 채웠습니다 — 사진의 값과 다르면 고쳐 주세요.'),
          h('div', { class: mark('machine') }, field('그라인더', machineInput, grinder && v.machine && !sameMachine(grinder.name, v.machine) ? `지금 고른 그라인더(${grinder.name})와 이름이 다릅니다. 영점이 다를 수 있어요.` : null)),
          num('click', 'Click', '언스페셜티에 적은 클릭 수', { max: 999, unit: '', decimals: 0 }),
          num('meanUm', '평균 크기', kind === 'csv' ? (m.meanSource === 'fileName' ? '파일 이름에서(사이트 값)' : '분포로 계산한 추정값') : null),
          num('accuracyUm', '± (정확도)'),
          num('sdUm', '표준편차'),
          field('메모', memoInput),
        ],
        actions: [
          { key: 'ok', label: '맞아요, 다음', primary: true },
          { key: null, label: '취소' },
        ],
      });
      if (ok !== 'ok') {
        logEvent('grind.measureCancel', { kind, stage: 'confirm', via });
        return finish();
      }
      const warn = measureWarnings(v);
      if (warn.meanUm) {
        toast(`평균 크기를 확인해 주세요 — ${warn.meanUm}`);
        continue;
      }
      // ② Click 이 어떤 값인가(Click 을 모르면 묻지 않는다)
      const meaning = v.click == null ? 'dial' : await sheet({
        title: `Click ${v.click} 은 어떤 값인가요?`,
        body: [
          h('p', null, '언스페셜티에 적은 클릭 수가 영점을 반영한 값인지, 그라인더에 보이는 값인지 골라 주세요.'),
          v.memo ? h('p', { class: 'hint' }, `측정 메모: ${v.memo}`) : null,
          h('p', { class: 'hint' }, grinder ? `지금 그라인더(${grinder.name})의 영점은 ${z > 0 ? '+' : ''}${z} 입니다.` : '그라인더를 고르지 않아 영점을 0 으로 봅니다.'),
        ],
        actions: [
          { key: 'zero', label: MEANING_WORDS.zero, sub: `그라인더 표시값 ${clickToDial(v.click, 'zero', z)}` },
          { key: 'dial', label: MEANING_WORDS.dial, sub: `그라인더 표시값 ${v.click}` },
          { key: 'back', label: '값 다시 확인' },
        ],
      });
      if (meaning === 'back') continue;
      if (!meaning) {
        logEvent('grind.measureCancel', { kind, stage: 'click', via });
        return finish();
      }
      const dial = clickToDial(v.click, meaning, z);
      const photo = kind === 'photo' && store.mode === 'cloud' ? await shrinkPhoto(f).catch(() => null) : null;
      const done = {
        ...m,
        ...v,
        clickMeaning: meaning,
        dial,
        zeroOffset: z,
        grinderId: grinder?.id ?? null,
        sdSource: kind === 'csv' ? (v.sdUm === m.sdEstimate ? 'estimate' : 'user') : 'photo',
        photo: photo ? { dataUrl: photo.dataUrl, width: photo.width, height: photo.height } : null,
        importedAt: new Date().toISOString(),
      };
      const edited = Object.keys(v).filter((k) => v[k] !== read[k]);
      logEvent('grind.measureImport', {
        via, kind, fileName: m.fileName, machine: v.machine, click: v.click, clickMeaning: meaning, dial, zeroOffset: z,
        machineMismatch: Boolean(grinder && v.machine && !sameMachine(grinder.name, v.machine)),
        meanUm: v.meanUm, sdUm: v.sdUm, source: m.source ?? (kind === 'csv' ? MEASURE_SOURCE : PHOTO_SOURCE),
        edited, // 인식값에서 사용자가 고친 칸 — 사진 인식률의 근거
        ocr: ocr ? { ms: ocr.ms, cards: ocr.raw.cards, sure: Object.fromEntries(Object.entries(ocr.fields).map(([k, x]) => [k, x.sure])), readWidth: ocr.raw.width } : null,
        photoKept: Boolean(photo), photoBytes: photo?.bytes ?? null, bins: m.bins?.length ?? 0,
      });
      finish();
      toast(kind === 'photo' && !photo && store.mode !== 'cloud' ? '측정 값을 넣었습니다. 사진은 로그인해 계정에 저장할 때 함께 보관합니다.' : '측정 결과를 넣었습니다.');
      onDone(done);
      return;
    }
  });
  return [h('button', { type: 'button', class: 'wide', onClick: () => input.click() }, '측정 결과 불러오기(사진·CSV)'), input];
}

// 기록·준비 화면의 짧은 요약 한 줄
export function measureSummary(m) {
  const from = m.source === PHOTO_SOURCE ? '사진' : 'CSV';
  return `${m.machine ?? ''} Click ${m.click ?? '—'}(${MEANING_WORDS[m.clickMeaning] ?? '?'}) · 평균 ${m.meanUm ?? '—'}µm · 표준편차 ${m.sdUm ?? '—'}µm${m.d50 != null ? ` · D50 ${Math.round(m.d50)}µm` : ''} · ${from}`;
}
