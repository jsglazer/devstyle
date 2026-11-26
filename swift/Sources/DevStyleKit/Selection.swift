import Foundation

public enum DSSelection {
    static let idPattern = #"^[a-z0-9-]+$"#

    static func isValidId(_ id: String) -> Bool {
        id.range(of: idPattern, options: .regularExpression) != nil
    }

    /// Parse devstyle.json. Missing, invalid or partial files fall back to the defaults.
    public static func parseConfig(_ data: Data?) -> (config: DSSharedConfig, issues: [String]) {
        guard let data else { return (.default, []) }
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (.default, ["devstyle.json: not a valid JSON object"])
        }
        var issues: [String] = []
        func pick(_ key: String, _ fallback: String) -> String {
            if let v = obj[key] as? String, isValidId(v) { return v }
            if obj[key] != nil { issues.append("devstyle.json: \"\(key)\" must be a profile id") }
            return fallback
        }
        return (DSSharedConfig(light: pick("light", DSSharedConfig.default.light),
                               dark: pick("dark", DSSharedConfig.default.dark)), issues)
    }

    public static func serialize(_ config: DSSharedConfig) -> Data {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        return (try? enc.encode(config)) ?? Data()
    }

    /// The profile id an app should show for this appearance.
    public static func resolve(_ config: DSSharedConfig, _ preference: DSAppPreference, _ appearance: DSAppearance) -> String {
        if preference.follow { return config[appearance] }
        return (appearance == .light ? preference.light : preference.dark) ?? config[appearance]
    }

    public struct Pair: Sendable, Hashable, Identifiable {
        public var id: String { light?.id ?? dark?.id ?? name }
        public let name: String
        public let light: DSProfileInfo?
        public let dark: DSProfileInfo?
    }

    /// Group profiles into light/dark pairs for a picker, sorted by name.
    public static func pairs(_ profiles: [DSProfileInfo]) -> [Pair] {
        let byId = Dictionary(profiles.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var seen = Set<String>()
        var out: [Pair] = []
        for p in profiles.sorted(by: { $0.name < $1.name }) where !seen.contains(p.id) {
            seen.insert(p.id)
            var other: DSProfileInfo?
            if let o = byId[p.pair], o.pair == p.id, o.appearance != p.appearance {
                other = o
                seen.insert(o.id)
            }
            let name = p.name.replacingOccurrences(of: #"\s+(Light|Dark)$"#, with: "", options: .regularExpression)
            out.append(Pair(name: name,
                            light: p.appearance == .light ? p : other,
                            dark: p.appearance == .dark ? p : other))
        }
        return out.sorted { $0.name < $1.name }
    }
}
