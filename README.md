# DevStyle

One shared look for all my apps (devtex, mdview, pdf-markup, DevNotes, and future apps). DevStyle defines a fixed list of named style values (`--ds-*` CSS variables) and a set of **profiles**, each a small CSS file that sets every value. Each app reads the active profile in its own way, so changing the profile restyles every app.

Status: **1.0.0: contract and sample profiles.** The web loader package, the Swift `DevStyleKit` package, the shared profile folder and the app changes come next (see [Roadmap](#roadmap)).

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

## Roadmap

1. `@devstyle/web`: the layer order, plus a loader that reads a profile, applies it as a constructable stylesheet and reloads it on change.
2. `DevStyleKit` (Swift package): parser and checker, SwiftUI `Color`/`Font` values, and WKWebView injection.
3. A shared profile folder with `devstyle.json` (`{ "light": "default-light", "dark": "default-dark" }`) that every app watches, so one change restyles all apps. Sandboxed apps need an App Group container; this needs checking for Developer ID apps on current macOS. Each app gets a "Follow shared style / Use my own" switch.
4. Adoption order: devtex (web) → DevNotes (native) → mdview → pdf-markup. Future apps start from DevStyle via the Apps NewBuild checklist.
5. Later: sync profiles to iPad/iPhone through iCloud.

## Adding a profile

Copy a profile pair, rename both files, update the headers (`name` and `pair`), change values, and run `node scripts/check.mjs` until it reports OK.

## License

MIT
