import SwiftUI
#if canImport(AppKit)
import AppKit
public typealias DSPlatformColor = NSColor
public typealias DSPlatformFont = NSFont
#elseif canImport(UIKit)
import UIKit
public typealias DSPlatformColor = UIColor
public typealias DSPlatformFont = UIFont
#endif

/// Native view of one profile: colours, fonts and sizes by token name.
/// Missing or invalid values fall back to the built-in Default profile of the same appearance.
public struct DSTheme: Sendable, Hashable {
    public let profile: DSProfile
    public let appearance: DSAppearance
    private let fallback: [String: DSValue]

    public init(profile: DSProfile) {
        self.profile = profile
        appearance = profile.header?.appearance ?? .light
        let base = DSSharedConfig.default[appearance]
        fallback = DSGenerated.builtinProfiles[base].map { DSProfileParser.parse(id: base, css: $0).values } ?? [:]
    }

    /// The built-in Default theme for an appearance.
    public static func builtinDefault(_ appearance: DSAppearance) -> DSTheme {
        let id = DSSharedConfig.default[appearance]
        return DSTheme(profile: DSProfileParser.parse(id: id, css: DSGenerated.builtinProfiles[id] ?? ""))
    }

    public var colorScheme: ColorScheme { appearance == .dark ? .dark : .light }

    public func value(_ token: String) -> DSValue? { profile.values[token] ?? fallback[token] }

    // MARK: colours

    public func dsColor(_ token: String) -> DSColor {
        if case .color(let c)? = value(token) { return c }
        return DSColor(red: 1, green: 0, blue: 1) // magenta: a token that is not a colour
    }

    public func platformColor(_ token: String) -> DSPlatformColor {
        let c = dsColor(token)
        #if canImport(AppKit)
        return NSColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        #else
        return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        #endif
    }

    public func color(_ token: String) -> Color {
        let c = dsColor(token)
        return Color(.sRGB, red: c.red, green: c.green, blue: c.blue, opacity: c.alpha)
    }

    // MARK: sizes

    public func size(_ token: String) -> CGFloat {
        switch value(token) {
        case .px(let v)?, .number(let v)?: return CGFloat(v)
        default: return 0
        }
    }

    // MARK: fonts

    public func families(_ token: String) -> [String] {
        if case .font(let names)? = value(token) { return names }
        return ["-apple-system"]
    }

    /// Platform font for a font token at a size token (e.g. "mono-font", "mono-size").
    public func platformFont(_ fontToken: String, sizeToken: String, scale: CGFloat = 1) -> DSPlatformFont {
        DSFontResolver.font(families: families(fontToken), size: size(sizeToken) * scale)
    }

    public func font(_ fontToken: String, sizeToken: String, scale: CGFloat = 1) -> Font {
        Font(platformFont(fontToken, sizeToken: sizeToken, scale: scale))
    }

    public var uiFont: Font { font("ui-font", sizeToken: "ui-size") }
    public var monoFont: Font { font("mono-font", sizeToken: "mono-size") }
    public var proseFont: Font { font("prose-font", sizeToken: "prose-size") }
    public func headingFont(scale: CGFloat) -> Font { font("heading-font", sizeToken: "prose-size", scale: scale) }
}

/// Maps CSS font-family lists to installed platform fonts. CSS generic and system names map
/// to the system fonts; the first installed named family wins.
public enum DSFontResolver {
    static let systemNames: Set<String> = ["-apple-system", "system-ui", "blinkmacsystemfont", "sf pro text", "sf pro", "sans-serif"]
    static let monoNames: Set<String> = ["ui-monospace", "sf mono", "monospace"]
    static let serifNames: Set<String> = ["serif", "ui-serif", "new york"]

    public static func font(families: [String], size: CGFloat) -> DSPlatformFont {
        let size = size > 0 ? size : 13
        for raw in families {
            let name = raw.lowercased()
            if systemNames.contains(name) { return .systemFont(ofSize: size) }
            if monoNames.contains(name) { return .monospacedSystemFont(ofSize: size, weight: .regular) }
            if serifNames.contains(name), let f = serif(size) { return f }
            if let f = named(raw, size) { return f }
        }
        return .systemFont(ofSize: size)
    }

    static func named(_ family: String, _ size: CGFloat) -> DSPlatformFont? {
        #if canImport(AppKit)
        return NSFontManager.shared.font(withFamily: family, traits: [], weight: 5, size: size)
        #else
        return UIFont.fontNames(forFamilyName: family).first.flatMap { UIFont(name: $0, size: size) }
        #endif
    }

    static func serif(_ size: CGFloat) -> DSPlatformFont? {
        let base = DSPlatformFont.systemFont(ofSize: size)
        #if canImport(AppKit)
        return base.fontDescriptor.withDesign(.serif).flatMap { NSFont(descriptor: $0, size: size) }
        #else
        return base.fontDescriptor.withDesign(.serif).map { UIFont(descriptor: $0, size: size) }
        #endif
    }
}
