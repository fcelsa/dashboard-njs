#!/usr/bin/env node
// Single desktop-build entry point: `node scripts/build.mjs [target] [--strict]`.
// Targets: all (default), macos, macos-arm64, macos-x64, linux, windows.
// --strict enforces the version parity check and the full release output set. @2026-07-09
import { buildDesktopTarget } from './neutralino-build-utils.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const target = args.find((arg) => !arg.startsWith('--')) || 'all';

try {
  buildDesktopTarget(target, { strict });
} catch (error) {
  console.error('[build] Error:', error.message);
  process.exit(1);
}
