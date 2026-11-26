import Foundation

/// An RGBA colour with components in 0…1.
public struct DSColor: Sendable, Hashable {
    public var red: Double, green: Double, blue: Double, alpha: Double

    public init(red: Double, green: Double, blue: Double, alpha: Double = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    /// Parses `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(r, g, b)` and `rgba(r, g, b, a)` only.
    public init?(css: String) {
        let s = css.trimmingCharacters(in: .whitespaces).lowercased()
        if s.hasPrefix("#") {
            var hex = String(s.dropFirst())
            guard [3, 6, 8].contains(hex.count), hex.allSatisfy(\.isHexDigit) else { return nil }
            if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
            let v = UInt64(hex, radix: 16) ?? 0
            let c = { (shift: UInt64) in Double((v >> shift) & 0xff) / 255 }
            if hex.count == 8 { self.init(red: c(24), green: c(16), blue: c(8), alpha: c(0)) }
            else { self.init(red: c(16), green: c(8), blue: c(0)) }
            return
        }
        guard let open = s.firstIndex(of: "("), s.hasSuffix(")") else { return nil }
        let fn = s[..<open]
        let parts = s[s.index(after: open)..<s.index(before: s.endIndex)]
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard (fn == "rgb" && parts.count == 3) || (fn == "rgba" && parts.count == 4) else { return nil }
        let rgb = parts.prefix(3).compactMap { Int($0) }.filter { (0...255).contains($0) }
        guard rgb.count == 3 else { return nil }
        var a = 1.0
        if parts.count == 4 {
            guard let v = Double(parts[3]), (0...1).contains(v) else { return nil }
            a = v
        }
        self.init(red: Double(rgb[0]) / 255, green: Double(rgb[1]) / 255, blue: Double(rgb[2]) / 255, alpha: a)
    }
}

/// A checked token value. Web-only types (shadow, filter) are kept as text and not used natively.
public enum DSValue: Sendable, Hashable {
    case color(DSColor)
    case px(Double)
    case number(Double)
    case font([String])
    case webOnly(String)
}

public struct DSProfile: Sendable, Hashable, Identifiable {
    public let id: String
    /// nil when the header line is missing or malformed.
    public let header: DSProfileHeader?
    public let values: [String: DSValue]
    /// The full CSS text, for web views.
    public let css: String
    public let issues: [String]
}

/// Reads only `--ds-name: value;` declarations and checks each against its token type.
/// Arbitrary CSS never reaches native rendering: anything else in the file is ignored.
public enum DSProfileParser {
    static let tokensByName = Dictionary(uniqueKeysWithValues: DSGenerated.tokens.map { ($0.name, $0) })
    static let declarationRegex = try? NSRegularExpression(pattern: #"--ds-([a-z0-9-]+)\s*:\s*([^;]+);"#)

    public static func parseHeader(_ text: String) -> DSProfileHeader? {
        let pattern = #"^\s*/\* devstyle: name="([^"]+)" appearance=(light|dark) pair=([a-z0-9-]+) \*/"#
        guard let re = try? NSRegularExpression(pattern: pattern),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let name = Range(m.range(at: 1), in: text).map({ String(text[$0]) }),
              let app = Range(m.range(at: 2), in: text).flatMap({ DSAppearance(rawValue: String(text[$0])) }),
              let pair = Range(m.range(at: 3), in: text).map({ String(text[$0]) }) else { return nil }
        return DSProfileHeader(name: name, appearance: app, pair: pair)
    }

    public static func parse(id: String, css: String) -> DSProfile {
        var issues: [String] = []
        let header = parseHeader(css)
        if header == nil { issues.append("\(id): missing or malformed devstyle header line") }
        let body = css.replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
        var values: [String: DSValue] = [:]
        let matches = declarationRegex?.matches(in: body, range: NSRange(body.startIndex..., in: body)) ?? []
        for m in matches {
            guard let nr = Range(m.range(at: 1), in: body), let vr = Range(m.range(at: 2), in: body) else { continue }
            let name = String(body[nr])
            let raw = body[vr].trimmingCharacters(in: .whitespaces)
            guard let spec = tokensByName[name] else {
                issues.append("\(id): unknown token --ds-\(name) (ignored)")
                continue
            }
            guard let value = check(spec.type, raw) else {
                issues.append("\(id): --ds-\(name) \"\(raw)\" is not a valid \(spec.type.rawValue) (ignored)")
                continue
            }
            values[name] = value
        }
        for t in DSGenerated.tokens where values[t.name] == nil { issues.append("\(id): missing --ds-\(t.name)") }
        return DSProfile(id: id, header: header, values: values, css: css, issues: issues)
    }

    static func check(_ type: DSTokenType, _ raw: String) -> DSValue? {
        switch type {
        case .color:
            return DSColor(css: raw).map(DSValue.color)
        case .px:
            guard raw.hasSuffix("px"), let v = Double(raw.dropLast(2)), v >= 0 else { return nil }
            return .px(v)
        case .number:
            guard raw.allSatisfy({ $0.isNumber || $0 == "." }), let v = Double(raw) else { return nil }
            return .number(v)
        case .font:
            guard raw.range(of: #"^[\w\s,'"-]+$"#, options: .regularExpression) != nil else { return nil }
            let names = raw.split(separator: ",").map {
                $0.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "'\""))
            }.filter { !$0.isEmpty }
            return names.isEmpty ? nil : .font(names)
        case .shadow:
            return raw.isEmpty || raw.contains(where: { ";{}".contains($0) }) ? nil : .webOnly(raw)
        case .filter:
            return raw == "none" || raw.range(of: #"^([a-z-]+\([^)]*\)\s*)+$"#, options: .regularExpression) != nil
                ? .webOnly(raw) : nil
        }
    }
}
