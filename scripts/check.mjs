#!/usr/bin/env node
// Checks every profile in profiles/ against tokens.json, then writes the generated files: preview/manifest.js and the built-in tables for the web and Swift packages.
//
//   node scripts/check.mjs          check, then rewrite the generated files
//   node scripts/check.mjs --check  check only, and fail if a generated file is stale (CI)
//   node scripts/check.mjs --record 1.0.3   also add the current profiles' hashes to
//                                           profiles-history.json under that version (on release)
//
// A profile fails when it is missing its header, misses or adds a token, gives a value of
// the wrong type, names a pair that does not point back, or has text that is too hard to read.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');

const HEADER_RE = /^\/\* devstyle: name="([^"]+)" appearance=(light|dark) pair=([a-z0-9-]+) \*\//;
const DECL_RE = /--ds-([a-z0-9-]+)\s*:\s*([^;]+);/g;
const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const TYPE_CHECKS = {
  color: (v) => COLOR_RE.test(v),
  px: (v) => /^\d+(\.\d+)?px$/.test(v),
  number: (v) => /^\d+(\.\d+)?$/.test(v),
  font: (v) => /^[\w\s,'"-]+$/.test(v),
  shadow: (v) => v.length > 0 && !/[;{}]/.test(v),
  filter: (v) => v === 'none' || /^([a-z-]+\([^)]*\)\s*)+$/.test(v),
};

// WCAG 2 contrast; pairs below `min` fail the check.
const CONTRAST = [
  ['fg', 'bg', 4.5],
  ['fg', 'panel', 4.5],
  ['editor-fg', 'editor-bg', 4.5],
  ['muted', 'bg', 3],
  ['gutter-fg', 'gutter-bg', 3],
  ['fg-on-accent', 'accent', 4.5],
  ['link', 'bg', 4.5],
  ['error', 'bg', 3],
  ['syn-comment', 'editor-bg', 3],
  ['syn-keyword', 'editor-bg', 4.5],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`syn-heading-${n}`, 'editor-bg', 3]),
];

