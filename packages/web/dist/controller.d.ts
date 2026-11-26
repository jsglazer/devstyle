/**
 * DevStyle controller for one web view: loads the shared choice and the app's preference,
 * applies the right profile for the current light/dark appearance, and re-applies whenever
 * the appearance, the folder or the preference changes.
 */
import { type FolderHost } from './folder.js';
import { StyleLayers, type Layer, type LayerMode } from './layers.js';
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
export declare class DevStyle {
    private readonly opts;
    readonly layers: StyleLayers;
    private preference;
    private readonly media;
    private unwatch;
    private queue;
    private last;
    private readonly onMedia;
    constructor(opts: DevStyleOptions);
    get state(): DevStyleState | null;
    get appearance(): Appearance;
    /** Install built-ins (unless disabled), apply, and start following changes. */
    start(): Promise<DevStyleState>;
    stop(): void;
    /** Re-read the folder and re-apply. Calls are serialized, so rapid changes apply in order. */
    refresh(): Promise<DevStyleState>;
    setPreference(preference: AppPreference): Promise<DevStyleState>;
    /** Change the shared choice. Every app following the shared style picks this up. */
    setShared(config: Omit<SharedConfig, 'version'>): Promise<void>;
    /** Profiles available for a picker (folder plus built-ins). */
    listProfiles(): Promise<ProfileInfo[]>;
    /** Set the app-override or user layer (the profile layer is managed by the controller). */
    setLayer(layer: Exclude<Layer, 'ds-profile'>, css: string): void;
    private apply;
}
