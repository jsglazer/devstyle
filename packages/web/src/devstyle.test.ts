import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_PROFILES,
  CONFIG_FILE,
  DevStyle,
  LAYER_ORDER_CSS,
  StyleLayers,
  TOKENS,
  installBuiltins,
  listProfiles,
  loadProfile,
  macSharedFolder,
  memoryHost,
  pairProfiles,
  parseConfig,
  parseProfile,
  profilePath,
  resolveProfileId,
  serializeConfig,
} from './index.js';

const LIGHT = BUILTIN_PROFILES['default-light'] as string;

function fakeMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  } as unknown as MediaQueryList;
  return {
    matchMedia: () => mql,
    set(d: boolean) {
      (mql as { matches: boolean }).matches = d;
      for (const l of listeners) l();
    },
  };
}

const profileText = () =>
  [...document.querySelectorAll('style[data-devstyle-layer="ds-profile"]')].map((s) => s.textContent).join('');

beforeEach(() => {
  document.head.replaceChildren();
});

describe('parseProfile', () => {
  it('accepts every built-in profile with no issues', () => {
    expect(Object.keys(BUILTIN_PROFILES)).toHaveLength(8);
    for (const [id, css] of Object.entries(BUILTIN_PROFILES)) {
      const p = parseProfile(id, css);
      expect(p.issues, id).toEqual([]);
      expect(Object.keys(p.values)).toHaveLength(TOKENS.length);
    }
  });

  it('reads the header', () => {
    expect(parseProfile('default-light', LIGHT).header).toEqual({
      name: 'Default Light',
      appearance: 'light',
      pair: 'default-dark',
    });
  });

  it('drops bad values and unknown tokens but keeps the rest', () => {
    const css = LIGHT.replace('--ds-bg: #fbfbfd;', '--ds-bg: red;').replace(':root {', ':root {\n  --ds-nope: 1px;');
    const p = parseProfile('x', css);
    expect(p.values['bg']).toBeUndefined();
    expect(p.values['fg']).toBe('#1d1d1f');
    expect(p.issues.join('\n')).toMatch(/--ds-bg "red" is not a valid color/);
    expect(p.issues.join('\n')).toMatch(/unknown token --ds-nope/);
    expect(p.issues.join('\n')).toMatch(/missing --ds-bg/);
  });

  it('ignores commented-out declarations and reports a missing header', () => {
    const p = parseProfile('x', ':root { /* --ds-bg: #000000; */ --ds-fg: #ffffff; }');
    expect(p.header).toBeNull();
    expect(p.values).toEqual({ fg: '#ffffff' });
    expect(p.issues[0]).toMatch(/header/);
  });
});

describe('config and selection', () => {
  it('falls back to defaults for missing, broken or partial devstyle.json', () => {
    expect(parseConfig(null).config).toEqual({ version: 1, light: 'default-light', dark: 'default-dark' });
    expect(parseConfig('{').issues[0]).toMatch(/not valid JSON/);
    const partial = parseConfig('{"light":"paper-light","dark":"../x"}');
    expect(partial.config).toEqual({ version: 1, light: 'paper-light', dark: 'default-dark' });
    expect(partial.issues).toHaveLength(1);
    expect(parseConfig(serializeConfig({ version: 1, light: 'a', dark: 'b' })).config.dark).toBe('b');
  });

  it('resolves following vs opting out', () => {
    const cfg = { version: 1 as const, light: 'paper-light', dark: 'paper-dark' };
    expect(resolveProfileId(cfg, { follow: true, light: 'x' }, 'light')).toBe('paper-light');
    expect(resolveProfileId(cfg, { follow: false, light: 'solarized-light' }, 'light')).toBe('solarized-light');
    expect(resolveProfileId(cfg, { follow: false, light: 'solarized-light' }, 'dark')).toBe('paper-dark');
  });

  it('pairs the built-ins into four light/dark pairs', async () => {
    const pairs = pairProfiles(await listProfiles(null));
    expect(pairs.map((p) => p.name)).toEqual(['Default', 'High Contrast', 'Paper', 'Solarized']);
    for (const p of pairs) {
      expect(p.light?.appearance).toBe('light');
      expect(p.dark?.appearance).toBe('dark');
    }
  });

  it('builds the Mac shared folder path', () => {
    expect(macSharedFolder('/Users/me/')).toBe(
      '/Users/me/Library/Group Containers/PWGXN26URQ.com.jsglazer.devstyle/DevStyle',
    );
  });
});

