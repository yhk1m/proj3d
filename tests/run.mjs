// tests/run.mjs — Node 에서 검증 항목을 돌린다: `npm test`
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runAll } from './suite.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadJSON = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));

const results = await runAll({ loadJSON });
let fail = 0;
let section = '';
for (const r of results) {
  if (r.section !== section) { section = r.section; console.log(`\n## ${section}`); }
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  if (!r.pass) fail++;
}
console.log(`\n${results.length - fail}/${results.length} 통과${fail ? `, ${fail} 실패` : ''}`);
process.exit(fail ? 1 : 0);
