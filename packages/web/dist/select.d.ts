/** Choosing which profile applies: shared config, per-app preference and appearance. */
import type { AppPreference, Appearance, ProfileInfo, SharedConfig } from './types.js';
export declare const DEFAULT_CONFIG: SharedConfig;
export declare const DEFAULT_PREFERENCE: AppPreference;
/** Parse devstyle.json. Missing, invalid or partial files fall back to the defaults. */
export declare function parseConfig(text: string | null): {
    config: SharedConfig;
    issues: string[];
};
export declare function serializeConfig(config: SharedConfig): string;
/** The profile id an app should show for this appearance. */
export declare function resolveProfileId(config: SharedConfig, preference: AppPreference, appearance: Appearance): string;
export interface ProfilePair {
    /** Display name without the trailing " Light"/" Dark". */
    name: string;
    light: ProfileInfo | null;
    dark: ProfileInfo | null;
}
/** Group profiles into light/dark pairs for a picker, sorted by name. */
export declare function pairProfiles(profiles: readonly ProfileInfo[]): ProfilePair[];
