#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"

cd "$ROOT_DIR"

create_macos_bundle() {
  local app_path="$1"
  local bundle_id="$2"

  if [[ ! -f "$app_path" ]]; then
    return
  fi

  local tmp_bin="${app_path}.bin"
  local app_name
  app_name="$(basename "$app_path" .app)"
  local contents_dir="$app_path/Contents"
  local macos_dir="$contents_dir/MacOS"
  local resources_dir="$contents_dir/Resources"
  local executable_name="dashboard-njs"
  local icon_source_png="$ROOT_DIR/assets/icon/app-icon.png"
  local icon_filename="AppIcon.icns"

  mv "$app_path" "$tmp_bin"
  mkdir -p "$macos_dir" "$resources_dir"
  mv "$tmp_bin" "$macos_dir/$executable_name"
  chmod +x "$macos_dir/$executable_name"

  if [[ -f "$icon_source_png" ]] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    local iconset_dir="$tmp_dir/AppIcon.iconset"
    mkdir -p "$iconset_dir"

    sips -z 16 16     "$icon_source_png" --out "$iconset_dir/icon_16x16.png" >/dev/null
    sips -z 32 32     "$icon_source_png" --out "$iconset_dir/icon_16x16@2x.png" >/dev/null
    sips -z 32 32     "$icon_source_png" --out "$iconset_dir/icon_32x32.png" >/dev/null
    sips -z 64 64     "$icon_source_png" --out "$iconset_dir/icon_32x32@2x.png" >/dev/null
    sips -z 128 128   "$icon_source_png" --out "$iconset_dir/icon_128x128.png" >/dev/null
    sips -z 256 256   "$icon_source_png" --out "$iconset_dir/icon_128x128@2x.png" >/dev/null
    sips -z 256 256   "$icon_source_png" --out "$iconset_dir/icon_256x256.png" >/dev/null
    sips -z 512 512   "$icon_source_png" --out "$iconset_dir/icon_256x256@2x.png" >/dev/null
    sips -z 512 512   "$icon_source_png" --out "$iconset_dir/icon_512x512.png" >/dev/null
    sips -z 1024 1024 "$icon_source_png" --out "$iconset_dir/icon_512x512@2x.png" >/dev/null

    iconutil -c icns "$iconset_dir" -o "$resources_dir/$icon_filename" >/dev/null 2>&1 || true

    rm -rf "$tmp_dir"
  fi

  cat > "$contents_dir/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>it</string>
  <key>CFBundleDisplayName</key>
  <string>${app_name}</string>
  <key>CFBundleExecutable</key>
  <string>${executable_name}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundle_id}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${app_name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${APP_VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${APP_VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

  if [[ -f "$resources_dir/$icon_filename" ]] && command -v /usr/libexec/PlistBuddy >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Delete :CFBundleIconFile" "$contents_dir/Info.plist" >/dev/null 2>&1 || true
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string $icon_filename" "$contents_dir/Info.plist" >/dev/null 2>&1 || true
  fi

  if command -v codesign >/dev/null 2>&1; then
    codesign --force --deep --sign - "$app_path" >/dev/null 2>&1 || true
  fi
}

create_linux_desktop_launcher() {
  local dist_root="$1"
  local linux_bin="$dist_root/dashboard-njs-linux_x64"
  local icon_source="$ROOT_DIR/assets/icon/app-icon.png"
  local icon_target="$dist_root/dashboard-njs-linux_x64.png"
  local desktop_target="$dist_root/dashboard-njs-linux_x64.desktop"

  if [[ ! -f "$linux_bin" ]]; then
    return
  fi

  if [[ -f "$icon_source" ]]; then
    cp "$icon_source" "$icon_target"
  fi

  cat > "$desktop_target" <<DESKTOP
[Desktop Entry]
Type=Application
Name=dashboard-njs
Exec=./dashboard-njs-linux_x64
Icon=./dashboard-njs-linux_x64.png
Terminal=false
Categories=Utility;
DESKTOP
}

echo "[1/4] Setup Neutralino"
./scripts/setup-neutralino.sh

echo "[2/4] Build release stand-alone"
BUILD_CONFIG="$ROOT_DIR/.tmp/neutralino.build.config.json"
mkdir -p "$ROOT_DIR/.tmp"
awk '
  { print }
  /"applicationName": "dashboard-njs",/ {
    print "  \"applicationIcon\": \"assets/icon/app-icon.png\"," 
  }
' "$ROOT_DIR/neutralino.config.json" > "$BUILD_CONFIG"
npx @neutralinojs/neu build --release --embed-resources --macos-bundle --clean --config-file "$BUILD_CONFIG"
rm -f "$BUILD_CONFIG"

echo "[3/4] Mantengo solo i target richiesti"
DIST_ROOT="$ROOT_DIR/dist/dashboard-njs"

if [[ -d "$DIST_ROOT" ]]; then
  find "$DIST_ROOT" -mindepth 1 -maxdepth 1 -type f \
    ! -name 'dashboard-njs-mac_arm64*' \
    ! -name 'dashboard-njs-mac_x64*' \
    ! -name 'dashboard-njs-win_x64*' \
    ! -name 'dashboard-njs-linux_x64*' \
    -delete

  find "$DIST_ROOT" -mindepth 1 -maxdepth 1 -type d \
    ! -name 'dashboard-njs-mac_arm64.app' \
    ! -name 'dashboard-njs-mac_x64.app' \
    -exec rm -rf {} +

else
  echo "Cartella release non trovata: $DIST_ROOT"
  exit 1
fi

echo "[4/4] Creo bundle .app reali per macOS"
create_macos_bundle "$DIST_ROOT/dashboard-njs-mac_arm64.app" "it.fcs.dashboardnjs.macarm64"
create_macos_bundle "$DIST_ROOT/dashboard-njs-mac_x64.app" "it.fcs.dashboardnjs.macx64"
create_linux_desktop_launcher "$DIST_ROOT"

echo "Completato"
echo "Output: $ROOT_DIR/dist"
