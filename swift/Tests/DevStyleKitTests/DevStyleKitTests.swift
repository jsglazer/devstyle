import Foundation
import JavaScriptCore
import Testing
@testable import DevStyleKit

/// A fresh temporary DevStyle folder per test, removed afterwards.
struct TempFolder: ~Copyable {
    let folder: DSFolder

    init() {
        folder = DSFolder(url: FileManager.default.temporaryDirectory
            .appendingPathComponent("devstyle-\(UUID())/DevStyle", isDirectory: true))
    }

    deinit { try? FileManager.default.removeItem(at: folder.url.deletingLastPathComponent()) }
}

@Suite struct ParserTests {
    @Test func builtinsParseCleanly() {
        #expect(DSGenerated.builtinProfiles.count == 8)
        for (id, css) in DSGenerated.builtinProfiles {
            let p = DSProfileParser.parse(id: id, css: css)
            #expect(p.issues == [], "\(id)")
            #expect(p.values.count == DSGenerated.tokens.count, "\(id)")
            #expect(p.header != nil, "\(id)")
        }
    }

    @Test func header() throws {
        let css = try #require(DSGenerated.builtinProfiles["paper-dark"])
        #expect(DSProfileParser.parseHeader(css) == DSProfileHeader(name: "Paper Dark", appearance: .dark, pair: "paper-light"))
    }

    @Test func rejectsBadValuesUnknownTokensAndArbitraryCSS() {
        let css = """
        /* devstyle: name="X" appearance=light pair=y */
        :root { --ds-bg: red; --ds-fg: #112233; --ds-nope: 1px; /* --ds-muted: #000000; */ }
        body { background: url(https://example.org/x.png); }
        """
        let p = DSProfileParser.parse(id: "x", css: css)
        #expect(p.values["bg"] == nil)
        #expect(p.values["muted"] == nil)
        #expect(p.values["fg"] == .color(DSColor(red: 0x11 / 255, green: 0x22 / 255, blue: 0x33 / 255)))
        let all = p.issues.joined(separator: "\n")
        #expect(all.contains("--ds-bg \"red\" is not a valid color"))
        #expect(all.contains("unknown token --ds-nope"))
    }

    @Test func colorParsing() {
        #expect(DSColor(css: "#fff") == DSColor(red: 1, green: 1, blue: 1))
        #expect(abs((DSColor(css: "#00000080")?.alpha ?? 0) - 128.0 / 255) < 0.001)
        #expect(DSColor(css: "rgba(255, 0, 0, 0.5)") == DSColor(red: 1, green: 0, blue: 0, alpha: 0.5))
        #expect(DSColor(css: "rgb(300, 0, 0)") == nil)
        #expect(DSColor(css: "rgba(1, 2, 3)") == nil)
        #expect(DSColor(css: "red") == nil)
        #expect(DSColor(css: "#12") == nil)
    }

    @Test func otherTypes() {
        #expect(DSProfileParser.check(.px, "13px") == .px(13))
        #expect(DSProfileParser.check(.px, "13em") == nil)
        #expect(DSProfileParser.check(.number, "1.5") == .number(1.5))
        #expect(DSProfileParser.check(.font, "'SF Mono', Menlo, monospace") == .font(["SF Mono", "Menlo", "monospace"]))
        #expect(DSProfileParser.check(.font, "x; color: red") == nil)
        #expect(DSProfileParser.check(.filter, "none") == .webOnly("none"))
        #expect(DSProfileParser.check(.shadow, "0 0 1px red; x") == nil)
    }
}

