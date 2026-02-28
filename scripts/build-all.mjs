#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
  renameSync,
  chmodSync,
  copyFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNoThrow(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    ...options
  });
}

function createMacBundle(appPath, bundleId, appVersion) {
  if (!existsSync(appPath)) {
    return;
  }

  const appStat = statSync(appPath);
  if (!appStat.isFile()) {
    return;
  }

  const tmpBin = `${appPath}.bin`;
  const appName = path.basename(appPath, '.app');
  const contentsDir = path.join(appPath, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');
  const executableName = 'dashboard-njs';
  const iconSourcePng = path.join(rootDir, 'assets', 'icon', 'app-icon.png');
  const iconFilename = 'AppIcon.icns';

  renameSync(appPath, tmpBin);
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  renameSync(tmpBin, path.join(macosDir, executableName));
  chmodSync(path.join(macosDir, executableName), 0o755);

  if (existsSync(iconSourcePng)) {
    const hasSips = runNoThrow('sips', ['--version']).status === 0;
    const hasIconutil = runNoThrow('iconutil', ['-h']).status === 0;

    if (hasSips && hasIconutil) {
      const tmpDir = path.join(os.tmpdir(), `dashboard-njs-icon-${Date.now()}`);
      const iconsetDir = path.join(tmpDir, 'AppIcon.iconset');
      mkdirSync(iconsetDir, { recursive: true });

      const sizes = [
        ['16', '16', 'icon_16x16.png'],
        ['32', '32', 'icon_16x16@2x.png'],
        ['32', '32', 'icon_32x32.png'],
        ['64', '64', 'icon_32x32@2x.png'],
        ['128', '128', 'icon_128x128.png'],
        ['256', '256', 'icon_128x128@2x.png'],
        ['256', '256', 'icon_256x256.png'],
        ['512', '512', 'icon_256x256@2x.png'],
        ['512', '512', 'icon_512x512.png'],
        ['1024', '1024', 'icon_512x512@2x.png']
      ];

      for (const [h, w, filename] of sizes) {
        runNoThrow('sips', ['-z', h, w, iconSourcePng, '--out', path.join(iconsetDir, filename)]);
      }

      runNoThrow('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(resourcesDir, iconFilename)]);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  const plistPath = path.join(contentsDir, 'Info.plist');
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>it</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${appVersion}</string>
  <key>CFBundleVersion</key>
  <string>${appVersion}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
  writeFileSync(plistPath, plistContent, 'utf8');

  const plistBuddy = '/usr/libexec/PlistBuddy';
  const iconPath = path.join(resourcesDir, iconFilename);
  if (existsSync(iconPath) && existsSync(plistBuddy)) {
    runNoThrow(plistBuddy, ['-c', 'Delete :CFBundleIconFile', plistPath]);
    runNoThrow(plistBuddy, ['-c', `Add :CFBundleIconFile string ${iconFilename}`, plistPath]);
  }

  runNoThrow('codesign', ['--force', '--deep', '--sign', '-', appPath]);
}

function createLinuxDesktopLauncher(distRoot) {
  const linuxBin = path.join(distRoot, 'dashboard-njs-linux_x64');
  const iconSource = path.join(rootDir, 'assets', 'icon', 'app-icon.png');
  const iconTarget = path.join(distRoot, 'dashboard-njs-linux_x64.png');
  const desktopTarget = path.join(distRoot, 'dashboard-njs-linux_x64.desktop');

  if (!existsSync(linuxBin)) {
    return;
  }

  if (existsSync(iconSource)) {
    copyFileSync(iconSource, iconTarget);
  }

  const desktopContent = `[Desktop Entry]
Type=Application
Name=dashboard-njs
Exec=./dashboard-njs-linux_x64
Icon=./dashboard-njs-linux_x64.png
Terminal=false
Categories=Utility;
`;
  writeFileSync(desktopTarget, desktopContent, 'utf8');
}

console.log('[1/4] Setup Neutralino');
run(process.execPath, [path.join(rootDir, 'scripts', 'setup-neutralino.mjs')]);

console.log('[2/4] Build release stand-alone');
const configPath = path.join(rootDir, 'neutralino.config.json');
const buildConfigPath = path.join(rootDir, '.tmp', 'neutralino.build.config.json');
mkdirSync(path.dirname(buildConfigPath), { recursive: true });

const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.applicationIcon = 'assets/icon/app-icon.png';
writeFileSync(buildConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

run('npx', [
  '@neutralinojs/neu',
  'build',
  '--release',
  '--embed-resources',
  '--macos-bundle',
  '--clean',
  '--config-file',
  buildConfigPath
]);
rmSync(buildConfigPath, { force: true });

console.log('[3/4] Keep only requested targets');
const distRoot = path.join(rootDir, 'dist', 'dashboard-njs');
if (!existsSync(distRoot)) {
  console.error(`Release folder not found: ${distRoot}`);
  process.exit(1);
}

const keepFiles = [
  'dashboard-njs-mac_arm64',
  'dashboard-njs-mac_x64',
  'dashboard-njs-win_x64',
  'dashboard-njs-linux_x64'
];
const keepDirs = ['dashboard-njs-mac_arm64.app', 'dashboard-njs-mac_x64.app'];

for (const entry of readdirSync(distRoot, { withFileTypes: true })) {
  const entryPath = path.join(distRoot, entry.name);
  if (entry.isFile()) {
    const shouldKeep = keepFiles.some((prefix) => entry.name.startsWith(prefix));
    if (!shouldKeep) {
      rmSync(entryPath, { force: true });
    }
  } else if (entry.isDirectory()) {
    if (!keepDirs.includes(entry.name)) {
      rmSync(entryPath, { recursive: true, force: true });
    }
  }
}

console.log('[4/4] Post-processing platform artifacts');
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
if (process.platform === 'darwin') {
  createMacBundle(path.join(distRoot, 'dashboard-njs-mac_arm64.app'), 'it.fcs.dashboardnjs.macarm64', pkg.version);
  createMacBundle(path.join(distRoot, 'dashboard-njs-mac_x64.app'), 'it.fcs.dashboardnjs.macx64', pkg.version);
} else {
  console.log('Skipping macOS bundle post-processing (requires macOS tools).');
}
createLinuxDesktopLauncher(distRoot);

console.log('Done');
console.log(`Output: ${path.join(rootDir, 'dist')}`);
