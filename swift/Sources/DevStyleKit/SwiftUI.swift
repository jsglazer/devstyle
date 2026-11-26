import SwiftUI

private struct DSThemeKey: EnvironmentKey {
    static let defaultValue = DSTheme.builtinDefault(.light)
}

public extension EnvironmentValues {
    /// The DevStyle theme for the current light/dark appearance.
    var dsTheme: DSTheme {
        get { self[DSThemeKey.self] }
        set { self[DSThemeKey.self] = newValue }
    }
}

private struct DevStyleModifier: ViewModifier {
    let store: DevStyleStore
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content.environment(\.dsTheme, store.theme(for: scheme == .dark ? .dark : .light))
    }
}

public extension View {
    /// Put the store's theme for the current appearance into the environment as `\.dsTheme`.
    func devStyle(_ store: DevStyleStore) -> some View {
        modifier(DevStyleModifier(store: store))
    }
}
