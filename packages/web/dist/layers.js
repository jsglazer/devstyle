/**
 * Cascade layers. The order is fixed: an app's own defaults, then the shared profile, then the
 * app's override, then the user's own CSS. Apps should start their stylesheet with
 * LAYER_ORDER_CSS and put their defaults in `@layer app-base`, because unlayered rules beat
 * every layer.
 */
export const LAYERS = ['app-base', 'ds-profile', 'app-override', 'user'];
export const LAYER_ORDER_CSS = `@layer ${LAYERS.join(', ')};`;
function supportsAdopted(doc) {
    const view = doc.defaultView;
    if (view === null || !('adoptedStyleSheets' in doc))
        return false;
    try {
        const sheet = new view.CSSStyleSheet();
        return typeof sheet.replaceSync === 'function';
    }
    catch {
        return false;
    }
}
/** One stylesheet per layer, created on first use, replaced in place on every update. */
export class StyleLayers {
    doc;
    adopted;
    sheets = new Map();
    styles = new Map();
    orderSheet = null;
    orderStyle = null;
    constructor(doc = document, mode = 'auto') {
        this.doc = doc;
        this.adopted = mode === 'adopted' || (mode === 'auto' && supportsAdopted(doc));
    }
    get usesAdoptedSheets() {
        return this.adopted;
    }
    /** Replace the contents of one layer. The text is wrapped in `@layer <name> { … }`. */
    set(layer, css) {
        this.ensureOrder();
        const text = `@layer ${layer} {\n${css}\n}`;
        if (this.adopted) {
            let sheet = this.sheets.get(layer);
            if (sheet === undefined) {
                const view = this.doc.defaultView;
                sheet = new view.CSSStyleSheet();
                this.sheets.set(layer, sheet);
                this.doc.adoptedStyleSheets = [...this.doc.adoptedStyleSheets, sheet];
            }
            sheet.replaceSync(text);
            return;
        }
        let el = this.styles.get(layer);
        if (el === undefined) {
            el = this.doc.createElement('style');
            el.dataset['devstyleLayer'] = layer;
            this.doc.head.append(el);
            this.styles.set(layer, el);
        }
        el.textContent = text;
    }
    clear(layer) {
        if (this.adopted)
            this.sheets.get(layer)?.replaceSync('');
        else {
            const el = this.styles.get(layer);
            if (el !== undefined)
                el.textContent = '';
        }
    }
    /** Remove everything this instance added. */
    dispose() {
        const mine = new Set(this.sheets.values());
        if (this.orderSheet !== null)
            mine.add(this.orderSheet);
        if (mine.size > 0)
            this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((s) => !mine.has(s));
        for (const el of this.styles.values())
            el.remove();
        this.orderStyle?.remove();
        this.sheets.clear();
        this.styles.clear();
        this.orderSheet = null;
        this.orderStyle = null;
    }
    ensureOrder() {
        if (this.orderSheet !== null || this.orderStyle !== null)
            return;
        if (this.adopted) {
            const view = this.doc.defaultView;
            const sheet = new view.CSSStyleSheet();
            sheet.replaceSync(LAYER_ORDER_CSS);
            this.doc.adoptedStyleSheets = [sheet, ...this.doc.adoptedStyleSheets];
            this.orderSheet = sheet;
        }
        else {
            const el = this.doc.createElement('style');
            el.dataset['devstyleLayer'] = 'order';
            el.textContent = LAYER_ORDER_CSS;
            this.doc.head.prepend(el);
            this.orderStyle = el;
        }
    }
}
