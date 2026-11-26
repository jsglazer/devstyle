/** Choosing which profile applies: shared config, per-app preference and appearance. */
import type { AppPreference, Appearance, ProfileInfo, SharedConfig } from './types.js';

export const DEFAULT_CONFIG: SharedConfig = { version: 1, light: 'default-light', dark: 'default-dark' };
export const DEFAULT_PREFERENCE: AppPreference = { follow: true };

const ID_RE = /^[a-z0-9-]+$/;

/** Parse devstyle.json. Missing, invalid or partial files fall back to the defaults. */
export function parseConfig(text: string | null): { config: SharedConfig; issues: string[] } {
  const issues: string[] = [];
  if (text === null) return { config: DEFAULT_CONFIG, issues };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    issues.push(`devstyle.json: not valid JSON (${e instanceof Error ? e.message : String(e)})`);
    return { config: DEFAULT_CONFIG, issues };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push('devstyle.json: expected an object');
    return { config: DEFAULT_CONFIG, issues };
  }
  const r = raw as Record<string, unknown>;
  const pick = (k: Appearance): string => {
    const v = r[k];
    if (typeof v === 'string' && ID_RE.test(v)) return v;
    if (v !== undefined) issues.push(`devstyle.json: "${k}" must be a profile id`);
    return DEFAULT_CONFIG[k];
  };
  return { config: { version: 1, light: pick('light'), dark: pick('dark') }, issues };
}

export function serializeConfig(config: SharedConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** The profile id an app should show for this appearance. */
export function resolveProfileId(
  config: SharedConfig,
  preference: AppPreference,
  appearance: Appearance,
): string {
  if (preference.follow) return config[appearance];
  return preference[appearance] ?? config[appearance];
}

export interface ProfilePair {
  /** Display name without the trailing " Light"/" Dark". */
  name: string;
  light: ProfileInfo | null;
  dark: ProfileInfo | null;
}

/** Group profiles into light/dark pairs for a picker, sorted by name. */
export function pairProfiles(profiles: readonly ProfileInfo[]): ProfilePair[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: ProfilePair[] = [];
  for (const p of [...profiles].sort((a, b) => a.name.localeCompare(b.name))) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const other = byId.get(p.pair);
    const matched = other !== undefined && other.pair === p.id && other.appearance !== p.appearance;
    if (matched) seen.add(other.id);
    const light = p.appearance === 'light' ? p : matched ? other : null;
    const dark = p.appearance === 'dark' ? p : matched ? other : null;
    out.push({ name: p.name.replace(/\s+(Light|Dark)$/, ''), light, dark });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
