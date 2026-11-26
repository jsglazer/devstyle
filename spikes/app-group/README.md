# Spike: shared DevStyle folder in an App Group container

**Result (2026-11-26, macOS 26.6.2): PASS.** Sandboxed apps signed with the Developer ID can share a folder through the team-prefixed App Group `PWGXN26URQ.com.jsglazer.devstyle`. No provisioning profile is needed, and no permission prompt appeared.

## What was tested

`probe.swift` is built into three tiny sandboxed apps by `build.sh` (Developer ID signature, hardened runtime, secure timestamp), plus one unsandboxed binary.

| # | Test | Result |
|---|---|---|
| 1 | DSProbeA (sandboxed, group entitlement) writes `DevStyle/devstyle.json` and a profile through `containerURL(forSecurityApplicationGroupIdentifier:)` | PASS. Container is `~/Library/Group Containers/PWGXN26URQ.com.jsglazer.devstyle` |
| 2 | DSProbeB (a different bundle id, same group) reads them | PASS |
| 3 | B writes and A reads, both launched through LaunchServices (`open`), as a user would | PASS |
| 4 | DSProbeA notarized and stapled (`spctl`: accepted, Notarized Developer ID), launched with `open`, reads | PASS. The system log showed no denials or prompts |
| 5 | Unsandboxed binary (the devtex/Tauri case) reads the folder by its literal path | PASS |
| 6 | Control: DSProbeC (sandboxed, **no** group entitlement) reads by literal path | Denied, as it should be |
| 7 | B watches the folder (DispatchSource on the directory) while A rewrites `devstyle.json` | PASS. B saw the change immediately, so live restyling of every app works |

## Consequences for DevStyle

- Each sandboxed Mac app adds `com.apple.security.application-groups = [PWGXN26URQ.com.jsglazer.devstyle]` to its entitlements and finds the folder with `containerURL(forSecurityApplicationGroupIdentifier:)`.
- devtex isn't sandboxed and reads `~/Library/Group Containers/PWGXN26URQ.com.jsglazer.devstyle/DevStyle/` directly. Its Tauri capability or fsguard must allow that path.
- Watching the directory is enough to notice changes made by another app.
- Not tested: a quarantined first launch (it would only show the normal "downloaded from the Internet" dialog, which has nothing to do with groups), and iOS. On iOS, group ids must be `group.`-prefixed and registered with provisioning profiles, so iOS apps would use a separate group, which is fine since that data doesn't cross devices anyway. Syncing between Mac and iPad stays the later iCloud step.

## Re-run

```sh
./build.sh
build/DSProbeA.app/Contents/MacOS/DSProbeA write test1
build/DSProbeB.app/Contents/MacOS/DSProbeB read
build/DSProbeC.app/Contents/MacOS/DSProbeC direct   # should be denied
```
