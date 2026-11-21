#!/usr/bin/env bash
# Baut NeoTypst als Universal-App und veröffentlicht ein GitHub-Release mit
# DMG (zum Installieren) und signiertem Update-Paket + latest.json (für den Updater).
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

echo "▸ Baue NeoTypst $VERSION (universal) …"
npx tauri build --target universal-apple-darwin --bundles app

BUNDLE="src-tauri/target/universal-apple-darwin/release/bundle/macos"
APP="$BUNDLE/NeoTypst.app"
TARBALL="$BUNDLE/NeoTypst.app.tar.gz"
[[ -f "$TARBALL" && -f "$TARBALL.sig" ]] || { echo "Update-Paket fehlt ($TARBALL)"; exit 1; }

# DMG selbst bauen: Tauris AppleScript-Schritt läuft oft in einen Finder-Timeout.
OUT="$(mktemp -d)"
DMG="$OUT/NeoTypst_${VERSION}_universal.dmg"
mkdir "$OUT/dmg"
cp -R "$APP" "$OUT/dmg/"
ln -s /Applications "$OUT/dmg/Programme"
hdiutil create -volname NeoTypst -srcfolder "$OUT/dmg" -format UDZO -quiet "$DMG"

# Update-Manifest: dasselbe Universal-Paket für Apple Silicon und Intel.
UPDATE="$OUT/NeoTypst.app.tar.gz"
cp "$TARBALL" "$UPDATE"
URL="https://github.com/$REPO/releases/download/$TAG/NeoTypst.app.tar.gz"
SIG=$(cat "$TARBALL.sig")
node -e '
  const [version, url, signature, notesFile, out] = process.argv.slice(1);
  const notes = require("fs").readFileSync(notesFile, "utf8");
  const platform = { signature, url };
  const manifest = {
    version, notes, pub_date: new Date().toISOString(),
    platforms: { "darwin-aarch64": platform, "darwin-x86_64": platform, "darwin-universal": platform },
  };
  require("fs").writeFileSync(out, JSON.stringify(manifest, null, 2));
' "$VERSION" "$URL" "$SIG" "$NOTES" "$OUT/latest.json"

echo "▸ Veröffentliche $TAG …"
gh release create "$TAG" --repo "$REPO" $DRAFT --title "NeoTypst $VERSION" --notes-file "$NOTES" \
  "$DMG" "$UPDATE" "$OUT/latest.json"
echo "✓ https://github.com/$REPO/releases/tag/$TAG"
