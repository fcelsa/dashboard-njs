#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const resourcesJsDir = path.join(rootDir, 'resources', 'js');
const resourcesIconDir = path.join(rootDir, 'resources', 'icon');
mkdirSync(resourcesJsDir, { recursive: true });
mkdirSync(resourcesIconDir, { recursive: true });

const iconSource = path.join(rootDir, 'assets', 'icon', 'app-icon.png');
const iconTarget = path.join(rootDir, 'resources', 'icon', 'app-icon.png');
if (existsSync(iconSource)) {
  copyFileSync(iconSource, iconTarget);
}

const apiKeysPath = path.join(rootDir, 'resources', 'api-keys');
if (existsSync(apiKeysPath)) {
  rmSync(apiKeysPath, { recursive: true, force: true });
}

const result = spawnSync('npx', ['@neutralinojs/neu', 'update', '--latest'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}
