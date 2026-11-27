/**
 * The shared profile folder:
 *
 *   DevStyle/
 *     devstyle.json        { "version": 1, "light": "default-light", "dark": "default-dark" }
 *     profiles/<id>.css
 *
 * On macOS it lives in the App Group container (see MAC_GROUP_ID). The app supplies a
 * FolderHost that reads and writes paths relative to that folder (Tauri commands, a
 * WKScriptMessage bridge, or memoryHost in tests).
 */
import { BUILTIN_PROFILES, PREVIOUS_BUILTIN_HASHES } from './generated.js';
import { parseHeader, parseProfile } from './parse.js';
import { DEFAULT_CONFIG, serializeConfig } from './select.js';
import type { ParsedProfile, ProfileInfo } from './types.js';

export const MAC_GROUP_ID = 'PWGXN26URQ.com.jsglazer.devstyle';
export const FOLDER_NAME = 'DevStyle';
export const CONFIG_FILE = 'devstyle.json';
export const PROFILES_DIR = 'profiles';

/** The shared folder for an unsandboxed Mac app, given the user's home directory. */
export function macSharedFolder(home: string): string {
  return `${home.replace(/\/$/, '')}/Library/Group Containers/${MAC_GROUP_ID}/${FOLDER_NAME}`;
}

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

const ID_RE = /^[a-z0-9-]+$/;
export const profilePath = (id: string): string => `${PROFILES_DIR}/${id}.css`;

/** SHA-256 of a profile's UTF-8 text without trailing newlines, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text.replace(/\n+$/, ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when `text` is exactly an older released version of built-in `id` (never edited). */
export async function isOutdatedBuiltin(id: string, text: string): Promise<boolean> {
  const old = PREVIOUS_BUILTIN_HASHES[id];
  if (old === undefined || old.length === 0 || text === BUILTIN_PROFILES[id]) return false;
  return old.includes(await sha256Hex(text));
}

/**
 * Copy built-in profiles and a default devstyle.json into the folder. Never overwrites an
 * edited file, so edited profiles and the current choice survive. A file that is exactly an
 * older released built-in (never edited) is replaced by the current one, so new tokens reach
 * it. Returns what was written.
 */
export async function installBuiltins(host: FolderHost): Promise<string[]> {
  const written: string[] = [];
  for (const [id, css] of Object.entries(BUILTIN_PROFILES)) {
    const path = profilePath(id);
    const current = await host.read(path);
    if (current === null || (await isOutdatedBuiltin(id, current))) {
      await host.write(path, css);
      written.push(path);
    }
  }
  if ((await host.read(CONFIG_FILE)) === null) {
    await host.write(CONFIG_FILE, serializeConfig(DEFAULT_CONFIG));
    written.push(CONFIG_FILE);
  }
  return written;
}

/** Profiles in the folder plus any built-ins it lacks, sorted by name. Files without a valid header are skipped. */
export async function listProfiles(host: FolderHost | null): Promise<ProfileInfo[]> {
  const out = new Map<string, ProfileInfo>();
  for (const [id, css] of Object.entries(BUILTIN_PROFILES)) {
    const h = parseHeader(css);
    if (h !== null) out.set(id, { id, ...h });
  }
  if (host !== null) {
    for (const file of await host.list(PROFILES_DIR)) {
      if (!file.endsWith('.css')) continue;
      const id = file.slice(0, -4);
      if (!ID_RE.test(id)) continue;
      const text = await host.read(profilePath(id));
      const h = text === null ? null : parseHeader(text);
      if (h !== null) out.set(id, { id, ...h });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load a profile: the folder's copy if present and valid, else the built-in one.
 * Returns null only when the id is neither in the folder nor built in.
 */
export async function loadProfile(host: FolderHost | null, id: string): Promise<ParsedProfile | null> {
  if (!ID_RE.test(id)) return null;
  const text = host === null ? null : await host.read(profilePath(id));
  const builtin = BUILTIN_PROFILES[id];
  if (text !== null) {
    const parsed = parseProfile(id, text);
    if (parsed.header !== null || builtin === undefined) return parsed;
    const fallback = parseProfile(id, builtin);
    fallback.issues.unshift(...parsed.issues, `${id}: using the built-in copy instead`);
    return fallback;
  }
  return builtin === undefined ? null : parseProfile(id, builtin);
}

/** An in-memory FolderHost, for tests and previews. */
export function memoryHost(initial: Record<string, string> = {}): FolderHost & {
  files: Map<string, string>;
  emit(): void;
} {
  const files = new Map(Object.entries(initial));
  const listeners = new Set<() => void>();
  return {
    files,
    read: (p) => Promise.resolve(files.get(p) ?? null),
    write: (p, t) => {
      files.set(p, t);
      for (const l of listeners) l();
      return Promise.resolve();
    },
    list: (dir) =>
      Promise.resolve(
        [...files.keys()]
          .filter((k) => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/'))
          .map((k) => k.slice(dir.length + 1)),
      ),
    watch: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: () => {
      for (const l of listeners) l();
    },
  };
}
