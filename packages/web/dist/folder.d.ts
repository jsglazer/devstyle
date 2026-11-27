import type { ParsedProfile, ProfileInfo } from './types.js';
export declare const MAC_GROUP_ID = "PWGXN26URQ.com.jsglazer.devstyle";
export declare const FOLDER_NAME = "DevStyle";
export declare const CONFIG_FILE = "devstyle.json";
export declare const PROFILES_DIR = "profiles";
/** The shared folder for an unsandboxed Mac app, given the user's home directory. */
export declare function macSharedFolder(home: string): string;
export interface FolderHost {
    /** Text of a file relative to the folder, or null if it does not exist. */
    read(path: string): Promise<string | null>;
    /** Write a file relative to the folder, creating directories as needed. */
    write(path: string, text: string): Promise<void>;
    /** File names directly inside a directory relative to the folder; [] if it does not exist. */
    list(dir: string): Promise<string[]>;
    /** Call onChange whenever something in the folder changes; returns an unsubscribe function. */
    watch?(onChange: () => void): () => void;
}
export declare const profilePath: (id: string) => string;
/** SHA-256 of a profile's UTF-8 text without trailing newlines, as lowercase hex. */
export declare function sha256Hex(text: string): Promise<string>;
/** True when `text` is exactly an older released version of built-in `id` (never edited). */
export declare function isOutdatedBuiltin(id: string, text: string): Promise<boolean>;
/**
 * Copy built-in profiles and a default devstyle.json into the folder. Never overwrites an
 * edited file, so edited profiles and the current choice survive. A file that is exactly an
 * older released built-in (never edited) is replaced by the current one, so new tokens reach
 * it. Returns what was written.
 */
export declare function installBuiltins(host: FolderHost): Promise<string[]>;
/** Profiles in the folder plus any built-ins it lacks, sorted by name. Files without a valid header are skipped. */
export declare function listProfiles(host: FolderHost | null): Promise<ProfileInfo[]>;
/**
 * Load a profile: the folder's copy if present and valid, else the built-in one.
 * Returns null only when the id is neither in the folder nor built in.
 */
export declare function loadProfile(host: FolderHost | null, id: string): Promise<ParsedProfile | null>;
/** An in-memory FolderHost, for tests and previews. */
export declare function memoryHost(initial?: Record<string, string>): FolderHost & {
    files: Map<string, string>;
    emit(): void;
};
