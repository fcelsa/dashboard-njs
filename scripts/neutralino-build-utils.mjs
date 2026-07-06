import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const nodeBinDir = path.dirname(process.execPath);
const npmCliPath = path.join(nodeBinDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const distRoot = path.join(rootDir, 'dist', 'dashboard-njs');
const binStashRoot = path.join(rootDir, '.bin-stash');
const packageJsonPath = path.join(rootDir, 'package.json');
const neutralinoConfigPath = path.join(rootDir, 'neutralino.config.json');
const buildConfigPath = path.join(rootDir, '.tmp', 'neutralino.build.config.json');
const binDir = path.join(rootDir, 'bin');
const buildAllTargets = ['macos', 'windows', 'linux'];
const macosBuildTargets = ['macos-arm64', 'macos-x64'];
const appPngIconAsset = 'dashboard-njs.png';
const appIcnsIconAsset = 'dashboard-njs.icns';
const defaultReleaseOutputs = [
  'dashboard-njs-mac_arm64.app',
  'dashboard-njs-mac_x64.app',
  'dashboard-njs-win_x64.exe',
  'dashboard-njs-linux_x64'
];

const TARGETS = {
  all: ['dashboard-njs-mac_arm64', 'dashboard-njs-mac_x64', 'dashboard-njs-win_x64', 'dashboard-njs-linux_x64'],
  macos: ['dashboard-njs-mac_arm64', 'dashboard-njs-mac_x64'],
  'macos-arm64': ['dashboard-njs-mac_arm64'],
  'macos-x64': ['dashboard-njs-mac_x64'],
  linux: ['dashboard-njs-linux_x64'],
  windows: ['dashboard-njs-win_x64']
};

const TARGET_BINARIES = {
  'macos-arm64': ['neutralino-mac_arm64'],
  'macos-x64': ['neutralino-mac_x64'],
  windows: ['neutralino-win_x64.exe'],
  linux: ['neutralino-linux_x64']
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNoThrow(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'ignore',
    shell: false,
    ...options
  });
}

function runNeu(args) {
  const command = process.platform === 'win32' && existsSync(npmCliPath)
    ? {
        cmd: process.execPath,
        args: [npmCliPath, 'exec', '--', '@neutralinojs/neu', ...args]
      }
    : {
        cmd: 'npx',
        args: ['@neutralinojs/neu', ...args]
      };

  run(command.cmd, command.args);
}

function refreshNeutralinoRuntime(useLatest = false) {
  const args = ['update'];

  if (useLatest) {
    args.push('--latest');
  }

  runNeu(args);
}

function isEnabledEnvValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function shouldRefreshBeforeBuild() {
  return !isEnabledEnvValue(process.env.SKIP_NEUTRALINO_REFRESH);
}

