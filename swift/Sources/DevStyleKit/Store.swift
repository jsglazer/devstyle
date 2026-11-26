import Foundation
import Observation

/// One per app: keeps the light and dark themes this app should show, and updates them when
/// the shared folder, the shared choice or this app's preference changes.
///
///     @State var style = DevStyleStore()          // App Group folder, preference from UserDefaults
///     ContentView().devStyle(style)               // then @Environment(\.dsTheme) in views
@MainActor
@Observable
public final class DevStyleStore {
    public private(set) var light: DSTheme
    public private(set) var dark: DSTheme
    public private(set) var config: DSSharedConfig = .default
    public private(set) var issues: [String] = []
    public private(set) var profiles: [DSProfileInfo] = []
    public private(set) var preference: DSAppPreference

    /// nil when the app has no shared folder (no App Group entitlement): built-ins only.
    public let folder: DSFolder?
    private let defaults: UserDefaults?
    @ObservationIgnored private var watcher: DSFolderWatcher?

    /// - Parameters:
    ///   - folder: the shared folder; defaults to the App Group folder.
    ///   - defaults: where this app's preference is stored; nil keeps it in memory only.
    ///   - install: copy missing built-ins and devstyle.json into the folder.
    ///   - watch: re-load when another app changes the folder.
    public init(folder: DSFolder? = DSFolder.appGroup(), defaults: UserDefaults? = .standard,
                install: Bool = true, watch: Bool = true) {
        self.folder = folder
        self.defaults = defaults
        preference = defaults.map { DSAppPreference.load(from: $0) } ?? .followShared
        light = .builtinDefault(.light)
        dark = .builtinDefault(.dark)
        if install, let folder {
            do { try folder.installBuiltins() } catch { issues.append("DevStyle: could not install built-ins (\(error.localizedDescription))") }
        }
        reload()
        if watch, let folder {
            watcher = DSFolderWatcher(folder: folder) { [weak self] in
                MainActor.assumeIsolated { self?.reload() }
            }
        }
    }

    public func theme(for appearance: DSAppearance) -> DSTheme {
        appearance == .dark ? dark : light
    }

    /// Re-read the folder and rebuild both themes.
    public func reload() {
        var found: [String] = []
        if let folder {
            let r = folder.readConfig()
            config = r.config
            found += r.issues
        }
        light = resolve(.light, into: &found)
        dark = resolve(.dark, into: &found)
        profiles = DSFolder.listProfiles(in: folder)
        issues = found
    }

    public func setPreference(_ p: DSAppPreference) {
        preference = p
        if let defaults { p.save(to: defaults) }
        reload()
    }

    /// Change the shared choice for every app that follows it.
    public func setShared(_ config: DSSharedConfig) throws {
        guard let folder else { throw CocoaError(.fileNoSuchFile) }
        try folder.writeConfig(config)
        reload()
    }

    public var pairs: [DSSelection.Pair] { DSSelection.pairs(profiles) }

    private func resolve(_ appearance: DSAppearance, into issues: inout [String]) -> DSTheme {
        let id = DSSelection.resolve(config, preference, appearance)
        guard let p = DSFolder.loadProfile(id, in: folder) else {
            issues.append("profile \"\(id)\" not found; using \(DSSharedConfig.default[appearance])")
            return .builtinDefault(appearance)
        }
        issues += p.issues
        return DSTheme(profile: p)
    }
}
