# dashboard-njs

Cross-platform desktop base project powered by **Neutralinojs**.

## Implemented Runtime Requirements

- window title: `dashboard-njs`
- fixed window size: `1560 x 1050`
- non-resizable window
- local in-process HTTP server on `127.0.0.1` with a stable port
- standalone optimized build (`--embed-resources`)

## Project Structure

- `neutralino.config.json` app configuration
- `resources/` static web app (entrypoint: `index.html`)
- `scripts/setup-neutralino.sh` Neutralino binaries/client setup
- `scripts/build-all.sh` multi-platform release build
- `scripts/build-macos-app.sh` macOS-only release build (`.app` bundles)
- `scripts/sync-version.mjs` syncs app version from `package.json`

## Where to Place Your Existing Web App

Replace the content of `resources/` with your already working static web app:

- `resources/index.html` (required)
- `resources/*.css`, `resources/*.js`, images, fonts, etc.

If your frontend build outputs a folder such as `dist` or `build`, copy its contents into `resources/`, keeping `index.html` at the root of `resources/`.

## Initial Setup

```bash
npm install
./scripts/setup-neutralino.sh
```

## Local Run

```bash
npm run dev
```

`npm run dev` includes:

- automatic version sync from `package.json`
- fixed-port pre-check and warning if the port is already in use

## Standalone Release Build

```bash
./scripts/build-all.sh
```

Build output in `dist/` for:

- macOS Apple Silicon (`mac_arm64`)
- macOS Intel (`mac_x64`)
- Windows Intel (`win_x64`)
- Linux (`linux_x64`)

macOS-only build:

```bash
./scripts/build-macos-app.sh
```

## Versioning

Set the version only in `package.json`.

It is automatically propagated to:

- `neutralino.config.json` (`version`)
- `resources/index.html` (`ver. x.y.z` label)
- macOS bundle metadata (`Info.plist`)

Manual sync command:

```bash
npm run version:sync
```

## FX API Key

The FX API key is provided by the user in the app Settings UI and stored only for the current webview session.
`resources/api-keys` is no longer required.
