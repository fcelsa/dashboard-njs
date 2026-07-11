# dashboard-njs

Cross-platform desktop dashboard built with [Neutralinojs](https://neutralino.js.org/), with a static web build deployed to GitHub Pages.

The dashboard (Italian UI, fixed 1560 × 1050 window) combines a scrolling calendar with holidays, a flip/analog clock with moon phase, a live EUR/USD exchange card with a 52-week chart, an RPN-style business calculator with paper tape, a spreadsheet-style calc grid, and optional state sync to a private GitHub Gist.

Live web version: <https://fcelsa.github.io/dashboard-njs/>

## Two delivery channels

| Channel | How it ships | Source of truth |
|---|---|---|
| Desktop (macOS arm64/x64, Windows, Linux) | built locally with `npm run build*` | `resources/` |
| Web (GitHub Pages) | rebuilt and deployed by CI on every push to `main` | same `resources/` |

Both channels always display the version from `package.json`: every build regenerates `resources/js/version.js` (imported by the UI) and `neutralino.config.json`. There is no manual version step besides bumping `package.json`.

## Quick start

```bash
npm install
npm run setup   # prepares resources/ (icon, folders)
npm run dev     # version sync + port check + neu run
```

## Build commands

| Command | What it does |
|---|---|
| `npm run build` | all desktop targets into `dist/dashboard-njs/` |
| `npm run build:macos` | both `.app` bundles (arm64 + x64); requires macOS |
| `npm run build:linux` | Linux binary + `.desktop` launcher + icon |
| `npm run build:windows` | Windows exe (resources loaded from `resources.neu`) |
| `npm run build:release` | `build` in strict mode: fails on dirty tree/missing tag and requires all 4 artifacts |
| `npm run build:web` | static site into `dist-web/` (gitignored; CI deploys it) |
| `npm test` / `npm run lint` | Node test runner suite / ESLint |

All build entry points call the version sync themselves — running `node scripts/build.mjs macos` or `node scripts/build-web.mjs` directly is equivalent to the npm scripts.

Environment variables:

- `SKIP_NEUTRALINO_REFRESH=1` — skip re-fetching the pinned runtime on repeated local builds
- `BASE_PATH` / `PAGES_BASE_PATH` — web build base href (CI sets `/<repo>/`; local default `./`)
- `BUILD_REQUIRED_OUTPUTS[_<TARGET>]` — override the artifact checklist

## Build philosophy

The build flow is intentionally minimal:

- one shared Node build core in `scripts/neutralino-build-utils.mjs`
- one desktop entry point: `scripts/build.mjs <all|macos|macos-arm64|macos-x64|linux|windows> [--strict]`
- one maintenance entry point: `scripts/neutralino.mjs <setup|refresh|update>`
- one dedicated web build: `scripts/build-web.mjs`
- one version sync module: `scripts/sync-version.mjs` (also used as a library by the build scripts)

Desktop builds refresh the Neutralino binaries pinned in `neutralino.config.json` before packaging. macOS and Linux use `neu build --release --embed-resources --clean`; Windows intentionally builds without `--embed-resources` so Neutralino can patch the executable and load `resources.neu`. On macOS the script assembles real `.app` bundles (Info.plist with the package version, `.icns` icon, ad-hoc codesign).

## Versioning & release flow

`package.json` is the only place the version is set. `npm run version:sync` (run automatically by dev/build) propagates it to `neutralino.config.json` and to the generated `resources/js/version.js`, which the UI reads at runtime (`ver. X.Y.Z` in the Status card).

Release sequence:

1. Bump `version` in `package.json`.
2. Commit and tag: `git tag vX.Y.Z && git push origin main --tags` — the push deploys the web version via CI.
3. `npm run build:release` on macOS. Strict mode verifies the working tree is clean and the `vX.Y.Z` tag exists, so local binaries provably match the deployed web commit. Non-strict builds only warn.
4. Attach the artifacts from `dist/dashboard-njs/` to the GitHub release.

Required release outputs: `dashboard-njs-mac_arm64.app`, `dashboard-njs-mac_x64.app`, `dashboard-njs-win_x64.exe`, `dashboard-njs-linux_x64`.

## Updating Neutralino

```bash
npm run neutralino:refresh   # re-fetch the runtime pinned in neutralino.config.json
npm run neutralino:update    # explicit upgrade to the latest stable (neu update --latest)
```

Regular builds only ever use the pinned runtime; upgrades stay explicit and on-demand.

## Security notes

- The GitHub personal access token (used only for private-Gist sync) is stored in `localStorage` via `resources/js/utils/token-store.js`; legacy cookie values are migrated and deleted on first read. Use a fine-grained token limited to the `gist` scope.
- `neutralino.config.json` declares an explicit `nativeAllowList`, so the page can only reach the handful of native APIs the app actually uses — `filesystem.*` and `os.execCommand` are not exposed.
- All GitHub API calls go through `resources/js/utils/github-gist-api.js`; data restored from a synced Gist is rendered with DOM properties (never `innerHTML` interpolation).

## Architecture

```
resources/
  index.html            single page, loads js/main.js as ES module
  js/
    main.js             entry point: Neutralino init, macOS menu, theme, tabs, version label
    script.js           dashboard orchestrator (initDashboard)
    calendar.js         month grid, year overview, day context menu
    clock.js            flip/analog clock, date display + format menu
    fx.js               EUR/USD rate, averages, 52-week chart (api.frankfurter.dev)
    settings.js         GitHub token/Gist URL forms, runtime info card
    moon.js             moon phase widget
    calculator.js       calculator UI, paper tape, snapshots, Gist sync
    calculator-engine.js pure calculation engine (tested)
    calc-sheet.js       spreadsheet-style grid (IndexedDB)
    time-date-manager.js holidays/events table
    date-utils.js       shared date/format helpers (tested)
    version.js          generated by sync-version — do not edit
    ui/                 theme, tabs, calendar views
    utils/              token-store, github-gist-api, gist-sync, dashboard-sync,
                        calc-history-db, cookies, number-utils (tested)
scripts/                build core + entry points (see Build philosophy)
tests/                  node:test suites (npm test)
.github/workflows/pages.yml   web deploy on push to main
```

## Development

`npm run dev` syncs the version, checks the Neutralino port is free, then starts `neu run`.

Manual smoke checklist (run after meaningful changes, on macOS):

1. App starts, fixed-size window, macOS menu present, "Documentazione Neutralino" opens the browser.
2. Status card shows `ver. X.Y.Z` and the runtime info grid is populated.
3. Calendar scrolls with the wheel; year view toggle works; right-click on a day shows the context menu.
4. Clock flips each minute; click toggles analog; right-click on the date shows the copy-format menu.
5. FX card shows a rate and the chart renders; tooltip follows the mouse.
6. Calculator: digits, `+`/`=`, paper tape; state persists after closing and reopening the app.
7. Settings: save/clear GitHub token and Gist URL; masked status text updates.
8. Gist save/load round-trip works (needs a valid token + Gist URL).
9. Theme select persists across restarts.
10. `npm test` and `npm run lint` pass.
