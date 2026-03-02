#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

if (process.platform !== 'darwin') {
  console.log('build:mac skipped: questa operazione è specifica per macOS.');
  process.exit(0);
}

const scriptPath = path.join(rootDir, 'scripts', 'build-macos-app.sh');
const result = spawnSync(scriptPath, [], { stdio: 'inherit', shell: true });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
