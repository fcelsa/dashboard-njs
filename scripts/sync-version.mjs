import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const packagePath = path.join(rootDir, 'package.json');
const neutralinoConfigPath = path.join(rootDir, 'neutralino.config.json');
const indexPath = path.join(rootDir, 'resources', 'index.html');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function syncNeutralinoConfigVersion(version) {
  const config = readJson(neutralinoConfigPath);
  if (config.version !== version) {
    config.version = version;
    writeJson(neutralinoConfigPath, config);
    return true;
  }
  return false;
}

function syncIndexVersionLabel(version) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const pattern = /(<div class="settings-build">)\s*ver\.\s*[^<]*(<\/div>)/i;

  if (!pattern.test(html)) {
    throw new Error('Impossibile trovare il blocco settings-build in resources/index.html');
  }

  const updated = html.replace(pattern, `$1ver. ${version}$2`);
  if (updated !== html) {
    fs.writeFileSync(indexPath, updated, 'utf8');
    return true;
  }
  return false;
}

function main() {
  const pkg = readJson(packagePath);
  const version = String(pkg.version || '').trim();

  if (!version) {
    throw new Error('Versione mancante in package.json');
  }

  const changedConfig = syncNeutralinoConfigVersion(version);
  const changedIndex = syncIndexVersionLabel(version);

  const changed = [];
  if (changedConfig) changed.push('neutralino.config.json');
  if (changedIndex) changed.push('resources/index.html');

  if (changed.length === 0) {
    console.log(`[version-sync] Nessuna modifica (versione corrente: ${version})`);
  } else {
    console.log(`[version-sync] Versione ${version} sincronizzata su: ${changed.join(', ')}`);
  }
}

try {
  main();
} catch (error) {
  console.error('[version-sync] Errore:', error.message);
  process.exit(1);
}
