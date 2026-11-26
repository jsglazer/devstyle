import Foundation
#if canImport(WebKit)
import WebKit
#endif

/// Puts a profile into a web view inside the DevStyle cascade layers
/// (`@layer app-base, ds-profile, app-override, user`). The page's own defaults belong in
/// `@layer app-base`, because unlayered rules beat every layer.
public enum DSWebInjector {
    public static let layerOrderCSS = "@layer app-base, ds-profile, app-override, user;"

    /// JavaScript that creates or replaces `<style id="devstyle-<layer>">` with the CSS.
    public static func script(css: String, layer: String = "ds-profile") -> String {
        let payload = (try? JSONSerialization.data(withJSONObject: [
            "order": layerOrderCSS, "layer": layer, "css": "@layer \(layer) {\n\(css)\n}",
        ])).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return """
        (function (p) {
          var d = document, h = d.head || d.documentElement;
          var o = d.getElementById('devstyle-order');
          if (!o) { o = d.createElement('style'); o.id = 'devstyle-order'; o.textContent = p.order; h.insertBefore(o, h.firstChild); }
          var s = d.getElementById('devstyle-' + p.layer);
          if (!s) { s = d.createElement('style'); s.id = 'devstyle-' + p.layer; h.appendChild(s); }
          s.textContent = p.css;
        })(\(payload));
        """
    }

    #if canImport(WebKit)
    /// A user script that applies the profile before the page renders.
    @MainActor
    public static func userScript(css: String, layer: String = "ds-profile") -> WKUserScript {
        WKUserScript(source: script(css: css, layer: layer), injectionTime: .atDocumentEnd, forMainFrameOnly: true)
    }

    /// Apply a profile to a page that is already loaded.
    @MainActor
    public static func apply(css: String, layer: String = "ds-profile", to webView: WKWebView) {
        webView.evaluateJavaScript(script(css: css, layer: layer), completionHandler: nil)
    }
    #endif
}
