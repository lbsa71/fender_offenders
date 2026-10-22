import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const errors: string[] = [];
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]); }
for (const file of ['README.md', 'IMPLEMENTATION_PLAN.md', ...files('spec').filter(f => f.endsWith('.md'))]) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (target && !/^[a-z]+:/i.test(target) && !existsSync(resolve(dirname(file), target))) errors.push(`${file}: broken link ${target}`);
  }
}
for (const file of files('packages/sim').filter(f => f.endsWith('.ts'))) {
  const text = readFileSync(file, 'utf8');
  if (/from\s+['"](@babylonjs|@fender\/(renderer|ui|input))/.test(text)) errors.push(`${file}: simulation imports presentation`);
}
const plan = readFileSync('IMPLEMENTATION_PLAN.md', 'utf8');
const tasks = new Map<string, string[]>();
for (const line of plan.split('\n')) if (/^\| [FSNRAUGQ]\d{2} \|/.test(line)) {
  const parts = line.split('|').map(x => x.trim()); tasks.set(parts[1], parts[3].match(/[FSNRAUGQ]\d{2}/g) ?? []);
}
function visit(id: string, path: string[]) { if (path.includes(id)) { errors.push(`Task cycle ${[...path, id].join(' -> ')}`); return; } if (!tasks.has(id)) { errors.push(`Unknown task ${id}`); return; } for (const dep of tasks.get(id)!) visit(dep, [...path, id]); }
for (const id of tasks.keys()) visit(id, []);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Documentation links, ${tasks.size} task dependencies, and simulation boundaries checked.`);