describe('folder', () => {
  it('installs built-ins without overwriting edited files', async () => {
    const host = memoryHost({ [profilePath('default-light')]: 'edited', [CONFIG_FILE]: '{"light":"paper-light"}' });
    const written = await installBuiltins(host);
    expect(written).toHaveLength(7);
    expect(host.files.get(profilePath('default-light'))).toBe('edited');
    expect(host.files.get(CONFIG_FILE)).toBe('{"light":"paper-light"}');
    expect(await installBuiltins(host)).toEqual([]);
  });

  it('lists folder profiles alongside built-ins and skips files without a header', async () => {
    const mine = '/* devstyle: name="Mine Light" appearance=light pair=mine-dark */\n:root{}';
    const host = memoryHost({ 'profiles/mine-light.css': mine, 'profiles/junk.css': ':root{}', 'profiles/notes.txt': 'x' });
    const ids = (await listProfiles(host)).map((p) => p.id);
    expect(ids).toContain('mine-light');
    expect(ids).not.toContain('junk');
    expect(ids).toHaveLength(9);
  });

  it('falls back to the built-in copy when a folder profile lost its header', async () => {
    const host = memoryHost({ [profilePath('paper-light')]: ':root { --ds-bg: #000000; }' });
    const p = await loadProfile(host, 'paper-light');
    expect(p?.header?.name).toBe('Paper Light');
    expect(p?.issues.join('\n')).toMatch(/using the built-in copy/);
    expect(await loadProfile(host, 'does-not-exist')).toBeNull();
    expect(await loadProfile(host, '../etc')).toBeNull();
  });
});

describe('StyleLayers', () => {
  it('declares the layer order first and wraps each layer', () => {
    const layers = new StyleLayers(document, 'style');
    layers.set('user', 'body { color: red; }');
    layers.set('ds-profile', ':root { --ds-bg: #fff; }');
    const styles = [...document.head.querySelectorAll('style')];
    expect(styles[0]?.textContent).toBe(LAYER_ORDER_CSS);
    expect(styles.map((s) => s.dataset['devstyleLayer'])).toEqual(['order', 'user', 'ds-profile']);
    expect(profileText()).toContain('@layer ds-profile {');
    layers.set('ds-profile', ':root { --ds-bg: #000; }');
    expect(document.head.querySelectorAll('style')).toHaveLength(3);
    layers.dispose();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });
});

describe('DevStyle controller', () => {
  it('applies the shared light profile, then follows appearance and folder changes', async () => {
    const host = memoryHost();
    const media = fakeMedia(false);
    const applied: string[] = [];
    const ds = new DevStyle({
      host,
      matchMedia: media.matchMedia,
      layerMode: 'style',
      onApply: (s) => applied.push(s.profile.id),
    });
    const state = await ds.start();
    expect(state.profile.id).toBe('default-light');
    expect(state.issues).toEqual([]);
    expect(host.files.has(CONFIG_FILE)).toBe(true);
    expect(profileText()).toContain('name="Default Light"');

    media.set(true);
    await ds.refresh();
    expect(ds.state?.profile.id).toBe('default-dark');

    await host.write(CONFIG_FILE, serializeConfig({ version: 1, light: 'paper-light', dark: 'paper-dark' }));
    await ds.refresh();
    expect(ds.state?.profile.id).toBe('paper-dark');
    expect(applied).toContain('paper-dark');
    ds.stop();
  });

  it('lets an app opt out, and setShared changes the shared choice', async () => {
    const host = memoryHost();
    const ds = new DevStyle({ host, matchMedia: fakeMedia(false).matchMedia, layerMode: 'style' });
    await ds.start();
    await ds.setPreference({ follow: false, light: 'solarized-light' });
    expect(ds.state?.profile.id).toBe('solarized-light');
    await ds.setShared({ light: 'high-contrast-light', dark: 'high-contrast-dark' });
    expect(parseConfig(host.files.get(CONFIG_FILE) ?? null).config.light).toBe('high-contrast-light');
    expect(ds.state?.profile.id).toBe('solarized-light');
    await ds.setPreference({ follow: true });
    expect(ds.state?.profile.id).toBe('high-contrast-light');
  });

  it('falls back to Default when the chosen profile does not exist, and works without a folder', async () => {
    const host = memoryHost({ [CONFIG_FILE]: '{"light":"gone-light","dark":"gone-dark"}' });
    const ds = new DevStyle({ host, install: false, matchMedia: fakeMedia(false).matchMedia, layerMode: 'style' });
    const s = await ds.start();
    expect(s.profile.id).toBe('default-light');
    expect(s.issues[0]).toMatch(/gone-light/);

    const offline = new DevStyle({ host: null, matchMedia: fakeMedia(true).matchMedia, layerMode: 'style' });
    expect((await offline.start()).profile.id).toBe('default-dark');
    await expect(offline.setShared({ light: 'a', dark: 'b' })).rejects.toThrow(/no shared folder/);
  });
});