@Suite struct SelectionTests {
    @Test func configParsing() {
        #expect(DSSelection.parseConfig(nil).config == .default)
        #expect(DSSelection.parseConfig(Data("{".utf8)).issues.count == 1)
        let r = DSSelection.parseConfig(Data(#"{"light":"paper-light","dark":"../x"}"#.utf8))
        #expect(r.config == DSSharedConfig(light: "paper-light", dark: "default-dark"))
        #expect(r.issues.count == 1)
        let round = DSSelection.parseConfig(DSSelection.serialize(DSSharedConfig(light: "a", dark: "b")))
        #expect(round.config == DSSharedConfig(light: "a", dark: "b"))
    }

    @Test func resolveFollowAndOptOut() {
        let cfg = DSSharedConfig(light: "paper-light", dark: "paper-dark")
        #expect(DSSelection.resolve(cfg, .followShared, .dark) == "paper-dark")
        let own = DSAppPreference(follow: false, light: "solarized-light")
        #expect(DSSelection.resolve(cfg, own, .light) == "solarized-light")
        #expect(DSSelection.resolve(cfg, own, .dark) == "paper-dark")
    }

    @Test func pairs() {
        let pairs = DSSelection.pairs(DSFolder.listProfiles(in: nil))
        #expect(pairs.map(\.name) == ["Default", "High Contrast", "Paper", "Solarized"])
        #expect(pairs.allSatisfy { $0.light?.appearance == .light && $0.dark?.appearance == .dark })
    }

    @Test func preferenceRoundTripsThroughUserDefaults() throws {
        let d = try #require(UserDefaults(suiteName: "devstyle-test-\(UUID())"))
        #expect(DSAppPreference.load(from: d) == .followShared)
        DSAppPreference(follow: false, dark: "paper-dark").save(to: d)
        #expect(DSAppPreference.load(from: d) == DSAppPreference(follow: false, dark: "paper-dark"))
    }
}

@Suite struct FolderTests {
    @Test func installNeverOverwrites() throws {
        let tmp = TempFolder()
        let folder = tmp.folder
        let light = try #require(folder.profileURL("default-light"))
        try FileManager.default.createDirectory(at: folder.profilesURL, withIntermediateDirectories: true)
        try Data("edited".utf8).write(to: light)
        #expect(try folder.installBuiltins().count == 8) // 7 profiles + devstyle.json
        #expect(try String(contentsOf: light, encoding: .utf8) == "edited")
        #expect(try folder.installBuiltins() == [])
    }

    @Test func upgradesUneditedOldBuiltinsOnly() throws {
        let tmp = TempFolder()
        let folder = tmp.folder
        // 1.0.2 shipped each built-in without the per-level heading tokens
        func old(_ id: String) throws -> String {
            try #require(DSGenerated.builtinProfiles[id])
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.contains("--ds-syn-heading-") || $0.contains("--ds-syn-heading:") }
                .joined(separator: "\n")
        }
        let light = try #require(folder.profileURL("paper-light"))
        let dark = try #require(folder.profileURL("paper-dark"))
        try FileManager.default.createDirectory(at: folder.profilesURL, withIntermediateDirectories: true)
        try Data(old("paper-light").utf8).write(to: light)
        let edited = try old("paper-dark") + "/* mine */\n"
        try Data(edited.utf8).write(to: dark)
        #expect(DSFolder.isOutdatedBuiltin(id: "paper-light", data: Data(try old("paper-light").utf8)))
        #expect(!DSFolder.isOutdatedBuiltin(id: "paper-dark", data: Data(edited.utf8)))
        let written = try folder.installBuiltins()
        #expect(written.contains("profiles/paper-light.css"))
        #expect(!written.contains("profiles/paper-dark.css"))
        #expect(try String(contentsOf: light, encoding: .utf8) == DSGenerated.builtinProfiles["paper-light"])
        #expect(try String(contentsOf: dark, encoding: .utf8) == edited)
        #expect(try folder.installBuiltins() == [])
    }

    @Test func listAndLoadWithFallback() throws {
        let tmp = TempFolder()
        let folder = tmp.folder
        try folder.installBuiltins()
        try Data("/* devstyle: name=\"Mine Light\" appearance=light pair=mine-dark */\n:root{}".utf8)
            .write(to: try #require(folder.profileURL("mine-light")))
        try Data(":root { --ds-bg: #000000; }".utf8).write(to: try #require(folder.profileURL("paper-light")))
        try Data(":root{}".utf8).write(to: folder.profilesURL.appendingPathComponent("junk.css"))
        let ids = folder.listProfiles().map(\.id)
        #expect(ids.contains("mine-light"))
        #expect(!ids.contains("junk"))
        let paper = try #require(folder.loadProfile("paper-light"))
        #expect(paper.header?.name == "Paper Light")
        #expect(paper.issues.contains { $0.contains("using the built-in copy") })
        #expect(folder.loadProfile("../etc") == nil)
        #expect(folder.loadProfile("nope") == nil)
    }

    @Test func watcherSeesConfigChange() async throws {
        let tmp = TempFolder()
        let folder = tmp.folder
        try folder.installBuiltins()
        let seen = AsyncStream<Void>.makeStream()
        let watcher = DSFolderWatcher(folder: folder) { seen.continuation.yield() }
        defer { watcher.cancel() }
        try folder.writeConfig(DSSharedConfig(light: "paper-light", dark: "paper-dark"))
        let got = await withTaskGroup(of: Bool.self) { group in
            group.addTask { for await _ in seen.stream { return true }; return false }
            group.addTask { try? await Task.sleep(for: .seconds(3)); return false }
            let first = await group.next() ?? false
            group.cancelAll()
            seen.continuation.finish()
            return first
        }
        #expect(got, "the watcher should report the devstyle.json change")
    }
}

@MainActor @Suite struct StoreAndThemeTests {
    @Test func storeFollowsSharedAndPreference() throws {
        let tmp = TempFolder()
        let folder = tmp.folder
        let store = DevStyleStore(folder: folder, defaults: nil, watch: false)
        #expect(store.light.profile.id == "default-light")
        #expect(store.dark.profile.id == "default-dark")
        #expect(store.issues == [])
        #expect(store.pairs.count == 4)

        try store.setShared(DSSharedConfig(light: "paper-light", dark: "paper-dark"))
        #expect(store.light.profile.id == "paper-light")

        store.setPreference(DSAppPreference(follow: false, light: "solarized-light"))
        #expect(store.light.profile.id == "solarized-light")
        #expect(store.dark.profile.id == "paper-dark")

        try folder.writeConfig(DSSharedConfig(light: "gone-light", dark: "gone-dark"))
        store.setPreference(.followShared)
        #expect(store.light.profile.id == "default-light")
        #expect(store.issues.contains { $0.contains("gone-light") })
    }

    @Test func storeWithoutFolderUsesBuiltins() {
        let store = DevStyleStore(folder: nil, defaults: nil)
        #expect(store.theme(for: .dark).profile.id == "default-dark")
        #expect(throws: (any Error).self) { try store.setShared(.default) }
    }

    @Test func themeValues() {
        let t = DSTheme.builtinDefault(.dark)
        #expect(t.colorScheme == .dark)
        #expect(t.dsColor("bg") == DSColor(css: "#1e1e20"))
        #expect(t.size("mono-size") == 14)
        #expect(t.size("mono-line-height") == 1.5)
        #expect(t.families("mono-font") == ["SF Mono", "Menlo", "monospace"])
        #expect(t.platformFont("mono-font", sizeToken: "mono-size").isFixedPitch)
        #expect(t.platformFont("ui-font", sizeToken: "ui-size").pointSize == 13)
        // A partial profile falls back to Default for anything it lacks.
        let partial = DSTheme(profile: DSProfileParser.parse(
            id: "p", css: "/* devstyle: name=\"P\" appearance=light pair=q */\n:root { --ds-bg: #000000; }"))
        #expect(partial.dsColor("bg") == DSColor(css: "#000000"))
        #expect(partial.dsColor("fg") == DSColor(css: "#1d1d1f"))
    }

    @Test func fontResolver() {
        #expect(DSFontResolver.font(families: ["ui-monospace"], size: 12).isFixedPitch)
        #expect(DSFontResolver.font(families: ["No Such Font", "Menlo"], size: 12).familyName == "Menlo")
        #expect(DSFontResolver.font(families: ["No Such Font"], size: 0).pointSize == 13)
    }

    @Test func webScriptInjectsCSSVerbatim() throws {
        // Run the script against a tiny fake DOM and check the CSS arrives unchanged,
        // including quotes, backslashes and a closing script tag.
        let css = ":root { --ds-bg: #fff; } /* \"); alert(1); (\" \\ </script> */"
        let ctx = try #require(JSContext())
        ctx.evaluateScript("""
        var nodes = {};
        function el() { return { id: '', textContent: '' }; }
        var head = { firstChild: null, appendChild: function (n) { nodes[n.id] = n; }, insertBefore: function (n) { nodes[n.id] = n; } };
        var document = { head: head, documentElement: head, createElement: el, getElementById: function (id) { return nodes[id] || null; } };
        """)
        ctx.evaluateScript(DSWebInjector.script(css: css))
        #expect(ctx.exception == nil)
        #expect(ctx.evaluateScript("nodes['devstyle-order'].textContent").toString() == DSWebInjector.layerOrderCSS)
        #expect(ctx.evaluateScript("nodes['devstyle-ds-profile'].textContent").toString() == "@layer ds-profile {\n\(css)\n}")
    }
}