function rgb(v) {
  const hex = /^#([0-9a-f]+)$/i.exec(v)?.[1];
  if (hex) {
    const f = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  }
  return v.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
}
function luminance(v) {
  const [r, g, b] = rgb(v).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const known = new Map(spec.tokens.map((t) => [t.name, t]));
const files = readdirSync(join(root, 'profiles')).filter((f) => f.endsWith('.css')).sort();
const profiles = [];
const errors = [];

for (const file of files) {
  const id = file.replace(/\.css$/, '');
  const text = readFileSync(join(root, 'profiles', file), 'utf8');
  const err = (m) => errors.push(`${file}: ${m}`);
  const header = HEADER_RE.exec(text);
  if (!header) {
    err('first line must be /* devstyle: name="…" appearance=light|dark pair=<id> */');
    continue;
  }
  const values = {};
  for (const m of text.matchAll(DECL_RE)) {
    const [, name, raw] = m;
    const value = raw.trim();
    const tok = known.get(name);
    if (!tok) err(`unknown token --ds-${name}`);
    else if (!TYPE_CHECKS[tok.type](value)) err(`--ds-${name}: "${value}" is not a valid ${tok.type}`);
    if (name in values) err(`--ds-${name} is set twice`);
    values[name] = value;
  }
  for (const name of known.keys()) if (!(name in values)) err(`missing --ds-${name}`);
  if (!new RegExp(`color-scheme:\\s*${header[2]};`).test(text)) err(`needs color-scheme: ${header[2]};`);
  for (const [fg, bg, min] of CONTRAST) {
    if (!COLOR_RE.test(values[fg] ?? '') || !COLOR_RE.test(values[bg] ?? '')) continue;
    const c = contrast(values[fg], values[bg]);
    if (c < min) err(`contrast ${fg} on ${bg} is ${c.toFixed(2)}:1 (needs ${min}:1)`);
  }
  profiles.push({ id, file: `profiles/${file}`, name: header[1], appearance: header[2], pair: header[3] });
}

for (const p of profiles) {
  const other = profiles.find((q) => q.id === p.pair);
  if (!other) errors.push(`${p.id}.css: pair "${p.pair}" does not exist`);
  else if (other.pair !== p.id) errors.push(`${p.id}.css: pair "${p.pair}" does not point back`);
  else if (other.appearance === p.appearance) errors.push(`${p.id}.css: pair has the same appearance`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s) in ${files.length} profile(s).`);
  process.exit(1);
}
console.log(`OK: ${profiles.length} profiles, ${known.size} tokens each.`);

// ---- generated files: the preview manifest and the built-in tables for both packages ----
const texts = Object.fromEntries(
  profiles.map((p) => [p.id, readFileSync(join(root, p.file), 'utf8')]),
);
// hashed without trailing newlines, so a copy saved with or without the final newline matches
const sha256 = (text) => createHash('sha256').update(text.replace(/\n+$/, ''), 'utf8').digest('hex');
const historyPath = join(root, 'profiles-history.json');
const history = JSON.parse(readFileSync(historyPath, 'utf8'));
const recordAt = process.argv.indexOf('--record');
if (recordAt !== -1) {
  const version = process.argv[recordAt + 1];
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    console.error('--record needs a version, e.g. --record 1.0.3');
    process.exit(1);
  }
  history.versions[version] = Object.fromEntries(
    profiles.map((p) => [p.id, sha256(texts[p.id])]).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`Recorded ${profiles.length} profile hashes for ${version} in profiles-history.json`);
}
// hashes of released built-ins that differ from the current text: unedited old copies to upgrade
const previous = {};
for (const p of profiles) {
  const now = sha256(texts[p.id]);
  const old = new Set(Object.values(history.versions).map((v) => v[p.id]).filter((h) => h && h !== now));
  previous[p.id] = [...old].sort();
}
const manifest = { version: spec.version, tokens: spec.tokens, profiles };
const swiftType = { color: 'color', px: 'px', number: 'number', font: 'font', shadow: 'shadow', filter: 'filter' };
const generated = {
  'preview/manifest.js': `// Generated by scripts/check.mjs. Do not edit.\nwindow.DEVSTYLE = ${JSON.stringify(manifest, null, 2)};\n`,
  'packages/web/src/generated.ts': [
    '// Generated by scripts/check.mjs from tokens.json and profiles/. Do not edit.',
    "import type { TokenSpec } from './types.js';",
    '',
    `export const CONTRACT_VERSION = ${JSON.stringify(spec.version)};`,
    '',
    `export const TOKENS: readonly TokenSpec[] = ${JSON.stringify(spec.tokens.map(({ name, group, type }) => ({ name, group, type })), null, 2)};`,
    '',
    '/** Built-in profiles, keyed by id, as CSS text. */',
    `export const BUILTIN_PROFILES: Readonly<Record<string, string>> = ${JSON.stringify(texts, null, 2)};`,
    '',
    '/** SHA-256 (hex, of the UTF-8 text without trailing newlines) of older released versions of each built-in, for upgrading unedited copies. */',
    `export const PREVIOUS_BUILTIN_HASHES: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(previous, null, 2)};`,
    '',
  ].join('\n'),
  'swift/Sources/DevStyleKit/Generated.swift': [
    '// Generated by scripts/check.mjs from tokens.json and profiles/. Do not edit.',
    '',
    'public enum DSGenerated {',
    `    public static let contractVersion = ${JSON.stringify(spec.version)}`,
    '',
    '    public static let tokens: [DSTokenSpec] = [',
    ...spec.tokens.map((t) => `        DSTokenSpec(name: ${JSON.stringify(t.name)}, group: ${JSON.stringify(t.group)}, type: .${swiftType[t.type]}),`),
    '    ]',
    '',
    '    /// Built-in profiles, keyed by id, as CSS text.',
    '    public static let builtinProfiles: [String: String] = [',
    // the blank line before the closing delimiter keeps the file's final newline in the string
    ...profiles.map((p) => `        ${JSON.stringify(p.id)}: #"""\n${texts[p.id].replace(/\n*$/, '\n')}\n"""#,`),
    '    ]',
    '',
    '    /// SHA-256 (hex, of the UTF-8 text without trailing newlines) of older released versions of each built-in, for upgrading unedited copies.',
    '    public static let previousBuiltinHashes: [String: [String]] = [',
    ...profiles.map((p) => `        ${JSON.stringify(p.id)}: [${previous[p.id].map((h) => JSON.stringify(h)).join(', ')}],`),
    '    ]',
    '}',
    '',
  ].join('\n'),
};

let stale = 0;
for (const [rel, text] of Object.entries(generated)) {
  const path = join(root, rel);
  let current = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    current = null;
  }
  if (current === text) continue;
  if (checkOnly) {
    console.error(`${rel} is out of date: run node scripts/check.mjs`);
    stale++;
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    console.log(`Wrote ${rel}`);
  }
}
if (stale > 0) process.exit(1);
