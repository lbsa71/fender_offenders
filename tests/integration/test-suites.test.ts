import { globSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import config from '../../vitest.config';

it('assigns every headless test to exactly one unit or integration suite', () => {
  const projects = config.test?.projects as { test: { name: string; include: string[]; exclude?: string[] } }[] | undefined;
  expect(projects?.map(project => project.test.name)).toEqual(['unit', 'integration']);
  const selected = projects!.map(({ test }) => {
    const excluded = new Set(globSync(test.exclude?.filter(pattern => pattern.endsWith('.test.ts')) ?? []));
    return new Set(globSync(test.include).filter(file => !excluded.has(file)));
  });
  const all = globSync(['packages/**/*.test.ts', 'tests/**/*.test.ts']);
  for (const file of all) expect(selected.filter(suite => suite.has(file)), file).toHaveLength(1);
  for (const file of globSync(['packages/sim/**/*.test.ts', 'tests/hosting/**/*.test.ts', 'tests/prediction/**/*.test.ts'])) {
    expect(selected[1].has(file), `${file} uses real adapters`).toBe(true);
  }
  for (const file of selected[0]) {
    expect(readFileSync(file, 'utf8'), `${file} must remain isolated`).not.toMatch(/NullEngine|initPhysics|createGameServer|server\.listen\(/);
  }
});

it('discovers each source test once without following workspace dependency copies', () => {
  const listed = spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'list', '--filesOnly', '--json'], { encoding: 'utf8' });
  expect(listed.status, listed.stderr).toBe(0);
  const discovered = (JSON.parse(listed.stdout) as { file: string }[]).map(test => test.file.replaceAll('\\', '/')).sort();
  const source = globSync(['packages/**/*.test.ts', 'tests/**/*.test.ts']).map(file => resolve(file).replaceAll('\\', '/')).sort();
  expect(discovered).toEqual(source);
});

it('keeps browser checks local while CI runs both headless suites and production smoke', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(workflow).not.toMatch(/playwright|test:e2e|Chrome|ui\/dev\/.+smoke/);
  expect(workflow).toContain('pnpm test:unit');
  expect(workflow).toContain('pnpm test:integration');
  expect(workflow).toContain('pnpm test:deploy');
});

it('packages the app without rerunning CI validation on the hosting builder', () => {
  const dockerfile = readFileSync('infra/Dockerfile', 'utf8');
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const blueprint = readFileSync('render.yaml', 'utf8');
  expect(dockerfile).toContain('pnpm install --frozen-lockfile');
  expect(dockerfile).toContain('pnpm build');
  expect(dockerfile).not.toMatch(/pnpm\s+(?:check|test(?::[\w-]+)?)(?:\s|$)/);
  expect(workflow).toContain('needs: verify');
  expect(workflow).toContain('pnpm check');
  expect(workflow).toContain('pnpm test:unit');
  expect(workflow).toContain('pnpm test:integration');
  expect(workflow).toContain('pnpm test:deploy');
  expect(blueprint).toContain('autoDeployTrigger: checksPass');
});
