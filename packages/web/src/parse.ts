/**
 * Profile parsing and validation against the token contract. Mirrors scripts/check.mjs,
 * except that it never throws: a bad value is dropped and reported, the rest still apply.
 */
import { TOKENS } from './generated.js';
import type { Appearance, ParsedProfile, ProfileHeader, TokenType } from './types.js';

export const HEADER_RE =
  /^\s*\/\* devstyle: name="([^"]+)" appearance=(light|dark) pair=([a-z0-9-]+) \*\//;
const DECL_RE = /--ds-([a-z0-9-]+)\s*:\s*([^;]+);/g;
const COLOR_RE =
  /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;

const TYPE_CHECKS: Record<TokenType, (v: string) => boolean> = {
  color: (v) => COLOR_RE.test(v),
  px: (v) => /^\d+(\.\d+)?px$/.test(v),
  number: (v) => /^\d+(\.\d+)?$/.test(v),
  font: (v) => /^[\w\s,'"-]+$/.test(v),
  shadow: (v) => v.length > 0 && !/[;{}]/.test(v),
  filter: (v) => v === 'none' || /^([a-z-]+\([^)]*\)\s*)+$/.test(v),
};

const BY_NAME = new Map(TOKENS.map((t) => [t.name, t]));

export function isValidValue(type: TokenType, value: string): boolean {
  return TYPE_CHECKS[type](value.trim());
}

export function parseHeader(text: string): ProfileHeader | null {
  const m = HEADER_RE.exec(text);
  if (!m) return null;
  return { name: m[1] as string, appearance: m[2] as Appearance, pair: m[3] as string };
}

/** Strip block comments so commented-out declarations are not read. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function parseProfile(id: string, css: string): ParsedProfile {
  const issues: string[] = [];
  const header = parseHeader(css);
  if (header === null) issues.push(`${id}: missing or malformed devstyle header line`);
  const values: Record<string, string> = {};
  for (const m of stripComments(css).matchAll(DECL_RE)) {
    const name = m[1] as string;
    const value = (m[2] as string).trim();
    const spec = BY_NAME.get(name);
    if (spec === undefined) {
      issues.push(`${id}: unknown token --ds-${name} (ignored)`);
      continue;
    }
    if (!TYPE_CHECKS[spec.type](value)) {
      issues.push(`${id}: --ds-${name} "${value}" is not a valid ${spec.type} (ignored)`);
      continue;
    }
    values[name] = value;
  }
  for (const t of TOKENS) if (!(t.name in values)) issues.push(`${id}: missing --ds-${t.name}`);
  return { id, header, values, css, issues };
}
