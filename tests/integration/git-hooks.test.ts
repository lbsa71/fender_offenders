import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

const installer = resolve('tools/install-hooks.mjs');
const hook = resolve('.githooks/pre-push');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== resolve(tmpdir()) || !root.includes('fender-test-hooks-')) throw new Error('Unexpected fixture path');
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'fender-test-hooks-')); roots.push(root);
  const env = { ...process.env, CI: '', GIT_CONFIG_GLOBAL: join(root, 'empty-config'), GIT_CONFIG_NOSYSTEM: '1' };
  writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
  expect(git('init', '--template=').status).toBe(0);
  mkdirSync(join(root, '.githooks')); copyFileSync(hook, join(root, '.githooks/pre-push'));
  mkdirSync(join(root, 'tools')); copyFileSync(resolve('tools/pre-push.mjs'), join(root, 'tools/pre-push.mjs'));
  const install = () => spawnSync(process.execPath, [installer], { cwd: root, env, encoding: 'utf8' });
  return { root, env, git, install };
}

it('installs in a fresh checkout and blocks a push when local E2E fails', () => {
  const { root, env, git, install } = fixture();
  const result = install(); expect(result.status, result.stderr).toBe(0);
  expect(git('config', '--get', 'core.hooksPath').stdout.trim()).toBe('.githooks');
  const bin = join(root, 'bin'); mkdirSync(bin);
  // Exercise Git's actual hook/exit handling without starting browsers in CI.
  if (process.platform === 'win32') writeFileSync(join(bin, 'pnpm.cmd'), '@echo off\r\necho %*>>"%HOOK_RECORD%"\r\nexit /b %HOOK_EXIT%\r\n');
  else writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOOK_RECORD"\nexit "$HOOK_EXIT"\n', { mode: 0o755 });
  Object.assign(env, { PATH: `${bin}${delimiter}${process.env.PATH}`, HOOK_RECORD: join(root, 'calls'), HOOK_EXIT: '7' });
  expect(git('init', '--bare', '--template=', 'remote.git').status).toBe(0);
  expect(git('-c', 'user.name=Hook test', '-c', 'user.email=hook@example.test', 'commit', '--allow-empty', '-m', 'fixture').status).toBe(0);
  expect(git('remote', 'add', 'origin', join(root, 'remote.git')).status).toBe(0);
  expect(git('push', 'origin', 'HEAD:refs/heads/main').status).not.toBe(0);
  expect(git('ls-remote', '--heads', 'origin', 'main').stdout.trim()).toBe('');
  expect(existsSync(join(root, 'calls')), 'the platform package-manager wrapper must execute').toBe(true);
  expect(readFileSync(join(root, 'calls'), 'utf8').trim()).toBe('test:e2e');
  Object.assign(env, { HOOK_EXIT: '0' });
  const pushed = git('push', 'origin', 'HEAD:refs/heads/main'); expect(pushed.status, pushed.stderr).toBe(0);
  expect(git('ls-remote', '--heads', 'origin', 'main').stdout).toContain('refs/heads/main');
});

it('does not install developer hooks in CI or overwrite a custom hook path', () => {
  const { env, git, install } = fixture();
  env.CI = 'true'; expect(install().status).toBe(0);
  expect(git('config', '--get', 'core.hooksPath').status).toBe(1);
  env.CI = ''; expect(git('config', 'core.hooksPath', 'custom-hooks').status).toBe(0);
  expect(install().status).not.toBe(0);
  expect(git('config', '--get', 'core.hooksPath').stdout.trim()).toBe('custom-hooks');
});
