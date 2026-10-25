import { spawnSync } from 'node:child_process';

// Let the platform shell resolve pnpm.cmd on Windows and pnpm on Unix.
// This command is fixed; hook arguments are never interpolated into shell code.
const result = spawnSync('pnpm test:e2e', { shell: true, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
