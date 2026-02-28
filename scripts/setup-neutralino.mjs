#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const nodeBinDir = path.dirname(process.execPath);
const npmCliPath = path.join(nodeBinDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');

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

const updateCommand = process.platform === 'win32' && existsSync(npmCliPath)
  ? {
      cmd: process.execPath,
      args: [npmCliPath, 'exec', '--', '@neutralinojs/neu', 'update', '--latest']
    }
  : {
      cmd: 'npx',
      args: ['@neutralinojs/neu', 'update', '--latest']
    };

const result = spawnSync(updateCommand.cmd, updateCommand.args, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: false
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}
