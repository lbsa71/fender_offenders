import { spawn } from 'node:child_process';
const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const processes = ['dev:server', 'dev:client'].map(script => spawn(executable, [script], { stdio: 'inherit', shell: process.platform === 'win32' }));
let closing = false;
function shutdown(code = 0) {
  if (closing) return; closing = true;
  for (const child of processes) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500).unref();
}
process.on('SIGINT', () => shutdown()); process.on('SIGTERM', () => shutdown());
for (const child of processes) child.on('exit', code => shutdown(code ?? 1));
console.log('Fender Offenders: client http://127.0.0.1:5173 · server http://127.0.0.1:2567');
