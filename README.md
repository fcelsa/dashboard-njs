# dashboard-njs

Cross-platform desktop app powered by Neutralinojs, with a separate static web build for GitHub Pages.

## Runtime Profile

- window title: `dashboard-njs`
- fixed window size: `1560 x 1050`
- non-resizable window
- local in-process HTTP server on a fixed port
- desktop builds via `neu build --release`, with `resources.neu` always generated for runtime loading

## Build Philosophy

The build flow is intentionally minimal:

- one shared Node build core in `scripts/neutralino-build-utils.mjs`
- one entry script per desktop target
- one refresh step for the currently pinned Neutralino runtime
- one explicit script to update Neutralino binaries and client files
- one dedicated web build that only prepares the static site for GitHub Pages

Desktop builds refresh the Neutralino binaries pinned in `neutralino.config.json` before packaging. Framework upgrades to the latest stable release remain explicit and on-demand.
For repeated local builds, the runtime refresh can be skipped explicitly.

## Relevant Files

- `neutralino.config.json`: Neutralino app configuration
- `resources/`: desktop app static files served by Neutralino
- `dist-web/`: generated static web build for GitHub Pages
- `scripts/setup-neutralino.mjs`: local project preparation only
- `scripts/refresh-neutralino.mjs`: refreshes the currently pinned Neutralino runtime files
- `scripts/update-neutralino.mjs`: updates Neutralino framework binaries and client library via `neu update --latest`
- `scripts/build-all.mjs`: builds all desktop targets into `dist/`
- `scripts/build-release.mjs`: optional local release check with expected artifacts verification
- `scripts/build-macos.mjs`: macOS-only build with real `.app` bundles
- `scripts/build-linux.mjs`: Linux-only build
- `scripts/build-windows.mjs`: Windows-only build
- `scripts/build-web.mjs`: static web build
- `scripts/sync-version.mjs`: propagates app version from `package.json`

## Initial Setup

```bash
npm install
npm run setup
```

`npm run setup` only prepares local resources used by the project:

- ensures required `resources/` subfolders exist
- copies `assets/icon/dashboard-njs.png` into `resources/icon/`
- removes the obsolete `resources/api-keys` path if present

## Updating Neutralino

Refresh the Neutralino binaries and client library for the versions already pinned in `neutralino.config.json`:

```bash
npm run neutralino:refresh
```

Upgrade Neutralino to the latest stable release when you explicitly want to move forward:

```bash
npm run neutralino:update
```

`neutralino:update` wraps the framework-recommended `neu update --latest` flow.
Regular desktop builds automatically use the pinned runtime through `neutralino:refresh`.

For repeated local builds, you can skip the automatic refresh step:

```bash
SKIP_NEUTRALINO_REFRESH=1 npm run build:macos
SKIP_NEUTRALINO_REFRESH=1 npm run build
```

## Local Development

```bash
npm run dev
```

This command:

- syncs the app version from `package.json`
- checks that the configured Neutralino port is free
- starts `neu run`

## Desktop Builds

All desktop build commands sync the app version first.
They also refresh the currently pinned Neutralino binaries before running `neu build`.

Build every desktop artifact and keep all supported outputs in `dist/dashboard-njs/`:

```bash
npm run build
```

Equivalent explicit command:

```bash
npm run build:all
```

Strict release build with final artifact checks:

```bash
npm run build:release
```

By default, `build:release` requires these outputs in `dist/dashboard-njs/`:

- `dashboard-njs-mac_arm64.app`
- `dashboard-njs-mac_x64.app`
- `dashboard-njs-win_x64.exe`
- `dashboard-njs-linux_x64`

You can override the required output list with `BUILD_REQUIRED_OUTPUTS` or `BUILD_REQUIRED_OUTPUTS_ALL`.

Build only macOS artifacts:

```bash
npm run build:macos
```

Notes:

- this command must run on macOS
- it runs two separate Neutralino packaging passes, one for `mac_arm64` and one for `mac_x64`
- it creates real `.app` bundles directly from the script
- it produces both Apple Silicon and Intel bundles
- it copies `assets/icon/dashboard-njs.icns` into each app bundle
- it copies `resources.neu` inside each bundle next to the executable

Build only Linux artifacts:

```bash
npm run build:linux
```

Build only Windows artifacts:

```bash
npm run build:windows
```

macOS and Linux builds use `neu build --release --embed-resources --clean`.
Windows builds intentionally use `neu build --release --clean` (without embed) so Neutralino can patch the executable correctly and load the project resources from `resources.neu`.
On macOS, the build script wraps the generated executable into a real `.app`, copies `dashboard-njs.icns` into `Contents/Resources/`, and copies `resources.neu` into `Contents/MacOS/`.
On Linux, the build script copies `assets/icon/dashboard-njs.png` and creates the `.desktop` launcher.

## Web Build

Generate the static site for GitHub Pages without touching desktop outputs:

```bash
npm run build:web
```

Output is written to `dist-web/`.

Base path resolution:

- if `BASE_PATH` or `PAGES_BASE_PATH` is set, that value is used
- otherwise, if `GITHUB_REPOSITORY` exists, the base path becomes `/<repo>/`
- fallback is `./`

Examples:

```bash
BASE_PATH=/dashboard-njs/ npm run build:web
BASE_PATH=/ npm run build:web
```

The web build removes the Neutralino client script, injects a `<base>` tag, and writes `.nojekyll`.

## Versioning

Set the version only in `package.json`.

`npm run version:sync` propagates the same version to:

- `neutralino.config.json`
- `resources/index.html`
- macOS bundle metadata during the macOS build

## Replacing the Web App

The desktop app loads its frontend from `resources/`.

Keep `resources/index.html` at the root and place the rest of the static assets alongside it.
If another frontend project produces a `dist/` or `build/` folder, copy its generated files into `resources/`.

## Release Flow

Recommended sequence:

1. Update the version in `package.json`.
2. Run `npm run build:macos` if you only need the macOS bundles, or `npm run build` for all desktop targets.
3. Validate the generated files in `dist/dashboard-njs/`.
4. Tag and publish the release.

Example:

```bash
git add package.json package-lock.json neutralino.config.json resources/index.html
git commit -m "release: v0.25.7"
git tag v0.25.7
git push origin main --tags
npm run build
```
