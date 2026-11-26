/**
 * Cascade layers. The order is fixed: an app's own defaults, then the shared profile, then the
 * app's override, then the user's own CSS. Apps should start their stylesheet with
 * LAYER_ORDER_CSS and put their defaults in `@layer app-base`, because unlayered rules beat
 * every layer.
 */
export declare const LAYERS: readonly ["app-base", "ds-profile", "app-override", "user"];
export type Layer = (typeof LAYERS)[number];
export declare const LAYER_ORDER_CSS: string;
export type LayerMode = 'auto' | 'adopted' | 'style';
/** One stylesheet per layer, created on first use, replaced in place on every update. */
export declare class StyleLayers {
    private readonly doc;
    private readonly adopted;
    private readonly sheets;
    private readonly styles;
    private orderSheet;
    private orderStyle;
    constructor(doc?: Document, mode?: LayerMode);
    get usesAdoptedSheets(): boolean;
    /** Replace the contents of one layer. The text is wrapped in `@layer <name> { … }`. */
    set(layer: Layer, css: string): void;
    clear(layer: Layer): void;
    /** Remove everything this instance added. */
    dispose(): void;
    private ensureOrder;
}
