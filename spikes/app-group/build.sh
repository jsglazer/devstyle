#!/bin/zsh
# Build and sign the probe apps. Usage: ./build.sh  (output in ./build)
set -euo pipefail
cd "$(dirname "$0")"
IDENTITY="Developer ID Application: Joshua Glazer (PWGXN26URQ)"
GROUP="PWGXN26URQ.com.jsglazer.devstyle"
rm -rf build && mkdir build
xcrun swiftc -O -o build/probe probe.swift
make_app() { # name bundle-id with-group(yes/no)
  local app="build/$1.app"
  mkdir -p "$app/Contents/MacOS"
  cp build/probe "$app/Contents/MacOS/$1"
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$2</string>
<key>CFBundleExecutable</key><string>$1</string>
<key>CFBundleName</key><string>$1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
  local ent="build/$1.entitlements"
  if [[ $3 == yes ]]; then
    cat > "$ent" <<ENT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.app-sandbox</key><true/>
<key>com.apple.security.application-groups</key><array><string>$GROUP</string></array>
</dict></plist>
ENT
  else
    cat > "$ent" <<ENT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.app-sandbox</key><true/>
</dict></plist>
ENT
  fi
  codesign --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ent" "$app"
}
make_app DSProbeA com.jsglazer.dsprobe-a yes
make_app DSProbeB com.jsglazer.dsprobe-b yes
make_app DSProbeC com.jsglazer.dsprobe-c no
cp build/probe build/probe-unsandboxed
codesign --force --options runtime --timestamp --sign "$IDENTITY" build/probe-unsandboxed
