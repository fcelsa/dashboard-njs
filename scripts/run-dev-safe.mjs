import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'neutralino.config.json');
const nodeBinDir = path.dirname(process.execPath);
const npmCliPath = path.join(nodeBinDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');

function readConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          resolve(true);
          return;
        }
        resolve(true);
      })
      .once('listening', () => {
        tester.close(() => resolve(false));
      });

    tester.listen(port, host);
  });
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      shell: false
    });

    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function runCommandWithOutput(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', () => resolve({ ok: false, stdout: '', stderr: '' }));
    child.on('exit', (code) => resolve({ ok: code === 0, stdout, stderr }));
  });
}

async function getPortOwnerInfo(port) {
  if (!Number.isInteger(port) || port <= 0) return null;

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const res = await runCommandWithOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
    if (!res.ok || !res.stdout.trim()) return null;

    const lines = res.stdout.trim().split('\n');
    if (lines.length < 2) return null;

    const row = lines[1].trim().split(/\s+/);
    const command = row[0] || 'unknown';
    const pid = row[1] || 'unknown';
    return { pid, command };
  }

  if (process.platform === 'win32') {
    const netstatRes = await runCommandWithOutput('netstat', ['-ano', '-p', 'tcp']);
    if (!netstatRes.ok || !netstatRes.stdout.trim()) return null;

    const target = `:${port}`;
    const lines = netstatRes.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const match = lines.find((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 5) return false;
      const localAddress = parts[1] || '';
      const state = (parts[3] || '').toUpperCase();
      return localAddress.endsWith(target) && state === 'LISTENING';
    });

    if (!match) return null;
    const pid = match.split(/\s+/).pop();
    if (!pid) return null;

    const tasklistRes = await runCommandWithOutput('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    if (!tasklistRes.ok || !tasklistRes.stdout.trim()) {
      return { pid, command: 'unknown' };
    }

    const firstLine = tasklistRes.stdout.trim().split('\n')[0] || '';
    const clean = firstLine.replace(/^"|"$/g, '');
    const fields = clean.split('","');
    const command = fields[0] || 'unknown';
    return { pid, command };
  }

  return null;
}

async function showWarningWindow(message) {
  const title = 'dashboard-njs';

  if (process.platform === 'darwin') {
    await runCommand('osascript', ['-e', `display alert "${title}" message "${message.replace(/"/g, '\\"')}" as warning`]);
    return;
  }

  if (process.platform === 'win32') {
    const psScript = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${message.replace(/'/g, "''")}', '${title}', 'OK', 'Warning')`;
    await runCommand('powershell', ['-NoProfile', '-Command', psScript]);
    return;
  }

  const linuxDialogs = [
    { cmd: 'zenity', args: ['--warning', '--title', title, '--text', message] },
    { cmd: 'kdialog', args: ['--title', title, '--sorry', message] },
    { cmd: 'xmessage', args: ['-center', `${title}: ${message}`] }
  ];

  for (const entry of linuxDialogs) {
    const ok = await runCommand(entry.cmd, entry.args);
    if (ok) return;
  }
}

async function main() {
  let config;
  try {
    config = readConfig();
  } catch (error) {
    console.error('[dev-safe] Impossibile leggere neutralino.config.json:', error.message);
    process.exit(1);
  }

  const port = Number(config?.port);
  const enableServer = Boolean(config?.enableServer);

  if (enableServer && Number.isInteger(port) && port > 0) {
    const inUse = await isPortInUse(port);
    if (inUse) {
      const owner = await getPortOwnerInfo(port);
      const ownerLine = owner
        ? `\nProcesso: ${owner.command} (PID ${owner.pid})`
        : '';
      const message = `La porta ${port} è già in uso.\nL'applicazione potrebbe essere già aperta o un altro processo sta usando la stessa porta.${ownerLine}`;
      console.warn(`[dev-safe] ${message.replace(/\n/g, ' ')}`);
      await showWarningWindow(message);
      process.exit(1);
    }
  }

  const command = process.platform === 'win32' && fs.existsSync(npmCliPath)
    ? {
        cmd: process.execPath,
        args: [npmCliPath, 'exec', '--', '@neutralinojs/neu', 'run', ...process.argv.slice(2)]
      }
    : {
        cmd: 'npx',
        args: ['@neutralinojs/neu', 'run', ...process.argv.slice(2)]
      };
  const child = spawn(command.cmd, command.args, { stdio: 'inherit', shell: false });

  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error('[dev-safe] Errore avvio neu run:', err.message);
    process.exit(1);
  });
}

main();