function parseRequiredOutputs(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRequiredOutputs(target) {
  const scopedEnvName = target === 'all'
    ? 'BUILD_REQUIRED_OUTPUTS_ALL'
    : `BUILD_REQUIRED_OUTPUTS_${target.toUpperCase()}`;

  if (process.env[scopedEnvName]) {
    return parseRequiredOutputs(process.env[scopedEnvName]);
  }

  if (process.env.BUILD_REQUIRED_OUTPUTS) {
    return parseRequiredOutputs(process.env.BUILD_REQUIRED_OUTPUTS);
  }

  if (isEnabledEnvValue(process.env.CI) && target === 'all') {
    return [...defaultReleaseOutputs];
  }

  return [];
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return String(pkg.version || '').trim();
}

function createBuildConfig() {
  const config = JSON.parse(readFileSync(neutralinoConfigPath, 'utf8'));
  const iconPath = path.join(rootDir, 'assets', 'icon', appPngIconAsset);

  if (existsSync(iconPath)) {
    config.applicationIcon = `assets/icon/${appPngIconAsset}`;
  }

  mkdirSync(path.dirname(buildConfigPath), { recursive: true });
  writeFileSync(buildConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return buildConfigPath;
}

function cleanupBuildConfig() {
  rmSync(buildConfigPath, { force: true });
}

function pruneDist(target) {
  const keepPrefixes = TARGETS[target];

  if (!existsSync(distRoot)) {
    throw new Error(`Release folder not found: ${distRoot}`);
  }

  for (const entry of readdirSync(distRoot, { withFileTypes: true })) {
    const entryPath = path.join(distRoot, entry.name);
    if (entry.name === 'resources.neu') {
      continue;
    }

    const shouldKeep = keepPrefixes.some((prefix) => entry.name.startsWith(prefix));

    if (shouldKeep) {
      continue;
    }

    rmSync(entryPath, { recursive: true, force: true });
  }
}

function ensureArtifactsPresent(target) {
  const expectedPrefixes = TARGETS[target];
  const producedEntries = readdirSync(distRoot, { withFileTypes: true }).map((entry) => entry.name);
  const foundEntries = producedEntries.filter((name) => expectedPrefixes.some((prefix) => name.startsWith(prefix)));

  if (foundEntries.length === 0) {
    const availableOutputs = producedEntries.length > 0 ? producedEntries.join(', ') : 'none';
    throw new Error(
      `neu build did not generate artifacts for target "${target}". Available outputs: ${availableOutputs}. `
      + 'Run npm run neutralino:update if the framework binaries need to be refreshed or upgraded.'
    );
  }
}

function ensureRequiredOutputs(target) {
  const requiredOutputs = getRequiredOutputs(target);

  if (requiredOutputs.length === 0) {
    return;
  }

  const missingOutputs = requiredOutputs.filter((entry) => !existsSync(path.join(distRoot, entry)));

  if (missingOutputs.length > 0) {
    throw new Error(
      `Missing required release outputs for target "${target}": ${missingOutputs.join(', ')}. `
      + `Expected outputs were checked in ${distRoot}.`
    );
  }
}

function withTargetBinaries(target, callback) {
  const keepNames = new Set([...(TARGET_BINARIES[target] || []), '.tmp', 'neutralinojs.log']);
  const stashDir = path.join(binStashRoot, `bin-${target}-${Date.now()}`);

  mkdirSync(stashDir, { recursive: true });

  for (const entry of readdirSync(binDir, { withFileTypes: true })) {
    if (keepNames.has(entry.name)) {
      continue;
    }

    renameSync(path.join(binDir, entry.name), path.join(stashDir, entry.name));
  }

  try {
    callback();
  } finally {
    for (const entry of readdirSync(stashDir, { withFileTypes: true })) {
      renameSync(path.join(stashDir, entry.name), path.join(binDir, entry.name));
    }

    rmSync(stashDir, { recursive: true, force: true });
  }
}

function copyDirectoryContents(sourceDir, destinationDir) {
  mkdirSync(destinationDir, { recursive: true });

  if (!existsSync(sourceDir)) {
    return;
  }

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    cpSync(path.join(sourceDir, entry.name), path.join(destinationDir, entry.name), {
      recursive: true,
      force: true
    });
  }
}

function buildSingleTarget(target, options = {}) {
  const { refreshRuntime = true } = options;

  validateTarget(target);
  prepareProjectResources();

  if (refreshRuntime) {
    refreshNeutralinoRuntime(false);
  }

  const configPath = createBuildConfig();
  const buildArgs = ['build', '--release', '--clean'];

  if (target !== 'windows') {
    buildArgs.push('--embed-resources');
  }

  if (shouldCreateMacBundle(target)) {
    buildArgs.push('--macos-bundle');
  }

  buildArgs.push('--config-file', configPath);

  try {
    withTargetBinaries(target, () => {
      runNeu(buildArgs);
    });
  } finally {
    cleanupBuildConfig();
  }

  ensureArtifactsPresent(target);
  pruneDist(target);
  postProcessDist(target);

  console.log(`Desktop build completed for target: ${target}`);
  console.log(`Output: ${distRoot}`);
}

function buildAllDesktopTargets() {
  const collectedDistRoot = path.join(rootDir, '.tmp', 'dist-all', 'dashboard-njs');
  let refreshRuntime = shouldRefreshBeforeBuild();

  rmSync(collectedDistRoot, { recursive: true, force: true });

  for (const target of buildAllTargets) {
    if (target === 'macos') {
      buildMacosTargets({ refreshRuntime, verifyOutputs: false });
    } else {
      buildSingleTarget(target, { refreshRuntime });
    }

    refreshRuntime = false;
    copyDirectoryContents(distRoot, collectedDistRoot);
  }

  rmSync(distRoot, { recursive: true, force: true });
  mkdirSync(distRoot, { recursive: true });
  copyDirectoryContents(collectedDistRoot, distRoot);
  rmSync(path.join(rootDir, '.tmp', 'dist-all'), { recursive: true, force: true });

  ensureRequiredOutputs('all');

  console.log('Desktop build completed for target: all');
  console.log(`Output: ${distRoot}`);
}

function buildMacosTargets(options = {}) {
  const { refreshRuntime = true, verifyOutputs = true } = options;
  const collectedDistRoot = path.join(rootDir, '.tmp', 'dist-macos', 'dashboard-njs');
  let shouldRefresh = refreshRuntime;

  rmSync(collectedDistRoot, { recursive: true, force: true });

  for (const target of macosBuildTargets) {
    buildSingleTarget(target, { refreshRuntime: shouldRefresh });
    shouldRefresh = false;
    copyDirectoryContents(distRoot, collectedDistRoot);
  }

  rmSync(distRoot, { recursive: true, force: true });
  mkdirSync(distRoot, { recursive: true });
  copyDirectoryContents(collectedDistRoot, distRoot);
  rmSync(path.join(rootDir, '.tmp', 'dist-macos'), { recursive: true, force: true });

  if (verifyOutputs) {
    ensureRequiredOutputs('macos');
  }

  console.log('Desktop build completed for target: macos');
  console.log(`Output: ${distRoot}`);
}

function createMacBundle(appPath, bundleId, appVersion) {
  if (!existsSync(appPath)) {
    return;
  }

  const appStat = statSync(appPath);
  if (!appStat.isFile()) {
    return;
  }

  const bundlePath = appPath.endsWith('.app') ? appPath : `${appPath}.app`;
  const tempBinaryPath = appPath.endsWith('.app') ? `${appPath}.bin` : appPath;
  const appName = path.basename(bundlePath, '.app');
  const contentsDir = path.join(bundlePath, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');
  const executableName = 'dashboard-njs';
  const macosIconSourcePath = path.join(rootDir, 'assets', 'icon', appIcnsIconAsset);
  const iconFilename = appIcnsIconAsset;
  const resourceArchivePath = path.join(distRoot, 'resources.neu');

  if (appPath.endsWith('.app')) {
    renameSync(appPath, tempBinaryPath);
  }

  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  renameSync(tempBinaryPath, path.join(macosDir, executableName));
  chmodSync(path.join(macosDir, executableName), 0o755);

  if (existsSync(resourceArchivePath)) {
    copyFileSync(resourceArchivePath, path.join(macosDir, 'resources.neu'));
  }

  if (existsSync(macosIconSourcePath)) {
    copyFileSync(macosIconSourcePath, path.join(resourcesDir, iconFilename));
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

  runNoThrow('codesign', ['--force', '--deep', '--sign', '-', bundlePath]);
}

function createLinuxDesktopLauncher() {
  const linuxBinaryPath = path.join(distRoot, 'dashboard-njs-linux_x64');
  const iconSourcePath = path.join(rootDir, 'assets', 'icon', appPngIconAsset);
  const iconTargetPath = path.join(distRoot, 'dashboard-njs-linux_x64.png');
  const desktopTargetPath = path.join(distRoot, 'dashboard-njs-linux_x64.desktop');

  if (!existsSync(linuxBinaryPath)) {
    return;
  }

  if (existsSync(iconSourcePath)) {
    copyFileSync(iconSourcePath, iconTargetPath);
  }

  const desktopContent = `[Desktop Entry]
Type=Application
Name=dashboard-njs
Exec=./dashboard-njs-linux_x64
Icon=./dashboard-njs-linux_x64.png
Terminal=false
Categories=Utility;
`;

  writeFileSync(desktopTargetPath, desktopContent, 'utf8');
}

function postProcessDist(target) {
  const version = readPackageVersion();
  const includesMacos = target === 'all' || target === 'macos' || target === 'macos-arm64' || target === 'macos-x64';
  const includesLinux = target === 'all' || target === 'linux';

  if (includesMacos && process.platform === 'darwin') {
    const macArm64Path = existsSync(path.join(distRoot, 'dashboard-njs-mac_arm64.app'))
      ? path.join(distRoot, 'dashboard-njs-mac_arm64.app')
      : path.join(distRoot, 'dashboard-njs-mac_arm64');
    const macX64Path = existsSync(path.join(distRoot, 'dashboard-njs-mac_x64.app'))
      ? path.join(distRoot, 'dashboard-njs-mac_x64.app')
      : path.join(distRoot, 'dashboard-njs-mac_x64');

    createMacBundle(macArm64Path, 'it.fcs.dashboardnjs.macarm64', version);
    createMacBundle(macX64Path, 'it.fcs.dashboardnjs.macx64', version);
  }

  if (includesLinux) {
    createLinuxDesktopLauncher();
  }
}

function shouldCreateMacBundle(target) {
  return process.platform === 'darwin' && (target === 'all' || target === 'macos' || target === 'macos-arm64' || target === 'macos-x64');
}

function validateTarget(target) {
  if (!TARGETS[target]) {
    throw new Error(`Unsupported build target: ${target}`);
  }

  if ((target === 'macos' || target === 'macos-arm64' || target === 'macos-x64') && process.platform !== 'darwin') {
    throw new Error('The macOS build must run on macOS to create real .app bundles.');
  }
}

/**
 * Prepares local Neutralino resources without downloading framework updates.
 * @2026-07-03
 */
export function prepareProjectResources() {
  const resourcesJsDir = path.join(rootDir, 'resources', 'js');
  const resourcesIconDir = path.join(rootDir, 'resources', 'icon');
  const iconSourcePath = path.join(rootDir, 'assets', 'icon', appPngIconAsset);
  const iconTargetPath = path.join(resourcesIconDir, appPngIconAsset);
  const apiKeysPath = path.join(rootDir, 'resources', 'api-keys');

  mkdirSync(resourcesJsDir, { recursive: true });
  mkdirSync(resourcesIconDir, { recursive: true });

  if (existsSync(iconSourcePath)) {
    copyFileSync(iconSourcePath, iconTargetPath);
  }

  if (existsSync(apiKeysPath)) {
    rmSync(apiKeysPath, { recursive: true, force: true });
  }
}

/**
 * Updates Neutralino framework binaries and client files on demand.
 * @2026-07-03
 */
export function updateNeutralinoFramework() {
  prepareProjectResources();
  refreshNeutralinoRuntime(true);
}

/**
 * Refreshes Neutralino binaries for the versions pinned in neutralino.config.json.
 * @2026-07-03
 */
export function refreshNeutralinoFramework() {
  prepareProjectResources();
  refreshNeutralinoRuntime(false);
}

/**
 * Builds desktop artifacts for one target or for every supported target.
 * @2026-07-03
 */
export function buildDesktopTarget(target) {
  if (target === 'all') {
    buildAllDesktopTargets();
    return;
  }

  if (target === 'macos') {
    buildMacosTargets({ refreshRuntime: shouldRefreshBeforeBuild(), verifyOutputs: true });
    return;
  }

  buildSingleTarget(target, { refreshRuntime: shouldRefreshBeforeBuild() });
  ensureRequiredOutputs(target);
}

export { rootDir, distRoot };