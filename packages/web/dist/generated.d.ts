import type { TokenSpec } from './types.js';
export declare const CONTRACT_VERSION = "1.1.0";
export declare const TOKENS: readonly TokenSpec[];
/** Built-in profiles, keyed by id, as CSS text. */
export declare const BUILTIN_PROFILES: Readonly<Record<string, string>>;
/** SHA-256 (hex, of the UTF-8 text without trailing newlines) of older released versions of each built-in, for upgrading unedited copies. */
export declare const PREVIOUS_BUILTIN_HASHES: Readonly<Record<string, readonly string[]>>;
