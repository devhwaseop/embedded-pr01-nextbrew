// AI 가 준 JSON 을 너그럽게 읽는 공용 도구 — 레시피 가져오기(9/24)와 AI 제안 가져오기(9/25)가 함께 쓴다.
// 레시피 쪽에 있던 것을 문구 그대로 옮겼다(tests/core.test.mjs 의 레시피 가져오기 테스트가 같은 결과를 확인).

// 앞뒤 설명 글·```json 코드 블록을 걷어 내고 { … } 만 읽는다. 읽지 못하면 흔한 실수(둥근 따옴표·주석·끝 쉼표)를 고쳐 한 번 더 읽고,
// 고친 것은 fixes 로 돌려준다. failHint = 그래도 못 읽을 때 오류 끝에 붙일 안내.
export function readLooseJson(text, failHint) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('붙여 넣은 내용이 없습니다.');
  const fenced = t.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : t;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('JSON 을 찾지 못했습니다. AI 답에서 { 부터 } 까지가 들어 있는지 확인해 주세요.');
  const src = body.slice(a, b + 1);
  try {
    return { raw: JSON.parse(src), fixes: [] };
  } catch (first) {
    const fixes = [];
    let s2 = src;
    const fix = (re, to, what) => {
      if (re.test(s2)) {
        s2 = s2.replace(re, to);
        fixes.push(what);
      }
    };
    fix(/[“”]/g, '"', '둥근 큰따옴표(“ ”)를 곧은 따옴표로 바꿨습니다.');
    fix(/[‘’]/g, "'", "둥근 작은따옴표(‘ ’)를 곧은 따옴표로 바꿨습니다.");
    fix(/^\s*\/\/.*$/gm, '', '// 주석 줄을 뺐습니다.');
    fix(/,(\s*[}\]])/g, '$1', '닫는 괄호 앞의 쉼표를 뺐습니다.');
    try {
      return { raw: JSON.parse(s2), fixes };
    } catch {
      throw new Error(`JSON 문법 오류: ${first.message} — AI 에게 「JSON 문법만 고쳐서 다시 줘」라고 하거나, ${failHint}.`);
    }
  }
}

// 칸 읽기: err·warn 에 문장을 쌓으면서 값을 고쳐 읽는다.
export function fieldReaders(err, warn) {
  // 숫자: 따옴표에 싸인 숫자, 단위가 붙은 숫자(16g·91℃·10초), "1:10" 같은 시간은 고쳐 읽고 경고한다
    const num = (v, path, { time = false } = {}) => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v !== 'string' || v.trim() === '') return null;
      const s = v.trim();
      const m = time && s.match(/^(\d+):([0-5]\d)$/);
      if (m) {
        warn(`${path}: "${v}" 를 ${Number(m[1]) * 60 + Number(m[2])}초로 읽었습니다(시간은 초 숫자로 적는 형식입니다).`);
        return Number(m[1]) * 60 + Number(m[2]);
      }
      const u = s.match(/^(-?\d+(?:\.\d+)?)\s*(g|그램|ml|mL|℃|°C|°c|°|도|초|s|sec)?$/);
      if (u) {
        warn(`${path}: "${v}" 를 숫자 ${Number(u[1])}로 읽었습니다${u[2] ? '(단위를 뗌)' : ''}.`);
        return Number(u[1]);
      }
      err(`${path}: "${v}" 는 숫자가 아닙니다.`);
      return null;
    };
    const text = (v, path, max, { required = false } = {}) => {
      if (v == null || v === '') {
        if (required) err(`${path}: 비어 있습니다.`);
        return null;
      }
      if (typeof v !== 'string') {
        err(`${path}: 글(문자열)이어야 합니다.`);
        return null;
      }
      const s = v.trim();
      if (s.length > max) {
        warn(`${path}: ${max}자가 넘어 잘랐습니다.`);
        return s.slice(0, max);
      }
      return s;
    };
    const list = (v, path, maxItems = 10, maxLen = 200) => {
      if (v == null) return [];
      if (!Array.isArray(v)) {
        err(`${path}: 목록([ … ])이어야 합니다.`);
        return [];
      }
      return v.slice(0, maxItems).map((x, i) => text(x, `${path}[${i}]`, maxLen)).filter(Boolean);
    };
    const inRange = (v, path, lo, hi, what) => {
      if (v == null) return null;
      if (v < lo || v > hi) err(`${path}: ${v} — ${what}는 ${lo}~${hi} 사이여야 합니다.`);
      return v;
    };
  return { num, text, list, inRange };
}
