/**
 * DevStyle controller for one web view: loads the shared choice and the app's preference,
 * applies the right profile for the current light/dark appearance, and re-applies whenever
 * the appearance, the folder or the preference changes.
 */
import { installBuiltins, loadProfile, listProfiles, CONFIG_FILE, type FolderHost } from './folder.js';
import { StyleLayers, type Layer, type LayerMode } from './layers.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_PREFERENCE,
  parseConfig,
  resolveProfileId,
  serializeConfig,
} from './select.js';
import type { AppPreference, Appearance, ParsedProfile, ProfileInfo, SharedConfig } from './types.js';

export interface DevStyleOptions {
  /** The shared folder, or null to use only the built-in profiles. */
  host: FolderHost | null;
  /** This app's preference (default: follow the shared choice). */
  preference?: AppPreference;
  /** Copy missing built-ins and devstyle.json into the folder on start (default true). */
  install?: boolean;
  doc?: Document;
  /** Defaults to the document window's matchMedia. */
  matchMedia?: (query: string) => MediaQueryList;
  layerMode?: LayerMode;
  /** Called after every apply, e.g. to set the native window appearance or show issues. */
  onApply?: (state: DevStyleState) => void;
}

export interface DevStyleState {
  appearance: Appearance;
  profile: ParsedProfile;
  config: SharedConfig;
  preference: AppPreference;
  issues: string[];
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export class DevStyle {
  readonly layers: StyleLayers;
  private preference: AppPreference;
  private readonly media: MediaQueryList | null;
  private unwatch: (() => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private last: DevStyleState | null = null;
  private readonly onMedia = (): void => void this.refresh();

  constructor(private readonly opts: DevStyleOptions) {
    const doc = opts.doc ?? document;
    this.layers = new StyleLayers(doc, opts.layerMode ?? 'auto');
    this.preference = opts.preference ?? DEFAULT_PREFERENCE;
    const mm = opts.matchMedia ?? doc.defaultView?.matchMedia?.bind(doc.defaultView);
    this.media = mm === undefined ? null : mm(DARK_QUERY);
  }

  get state(): DevStyleState | null {
    return this.last;
  }

  get appearance(): Appearance {
    return this.media?.matches === true ? 'dark' : 'light';
  }

  /** Install built-ins (unless disabled), apply, and start following changes. */
  async start(): Promise<DevStyleState> {
    const host = this.opts.host;
    if (host !== null && this.opts.install !== false) await installBuiltins(host);
    this.media?.addEventListener('change', this.onMedia);
    if (host?.watch !== undefined) this.unwatch = host.watch(() => void this.refresh());
    return this.refresh();
  }

  stop(): void {
    this.media?.removeEventListener('change', this.onMedia);
    this.unwatch?.();
    this.unwatch = null;
  }

  /** Re-read the folder and re-apply. Calls are serialized, so rapid changes apply in order. */
  refresh(): Promise<DevStyleState> {
    const run = this.queue.then(() => this.apply());
    this.queue = run.catch(() => undefined);
    return run;
  }

  async setPreference(preference: AppPreference): Promise<DevStyleState> {
    this.preference = preference;
    return this.refresh();
  }

  /** Change the shared choice. Every app following the shared style picks this up. */
  async setShared(config: Omit<SharedConfig, 'version'>): Promise<void> {
    if (this.opts.host === null) throw new Error('DevStyle: no shared folder');
    await this.opts.host.write(CONFIG_FILE, serializeConfig({ version: 1, ...config }));
    await this.refresh();
  }

  /** Profiles available for a picker (folder plus built-ins). */
  listProfiles(): Promise<ProfileInfo[]> {
    return listProfiles(this.opts.host);
  }

  /** Set the app-override or user layer (the profile layer is managed by the controller). */
  setLayer(layer: Exclude<Layer, 'ds-profile'>, css: string): void {
    this.layers.set(layer, css);
  }

  private async apply(): Promise<DevStyleState> {
    const host = this.opts.host;
    const appearance = this.appearance;
    const { config, issues } = parseConfig(host === null ? null : await host.read(CONFIG_FILE));
    const wanted = resolveProfileId(config, this.preference, appearance);
    let profile = await loadProfile(host, wanted);
    if (profile === null) {
      issues.push(`profile "${wanted}" not found; using ${DEFAULT_CONFIG[appearance]}`);
      profile = (await loadProfile(null, DEFAULT_CONFIG[appearance])) as ParsedProfile;
    }
    if (profile.header !== null && profile.header.appearance !== appearance)
      issues.push(`profile "${profile.id}" is a ${profile.header.appearance} profile, shown in ${appearance} mode`);
    issues.push(...profile.issues);
    this.layers.set('ds-profile', profile.css);
    const state: DevStyleState = { appearance, profile, config, preference: this.preference, issues };
    this.last = state;
    this.opts.onApply?.(state);
    return state;
  }
}
