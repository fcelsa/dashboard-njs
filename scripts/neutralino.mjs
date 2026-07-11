#!/usr/bin/env node
// Single Neutralino maintenance entry point: `node scripts/neutralino.mjs <command>`.
// setup: prepare local resources; refresh: re-fetch the pinned runtime;
// update: upgrade framework binaries and client to the latest stable. @2026-07-09
import {
  prepareProjectResources,
  refreshNeutralinoFramework,
  updateNeutralinoFramework
} from './neutralino-build-utils.mjs';

const command = process.argv[2];

switch (command) {
  case 'setup':
    prepareProjectResources();
    console.log('Neutralino project resources are ready.');
    break;
  case 'refresh':
    refreshNeutralinoFramework();
    break;
  case 'update':
    updateNeutralinoFramework();
    break;
  default:
    console.error(`Usage: node scripts/neutralino.mjs <setup|refresh|update> (got: ${command || 'nothing'})`);
    process.exit(1);
}
