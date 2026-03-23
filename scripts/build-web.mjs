#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const resourcesDir = path.join(rootDir, 'resources');
const outDir = path.join(rootDir, 'dist-web');
const outIndexPath = path.join(outDir, 'index.html');

function resolveBasePath() {
  const envBasePath = process.env.BASE_PATH || process.env.PAGES_BASE_PATH;
  if (envBasePath) return normalizeBasePath(envBasePath);

  const repoSlug = process.env.GITHUB_REPOSITORY;
  if (repoSlug && repoSlug.includes('/')) {
    const repoName = repoSlug.split('/')[1];
    return normalizeBasePath(`/${repoName}/`);
  }

  return './';
}

function normalizeBasePath(value) {
  const trimmed = String(value || '/').trim();
  if (!trimmed || trimmed === '/') return '/';
  if (trimmed === '.' || trimmed === './') return './';

  let normalized = trimmed;
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (!normalized.endsWith('/')) normalized = `${normalized}/`;
  return normalized;
}

function stripNeutralinoScript(indexHtml) {
  return indexHtml.replace(/\n\s*<script\s+src=["']js\/neutralino\.js["']\s*><\/script>\s*/i, '\n');
}

function injectBaseTag(indexHtml, basePath) {
  const baseTag = `  <base href="${basePath}" />`;

  if (indexHtml.includes('<base href=')) {
    return indexHtml.replace(/<base\s+href=["'][^"']*["']\s*\/?\s*>/i, `<base href="${basePath}" />`);
  }

  return indexHtml.replace(/<head>/i, `<head>\n${baseTag}`);
}

if (!existsSync(resourcesDir)) {
  console.error(`Resources folder not found: ${resourcesDir}`);
  process.exit(1);
}

const basePath = resolveBasePath();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(resourcesDir, outDir, { recursive: true });

const originalIndex = readFileSync(outIndexPath, 'utf8');
const patchedIndex = injectBaseTag(stripNeutralinoScript(originalIndex), basePath);
writeFileSync(outIndexPath, patchedIndex, 'utf8');

// Disable Jekyll processing on GitHub Pages to preserve files/folders as-is.
// @2026-03-23
writeFileSync(path.join(outDir, '.nojekyll'), '\n', 'utf8');

console.log(`Web build completed.`);
console.log(`Base path: ${basePath}`);
console.log(`Output: ${outDir}`);
