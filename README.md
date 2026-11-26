# DevStyle

[![GitHub release](https://img.shields.io/github/v/release/jsglazer/devstyle?logo=github)](https://github.com/jsglazer/devstyle/releases) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jsglazer/devstyle/blob/main/LICENSE) [![Made with Claude](https://img.shields.io/badge/Made_with-Claude-D97756?logo=anthropic)](https://claude.ai) [![CI](https://github.com/jsglazer/devstyle/actions/workflows/ci.yml/badge.svg)](https://github.com/jsglazer/devstyle/actions/workflows/ci.yml)

One shared look for all my apps (devtex, mdview, pdf-markup, DevNotes, and future apps). DevStyle defines a fixed list of named style values (`--ds-*` CSS variables) and a set of **profiles**, each a small CSS file that sets every value. Each app reads the active profile in its own way, so changing the profile restyles every app.

Status: **1.0.2.** The contract, the sample profiles, the web package (`@devstyle/web`) and the Swift package (`DevStyleKit`) are done. Next: the apps adopt it (see [Roadmap](#roadmap)).

## Preview

Run `node scripts/check.mjs`, then open `preview/index.html` in a browser. Pick a profile, switch to its light/dark pair, or show all eight side by side. The page is styled only with `--ds-*` values, as an app's base stylesheet would be.

## Profiles

| Profile | Light | Dark |
|---|---|---|
| Default (from DevTex: neutral Apple greys, indigo accent) | `default-light.css` | `default-dark.css` |
| Paper (warm cream, sepia accent, serif headings) | `paper-light.css` | `paper-dark.css` |
| High Contrast (black/white, strong highlights, larger text) | `high-contrast-light.css` | `high-contrast-dark.css` |
| Solarized (Ethan Schoonover's palette, adjusted slightly for contrast) | `solarized-light.css` | `solarized-dark.css` |

Profiles come in light/dark pairs. An app shows the light member or the dark member depending on the system appearance.

## Profile format

```css
/* devstyle: name="Paper Light" appearance=light pair=paper-dark */
/* One-line description. */
:root {
  color-scheme: light;
  --ds-bg: #f7f3e8;
  /* …every token in tokens.json, exactly once… */
}
```

- The first line is the header: display name, `appearance` (`light` or `dark`) and `pair` (the file id of the other member). Native apps use `appearance` to set the window's light/dark mode.
- Set every token in `tokens.json` once, and nothing else with a `--ds-` prefix.
- Values must match the token's type: `color` is `#hex`, `rgb()` or `rgba()` only (no named colours and no `color-mix()`, so native apps can read every value); `px`; plain `number`; `font` is a family list; `shadow` and `filter` are web only.
- `scripts/check.mjs` enforces all of this, plus minimum contrast for text pairs (WCAG 4.5:1 for text, 3:1 for muted text, comments and line numbers).

## Token contract

`tokens.json` is the contract: 59 tokens in nine groups (surface, text, accent, status, editing, syntax, type, shape, page), each with a type and description. Apps may rely only on these names. Each app keeps its own variable names as aliases, for example `--dt-bg: var(--ds-bg)`, so its stylesheet barely changes.

Contract versioning: adding a token is a minor version (profiles must add it). Renaming or removing one is a major version.

## How apps use it

- **Web views** (devtex, mdview's editor and preview, pdf-markup) load the profile text as a stylesheet inside cascade layers: `@layer app-base, ds-profile, app-override, user`. The app's own base styles sit at the bottom. The shared profile overrides them. An optional per-app override and the user's own CSS sit on top.
- **Native views** (DevNotes, and the native sidebars and settings in mdview and pdf-markup) read only the `--ds-name: value;` lines through `DevStyleKit`, which checks each value against its type. Arbitrary CSS never reaches native text rendering. This keeps DevNotes' existing security rule.
- Native menus, title bars, toolbars and standard controls are not themed. They follow the system appearance and accent.

## Shared folder

All apps share one folder, so one change restyles every app that follows the shared choice:

```
~/Library/Group Containers/PWGXN26URQ.com.jsglazer.devstyle/DevStyle/
  devstyle.json        { "version": 1, "light": "default-light", "dark": "default-dark" }
  profiles/<id>.css
```

- **Sandboxed Mac apps** add the App Group `PWGXN26URQ.com.jsglazer.devstyle` to `com.apple.security.application-groups`. This was tested on macOS 26 with Developer ID and notarized apps: no prompt and no provisioning profile needed. See `spikes/app-group/README.md`.
- **Unsandboxed apps** (devtex) read the path directly (`macSharedFolder(home)` in the web package).
- The first app to start copies the built-in profiles and a default `devstyle.json` into the folder. Existing files are never overwritten, so edited profiles survive.
- Apps watch the folder and re-apply on change. Save profile edits atomically (most editors do), because watching a directory sees file replacements, not in-place writes.
- **Per-app opt-out:** each app stores its own preference (`follow: true` by default; otherwise its own light/dark profile ids). Swift apps keep it in UserDefaults under `DevStylePreference`.
- iOS apps can't use a team-prefixed group; they use built-ins or their own group until iCloud sync exists.

## Web package: `@devstyle/web`

In `packages/web`: TypeScript, no runtime dependencies, compiled output committed in `dist/`.

```jsonc
// package.json (pnpm)
"@devstyle/web": "github:jsglazer/devstyle#1.0.2&path:packages/web"
```

```ts
import { DevStyle, LAYER_ORDER_CSS, pairProfiles, type FolderHost } from '@devstyle/web';

// The app supplies file access to the shared folder (e.g. Tauri commands); null = built-ins only.
const host: FolderHost = { read, write, list, watch };
const style = new DevStyle({
  host,
  preference: { follow: true },
  onApply: (s) => setWindowAppearance(s.profile.header?.appearance), // native light/dark
});
await style.start(); // installs built-ins, applies, follows appearance + folder changes
style.setLayer('user', userCss); // optional per-user CSS on top
const pairs = pairProfiles(await style.listProfiles()); // for a picker
```

Start the app's own stylesheet with `LAYER_ORDER_CSS` (`@layer app-base, ds-profile, app-override, user;`) and put its defaults in `@layer app-base`: unlayered rules beat every layer. The profile is applied as a constructable stylesheet (or a `<style>` fallback). Tests: `cd packages/web && pnpm test`.

## Swift package: `DevStyleKit`

macOS 14+ and iOS 17+, Swift 6. Add `https://github.com/jsglazer/devstyle` as a SwiftPM dependency (from `1.0.2`).

```swift
import DevStyleKit

@main struct MyApp: App {
    @State private var style = DevStyleStore() // App Group folder, preference from UserDefaults
    var body: some Scene {
        WindowGroup { ContentView().devStyle(style) }
    }
}

struct ContentView: View {
    @Environment(\.dsTheme) private var theme
    var body: some View {
        Text("Hello").font(theme.uiFont).foregroundStyle(theme.color("fg")).background(theme.color("bg"))
    }
}

// Web content: the active profile inside the same cascade layers.
webView.configuration.userContentController.addUserScript(DSWebInjector.userScript(css: theme.profile.css))
```

- The parser reads only `--ds-name: value;` lines and checks each against its token type. Arbitrary CSS never reaches native rendering.
- Missing or invalid values fall back to the built-in Default of the same appearance.
- `DSFontResolver` maps CSS families: `-apple-system`/`system-ui` → system font, `ui-monospace`/`SF Mono` → system monospaced, `serif` → system serif, otherwise the first installed family.
- `store.pairs` lists light/dark pairs for a picker. `store.setShared(...)` changes the choice for every app, and `store.setPreference(...)` changes only this one.
- Tests: `swift test` (Swift Testing).

## Generated files

`node scripts/check.mjs` checks the profiles, then rewrites the generated files: `preview/manifest.js`, `packages/web/src/generated.ts` and `swift/Sources/DevStyleKit/Generated.swift` (the token table and built-in profile text). Run it after changing `tokens.json` or a profile. CI fails if a generated file is stale.

## Roadmap

1. Apps adopt DevStyle in this order: devtex (web) → DevNotes (native) → mdview → pdf-markup. Each app's own Update file covers its work.
2. Future apps start from DevStyle through the Apps NewBuild conventions (`Conventions by Stack`, section B).
3. Later: sync profiles to iPad/iPhone through iCloud.

## Adding a profile

Copy a profile pair, rename both files, update the headers (`name` and `pair`), change values, and run `node scripts/check.mjs` until it reports OK.

## License

MIT
