#!/usr/bin/env node
import { buildDesktopTarget } from './neutralino-build-utils.mjs';

if (!process.env.BUILD_REQUIRED_OUTPUTS && !process.env.BUILD_REQUIRED_OUTPUTS_ALL) {
  process.env.BUILD_REQUIRED_OUTPUTS = 'dashboard-njs-mac_x64.app,dashboard-njs-win_x64.exe,dashboard-njs-linux_x64';
}

buildDesktopTarget('all');