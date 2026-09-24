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
