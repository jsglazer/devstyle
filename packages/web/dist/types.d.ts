/** Value types in the token contract (tokens.json). */
export type TokenType = 'color' | 'px' | 'number' | 'font' | 'shadow' | 'filter';
export interface TokenSpec {
    name: string;
    group: string;
    type: TokenType;
}
export type Appearance = 'light' | 'dark';
/** The header line of a profile: `/* devstyle: name="…" appearance=light|dark pair=<id> *\/`. */
export interface ProfileHeader {
    name: string;
    appearance: Appearance;
    pair: string;
}
export interface ProfileInfo extends ProfileHeader {
    /** File id: the file name without `.css`. */
    id: string;
}
export interface ParsedProfile {
    id: string;
    /** null when the header line is missing or malformed. */
    header: ProfileHeader | null;
    /** Valid `--ds-*` values by token name (without the prefix). */
    values: Record<string, string>;
    /** The full CSS text, applied as-is in web views. */
    css: string;
    /** Problems found; the profile is still usable when only some values are bad. */
    issues: string[];
}
/** `devstyle.json` in the shared folder: which profile pair every app follows. */
export interface SharedConfig {
    version: 1;
    light: string;
    dark: string;
}
/**
 * Per-app choice, stored by each app in its own settings.
 * `follow: true` (the default) uses the shared devstyle.json; otherwise the app's own picks.
 */
export interface AppPreference {
    follow: boolean;
    light?: string;
    dark?: string;
}
