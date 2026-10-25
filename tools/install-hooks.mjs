import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

// CI/container source archives do not install developer-machine Git hooks.
if (!process.env.CI && existsSync('.git')) {
  const lookup = spawnSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' });
  if (lookup.error || (lookup.status !== 0 && lookup.status !== 1)) throw lookup.error ?? new Error(lookup.stderr);
  const existing = lookup.stdout.trim();
  if (existing && existing !== '.githooks') {
    throw new Error(`Existing core.hooksPath=${existing}; add "pnpm test:e2e" to that pre-push hook or configure .githooks explicitly.`);
  }
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks']);
  console.log('Installed local pre-push E2E checks.');
}
