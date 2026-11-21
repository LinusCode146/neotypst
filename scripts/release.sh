#!/usr/bin/env bash
# Baut NeoTypst getrennt für Apple Silicon und Intel und veröffentlicht ein
# GitHub-Release mit je einem DMG (zum Installieren) und einem signierten
# Update-Paket, dazu latest.json für den Updater.
#
#   scripts/release.sh            Version aus src-tauri/tauri.conf.json
#   scripts/release.sh --draft    als Entwurf anlegen
#
# Braucht den privaten Update-Schlüssel (~/.tauri/neotypst.key oder
# TAURI_SIGNING_PRIVATE_KEY) und ein angemeldetes `gh`.
set -euo pipefail
cd "$(dirname "$0")/.."

DRAFT=""
[[ "${1:-}" == "--draft" ]] && DRAFT="--draft"

REPO="LinusCode146/neotypst"
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
TAG="v$VERSION"
NOTES="release-notes/$TAG.md"

[[ -f "$NOTES" ]] || { echo "Fehlt: $NOTES (Release-Notizen auf Deutsch)"; exit 1; }
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG gibt es schon. Version in tauri.conf.json, Cargo.toml und package.json erhöhen."
  exit 1
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  KEY="$HOME/.tauri/neotypst.key"
  [[ -f "$KEY" ]] || { echo "Privater Update-Schlüssel fehlt: $KEY"; exit 1; }
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
fi
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

OUT="$(mktemp -d)"
ASSETS=()
PLATFORMS="{}"

# build <rust-target> <tauri-plattform> <name im Dateinamen>
build() {
  local target=$1 platform=$2 label=$3
  echo "▸ Baue NeoTypst $VERSION für $label ($target) …"
  npx tauri build --target "$target" --bundles app

  local bundle="src-tauri/target/$target/release/bundle/macos"
  local tarball="$bundle/NeoTypst.app.tar.gz"
  [[ -f "$tarball" && -f "$tarball.sig" ]] || { echo "Update-Paket fehlt ($tarball)"; exit 1; }

  # DMG selbst bauen: Tauris AppleScript-Schritt läuft oft in einen Finder-Timeout.
  local dmg="$OUT/NeoTypst_${VERSION}_${label}.dmg"
  rm -rf "$OUT/dmg" && mkdir "$OUT/dmg"
  cp -R "$bundle/NeoTypst.app" "$OUT/dmg/"
  ln -s /Applications "$OUT/dmg/Programme"
  hdiutil create -volname NeoTypst -srcfolder "$OUT/dmg" -format UDZO -quiet "$dmg"

  local update="$OUT/NeoTypst_${label}.app.tar.gz"
  cp "$tarball" "$update"
  ASSETS+=("$dmg" "$update")

  local url="https://github.com/$REPO/releases/download/$TAG/NeoTypst_${label}.app.tar.gz"
  PLATFORMS=$(node -e '
    const [json, platform, url, signature] = process.argv.slice(1);
    const p = JSON.parse(json); p[platform] = { signature, url };
    console.log(JSON.stringify(p));
  ' "$PLATFORMS" "$platform" "$url" "$(cat "$tarball.sig")")
}

build aarch64-apple-darwin darwin-aarch64 Apple-Silicon
build x86_64-apple-darwin darwin-x86_64 Intel

# Update-Manifest: der Updater wählt den Eintrag passend zur Architektur des Macs.
node -e '
  const [version, platforms, notesFile, out] = process.argv.slice(1);
  const notes = require("fs").readFileSync(notesFile, "utf8");
  const manifest = { version, notes, pub_date: new Date().toISOString(), platforms: JSON.parse(platforms) };
  require("fs").writeFileSync(out, JSON.stringify(manifest, null, 2));
' "$VERSION" "$PLATFORMS" "$NOTES" "$OUT/latest.json"

echo "▸ Veröffentliche $TAG …"
gh release create "$TAG" --repo "$REPO" $DRAFT --title "NeoTypst $VERSION" --notes-file "$NOTES" \
  "${ASSETS[@]}" "$OUT/latest.json"
echo "✓ https://github.com/$REPO/releases/tag/$TAG"
