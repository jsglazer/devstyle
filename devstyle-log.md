# devstyle log

## 2026-11-26 — 1.0.0: repo, token contract, sample profiles

**Prompt:** "devtex Update003 is running now :( … 3. ok -- can you create the repo or do I need to do it? It will live in `~/Dev/2-Projects/Other/devstyle` locally so I can also have it on laptop MBA; yes pleaes built those sample styles … I suppose it's worth asking if all 4 apps could be rebuilt the same way to make this easier..." Answers given in the question dialog: public repo, devtex look as Default, build now.

**Output:** Created https://github.com/jsglazer/devstyle (public) from `~/Dev/2-Projects/Other/devstyle`, commit `7c38b83`. Contents: `tokens.json` (59 tokens, 9 groups), 8 profiles in `profiles/`, `scripts/check.mjs` (header, completeness, types, pairs, WCAG contrast; writes `preview/manifest.js`), `preview/index.html`, README, MIT LICENSE, CI workflow. The first check failed 14 contrast pairs (mostly Solarized, plus line numbers in Default Light and Paper Light). I fixed the values, and the check passes. I rendered Default Light, Solarized Dark, Paper Light and High Contrast Dark headless in Chrome and looked at them, which caught an editor line-spacing bug in the preview page, now fixed.

| # | Issue | Fix |
|---|---|---|
| 1 | No shared style contract across apps | `tokens.json`: 59 typed `--ds-*` tokens |
| 2 | Sample profiles requested | Default, Paper, High Contrast, Solarized, each light and dark |
| 3 | Profiles could drift or be unreadable | `scripts/check.mjs` checks completeness, types, pairs and contrast; CI runs it |
| 4 | Solarized and two gutters failed contrast | Adjusted text, accent and comment colours slightly |
| 5 | Preview editor showed blank lines between code lines | `white-space: pre` only on line divs |

**Session summary (as presented):**

I created the repo myself: **https://github.com/jsglazer/devstyle** (public), cloned locally at `~/Dev/2-Projects/Other/devstyle`. To get it on the MBA, run `gh repo clone jsglazer/devstyle ~/Dev/2-Projects/Other/devstyle`.

**What's in 1.0.0**
- `tokens.json` is the contract: 59 named style values in 9 groups (surface, text, accent, status, editing, syntax, type, shape, page). Each has a type, so native apps can check it.
- **8 profiles:** Default (DevTex's current look), Paper, High Contrast and Solarized, each as a Light and Dark pair.
- `scripts/check.mjs` fails a profile that's missing a value, has a wrong value type or a broken light/dark pair, or has text too faint to read (WCAG contrast). Its first run caught 14 low-contrast pairs, mostly in Solarized, whose standard colours are famously soft. I adjusted those slightly, and it now passes. GitHub CI runs it on every push.
- `preview/index.html` is a mock DevTex screen (toolbar, outline, editor with syntax colours and highlights, preview, PDF pages, dialog, status bar) styled only with the shared values. You can pick a profile, switch to its pair, show all 8 side by side, and see every value. Open it in a browser. I rendered four of the profiles and checked them by eye.

**devtex Update003 running now:** it's fine to let it finish. The only extra work later is making devtex's own `--dt-` names aliases of the `--ds-` ones and pointing its loader at the shared folder. Its own `themes/` folder becomes the per-app override layer. That's a small change, not a redo.

**Should all 4 apps be rebuilt the same way?** My advice: no. DevStyle already makes the different stacks cheap to support. There are only two adapters to write, once each: a web loader and a Swift `DevStyleKit`. A rewrite would cost far more:
- DevNotes is native on purpose. It has native text editing, CloudKit sync and iOS, plus the rule that arbitrary CSS never reaches native text. Rewriting it as a web app would lose those and would be the biggest job of the four.
- mdview and pdf-markup already share one pattern: a native Swift window with web content inside it. So the apps are less mixed than they look: really two patterns, plus devtex on Tauri.
- **For future apps**, I'd make that Swift-window-plus-web-content pattern the standard. Apple's sandbox, App Groups (the shared profile folder) and iCloud are all easiest there, and both DevStyle adapters apply. Go fully native only when the text editing itself must be native, as in DevNotes. I'd add this to the Apps NewBuild checklist along with DevStyle.

**Assumptions I made:** apps can opt out of the shared style (with "follow shared" as the default), and iPad/iPhone sync is a later step. Both are written into the README roadmap.

**Not done yet:** the web loader, `DevStyleKit`, the shared folder (App Group, which still needs checking for apps distributed outside the App Store), and the app changes. There's also no VaultDEV project folder or Dev file for devstyle yet. I can create `~/VaultDEV/2-Projects/Other/devstyle/` with a Dev file and an Update000 for the next phase if you want.
