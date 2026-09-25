// 배포 파일 점검 — 서비스 워커의 오프라인 목록(SHELL)이 실제 파일과 어긋나면 설치가 통째로 실패한다.
// 파일을 추가·삭제했는데 sw.js 를 안 고친 경우를 여기서 잡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// 경로에 한글이 있어 URL.pathname 은 인코딩된 채로 나온다 → fileURLToPath 로 바꾼다
const APP = fileURLToPath(new URL('../app/', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sw = readFileSync(join(APP, 'sw.js'), 'utf8');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('SHELL 의 파일이 모두 존재한다', () => {
  for (const p of shell) {
    if (p === './') continue;
    assert.ok(existsSync(join(APP, p)), `없는 파일: ${p}`);
  }
});

test('앱의 JS·CSS·아이콘이 모두 SHELL 에 들어 있다', () => {
  const files = walk(APP)
    .map((p) => `./${relative(APP, p)}`)
    .filter((p) => /\.(js|css|png|webmanifest|html)$/.test(p) && p !== './sw.js');
  const missing = files.filter((f) => !shell.includes(f));
  assert.deepEqual(missing, [], `SHELL 에 빠진 파일: ${missing.join(', ')}`);
});

test('매니페스트의 아이콘이 존재한다', () => {
  const m = JSON.parse(readFileSync(join(APP, 'manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) assert.ok(existsSync(join(APP, i.src)), `없는 아이콘: ${i.src}`);
});

// DOM 의 replaceChildren 은 null 을 건너뛰지 않고 「null」 글자로 넣는다 — 9/24 에 원두 노트·타이머·준비 화면에서 세 번 화면에 찍혔다.
// 그래서 화면 채우기는 ui/dom.js 의 fill() 하나로 모으고, 다른 곳에서 직접 쓰면 여기서 실패한다.
test('화면 채우기는 fill() 만 쓴다(replaceChildren 직접 호출 금지)', () => {
  const bad = [];
  for (const p of walk(join(APP, 'js')).filter((f) => f.endsWith('.js'))) {
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || !code.includes('replaceChildren(')) return;
      if (p.endsWith(join('ui', 'dom.js')) && code.startsWith('el.replaceChildren(')) return; // fill() 안의 한 곳
      bad.push(`${relative(APP, p)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], `replaceChildren 을 직접 쓴 곳: ${bad.join(', ')} — fill() 을 쓰세요`);
});

// 글자 크기는 역할별 변수(--fs-*)로만 정한다(사용자 요청 9/25 — 같은 역할인데 크기가 제각각이던 것).
// 아래 목록만 예외이고, 예외에는 이유를 적는다. 그 밖에 크기를 직접 적으면 실패한다.
const FONT_SIZE_EXEMPT = {
  ':root': '역할별 크기를 정의하는 곳',
  'html, body': '본문 크기 = --fs-body 를 쓰는지 아래에서 따로 확인',
  '.stepper button': '−/+ 기호 글자 — 글이 아니라 누르는 기호라 크게',
  '.link-action .link-arrow': '화살표 기호 — 옆 글자에 맞춘 em',
  '.elapsed': '타이머: 폰을 세워 두고 멀리서 보는 경과 시간',
  '.ring-num': '타이머: 남은 초(가장 큰 숫자)',
  '.ring-step': '타이머: 원 안 단계 이름',
  '.pour-target': '타이머: 붓기 목표 g',
  '.pour-sub': '타이머: 붓기 목표 아래 속도·남은 초',
  '.ring-pour': '타이머: 원 안 «지금 저울 값»(9/25)',
  '.ring-sub': '타이머: 원 안 「초 남음」 — 원 크기에 비례(cqw)',
  '.step-hint': '타이머: 단계 설명 — 멀리서 보게 크게, 화면 높이에 비례(9/25)',
  '.next': '타이머: 「다음: …」 — 멀리서 보게 크게, 화면 높이에 비례(9/25)',
  '.timer .row .big': '타이머: 아래 버튼 — 붓는 중에 누르기 쉽게 크게(9/25)',
  '.press-ring.abort::after': '타이머: 원을 밖으로 밀 때 「놓으면 취소」 — 원 크기에 비례',
  '.google-btn': 'Google 브랜딩 가이드가 정한 14px',
  '.c-tick': '그래프(SVG) 눈금 — SVG 좌표 단위',
};
test('글자 크기는 역할별 변수만 쓴다(예외는 목록에 이유와 함께)', () => {
  const css = readFileSync(join(APP, 'css/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    for (const d of m[2].matchAll(/font-size:\s*([^;]+)/g)) {
      const v = d[1].trim();
      if (/^var\(--fs-[a-z]+\)$/.test(v)) continue;
      if (selector in FONT_SIZE_EXEMPT) continue;
      bad.push(`${selector} { font-size: ${v} }`);
    }
  }
  assert.deepEqual(bad, [], `역할 변수를 쓰지 않은 글자 크기:\n${bad.join('\n')}`);
  assert.match(css, /html, body \{[^}]*font-size: var\(--fs-body\)/);
});

