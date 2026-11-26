import Foundation

/// Value types in the token contract (tokens.json).
public enum DSTokenType: String, Sendable, CaseIterable {
    case color, px, number, font
    /// Web only: native apps ignore these.
    case shadow, filter

    public var isNative: Bool { self != .shadow && self != .filter }
}

public struct DSTokenSpec: Sendable, Hashable {
    public let name: String
    public let group: String
    public let type: DSTokenType
    public init(name: String, group: String, type: DSTokenType) {
        self.name = name
        self.group = group
        self.type = type
    }
}

public enum DSAppearance: String, Sendable, Codable, CaseIterable {
    case light, dark
}

/// The header line of a profile: `/* devstyle: name="…" appearance=light|dark pair=<id> */`.
public struct DSProfileHeader: Sendable, Hashable {
    public let name: String
    public let appearance: DSAppearance
    public let pair: String
}

public struct DSProfileInfo: Sendable, Hashable, Identifiable {
    /// File id: the file name without `.css`.
    public let id: String
    public let name: String
    public let appearance: DSAppearance
    public let pair: String
}

/// `devstyle.json` in the shared folder: which profile pair every app follows.
public struct DSSharedConfig: Sendable, Hashable, Codable {
    public var version: Int = 1
    public var light: String
    public var dark: String

    public init(light: String, dark: String) {
        self.light = light
        self.dark = dark
    }

    public static let `default` = DSSharedConfig(light: "default-light", dark: "default-dark")

    public subscript(_ appearance: DSAppearance) -> String {
        appearance == .light ? light : dark
    }
}

/// Per-app choice, stored by each app in its own settings. `follow == true` (the default)
/// uses the shared devstyle.json; otherwise the app's own picks.
public struct DSAppPreference: Sendable, Hashable, Codable {
    public var follow: Bool
    public var light: String?
    public var dark: String?

    public init(follow: Bool = true, light: String? = nil, dark: String? = nil) {
        self.follow = follow
        self.light = light
        self.dark = dark
    }

    public static let followShared = DSAppPreference()

    /// UserDefaults key every app uses for its preference.
    public static let defaultsKey = "DevStylePreference"

    public static func load(from defaults: UserDefaults = .standard) -> DSAppPreference {
        guard let data = defaults.data(forKey: defaultsKey),
              let p = try? JSONDecoder().decode(DSAppPreference.self, from: data) else { return .followShared }
        return p
    }

    public func save(to defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: Self.defaultsKey) }
    }
}
