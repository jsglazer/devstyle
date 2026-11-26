import Foundation

/// The shared profile folder:
///
///     DevStyle/
///       devstyle.json        { "version": 1, "light": "default-light", "dark": "default-dark" }
///       profiles/<id>.css
///
/// On macOS it lives in the App Group container `PWGXN26URQ.com.jsglazer.devstyle`. Sandboxed
/// apps need `com.apple.security.application-groups` with that id in their entitlements.
public struct DSFolder: Sendable, Hashable {
    public static let macGroupId = "PWGXN26URQ.com.jsglazer.devstyle"
    public static let folderName = "DevStyle"
    public static let configFile = "devstyle.json"
    public static let profilesDir = "profiles"

    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    /// The App Group folder, or nil when this app lacks the group entitlement.
    public static func appGroup(_ groupId: String = macGroupId) -> DSFolder? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId)
            .map { DSFolder(url: $0.appendingPathComponent(folderName, isDirectory: true)) }
    }

    public var configURL: URL { url.appendingPathComponent(Self.configFile) }
    public var profilesURL: URL { url.appendingPathComponent(Self.profilesDir, isDirectory: true) }

    public func profileURL(_ id: String) -> URL? {
        DSSelection.isValidId(id) ? profilesURL.appendingPathComponent("\(id).css") : nil
    }

    /// Copy built-in profiles and a default devstyle.json into the folder. Never overwrites
    /// an existing file. Returns the paths written, relative to the folder.
    @discardableResult
    public func installBuiltins() throws -> [String] {
        let fm = FileManager.default
        try fm.createDirectory(at: profilesURL, withIntermediateDirectories: true)
        var written: [String] = []
        for (id, css) in DSGenerated.builtinProfiles.sorted(by: { $0.key < $1.key }) {
            guard let u = profileURL(id), !fm.fileExists(atPath: u.path) else { continue }
            try Data(css.utf8).write(to: u, options: .atomic)
            written.append("\(Self.profilesDir)/\(id).css")
        }
        if !fm.fileExists(atPath: configURL.path) {
            try DSSelection.serialize(.default).write(to: configURL, options: .atomic)
            written.append(Self.configFile)
        }
        return written
    }

    public func readConfig() -> (config: DSSharedConfig, issues: [String]) {
        DSSelection.parseConfig(try? Data(contentsOf: configURL))
    }

    /// Change the shared choice. Every app following the shared style picks this up.
    public func writeConfig(_ config: DSSharedConfig) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        try DSSelection.serialize(config).write(to: configURL, options: .atomic)
    }

    /// Profiles in the folder plus any built-ins it lacks, sorted by name.
    public func listProfiles() -> [DSProfileInfo] {
        DSFolder.listProfiles(in: self)
    }

    static func listProfiles(in folder: DSFolder?) -> [DSProfileInfo] {
        var out: [String: DSProfileInfo] = [:]
        func add(_ id: String, _ text: String) {
            if let h = DSProfileParser.parseHeader(text) {
                out[id] = DSProfileInfo(id: id, name: h.name, appearance: h.appearance, pair: h.pair)
            }
        }
        for (id, css) in DSGenerated.builtinProfiles { add(id, css) }
        if let folder, let files = try? FileManager.default.contentsOfDirectory(atPath: folder.profilesURL.path) {
            for f in files where f.hasSuffix(".css") {
                let id = String(f.dropLast(4))
                guard let u = folder.profileURL(id), let text = try? String(contentsOf: u, encoding: .utf8) else { continue }
                add(id, text)
            }
        }
        return out.values.sorted { $0.name < $1.name }
    }

    /// The folder's copy if present and valid, else the built-in one; nil if neither exists.
    public func loadProfile(_ id: String) -> DSProfile? {
        DSFolder.loadProfile(id, in: self)
    }

    static func loadProfile(_ id: String, in folder: DSFolder?) -> DSProfile? {
        guard DSSelection.isValidId(id) else { return nil }
        let builtin = DSGenerated.builtinProfiles[id]
        if let folder, let u = folder.profileURL(id), let text = try? String(contentsOf: u, encoding: .utf8) {
            let parsed = DSProfileParser.parse(id: id, css: text)
            guard parsed.header == nil, let builtin else { return parsed }
            let fb = DSProfileParser.parse(id: id, css: builtin)
            return DSProfile(id: id, header: fb.header, values: fb.values, css: fb.css,
                             issues: parsed.issues + ["\(id): using the built-in copy instead"] + fb.issues)
        }
        return builtin.map { DSProfileParser.parse(id: id, css: $0) }
    }
}

/// Watches the folder and its profiles directory; calls `onChange` on the main queue.
/// Works across apps: a change written by one app is seen by every other app watching.
public final class DSFolderWatcher: @unchecked Sendable {
    private var sources: [DispatchSourceFileSystemObject] = []

    public init(folder: DSFolder, onChange: @escaping @Sendable () -> Void) {
        try? FileManager.default.createDirectory(at: folder.profilesURL, withIntermediateDirectories: true)
        for dir in [folder.url, folder.profilesURL] {
            let fd = open(dir.path, O_EVTONLY)
            guard fd >= 0 else { continue }
            let src = DispatchSource.makeFileSystemObjectSource(
                fileDescriptor: fd, eventMask: [.write, .rename, .delete, .extend, .attrib], queue: .main)
            src.setEventHandler(handler: onChange)
            src.setCancelHandler { close(fd) }
            src.resume()
            sources.append(src)
        }
    }

    public func cancel() {
        sources.forEach { $0.cancel() }
        sources.removeAll()
    }

    deinit { cancel() }
}
