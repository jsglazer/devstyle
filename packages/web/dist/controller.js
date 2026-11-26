/**
 * DevStyle controller for one web view: loads the shared choice and the app's preference,
 * applies the right profile for the current light/dark appearance, and re-applies whenever
 * the appearance, the folder or the preference changes.
 */
import { installBuiltins, loadProfile, listProfiles, CONFIG_FILE } from './folder.js';
import { StyleLayers } from './layers.js';
import { DEFAULT_CONFIG, DEFAULT_PREFERENCE, parseConfig, resolveProfileId, serializeConfig, } from './select.js';
const DARK_QUERY = '(prefers-color-scheme: dark)';
export class DevStyle {
    opts;
    layers;
    preference;
    media;
    unwatch = null;
    queue = Promise.resolve();
    last = null;
    onMedia = () => void this.refresh();
    constructor(opts) {
        this.opts = opts;
        const doc = opts.doc ?? document;
        this.layers = new StyleLayers(doc, opts.layerMode ?? 'auto');
        this.preference = opts.preference ?? DEFAULT_PREFERENCE;
        const mm = opts.matchMedia ?? doc.defaultView?.matchMedia?.bind(doc.defaultView);
        this.media = mm === undefined ? null : mm(DARK_QUERY);
    }
    get state() {
        return this.last;
    }
    get appearance() {
        return this.media?.matches === true ? 'dark' : 'light';
    }
    /** Install built-ins (unless disabled), apply, and start following changes. */
    async start() {
        const host = this.opts.host;
        if (host !== null && this.opts.install !== false)
            await installBuiltins(host);
        this.media?.addEventListener('change', this.onMedia);
        if (host?.watch !== undefined)
            this.unwatch = host.watch(() => void this.refresh());
        return this.refresh();
    }
    stop() {
        this.media?.removeEventListener('change', this.onMedia);
        this.unwatch?.();
        this.unwatch = null;
    }
    /** Re-read the folder and re-apply. Calls are serialized, so rapid changes apply in order. */
    refresh() {
        const run = this.queue.then(() => this.apply());
        this.queue = run.catch(() => undefined);
        return run;
    }
    async setPreference(preference) {
        this.preference = preference;
        return this.refresh();
    }
    /** Change the shared choice. Every app following the shared style picks this up. */
    async setShared(config) {
        if (this.opts.host === null)
            throw new Error('DevStyle: no shared folder');
        await this.opts.host.write(CONFIG_FILE, serializeConfig({ version: 1, ...config }));
        await this.refresh();
    }
    /** Profiles available for a picker (folder plus built-ins). */
    listProfiles() {
        return listProfiles(this.opts.host);
    }
    /** Set the app-override or user layer (the profile layer is managed by the controller). */
    setLayer(layer, css) {
        this.layers.set(layer, css);
    }
    async apply() {
        const host = this.opts.host;
        const appearance = this.appearance;
        const { config, issues } = parseConfig(host === null ? null : await host.read(CONFIG_FILE));
        const wanted = resolveProfileId(config, this.preference, appearance);
        let profile = await loadProfile(host, wanted);
        if (profile === null) {
            issues.push(`profile "${wanted}" not found; using ${DEFAULT_CONFIG[appearance]}`);
            profile = (await loadProfile(null, DEFAULT_CONFIG[appearance]));
        }
        if (profile.header !== null && profile.header.appearance !== appearance)
            issues.push(`profile "${profile.id}" is a ${profile.header.appearance} profile, shown in ${appearance} mode`);
        issues.push(...profile.issues);
        this.layers.set('ds-profile', profile.css);
        const state = { appearance, profile, config, preference: this.preference, issues };
        this.last = state;
        this.opts.onApply?.(state);
        return state;
    }
}
