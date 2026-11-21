import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, DEFAULT_SETTINGS, Settings, keyName, type KeyValueStore } from '../src/game/Settings';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('Settings', () => {
  it('falls back to defaults for missing or malformed data', () => {
    expect(Settings.parse(null)).toEqual(DEFAULT_SETTINGS);
    expect(Settings.parse('not json')).toEqual(DEFAULT_SETTINGS);
    const s = Settings.parse(JSON.stringify({ mouseSensitivity: 99, invertY: 'yes', fov: 90, bindings: { forward: [1] } }));
    expect(s.mouseSensitivity).toBe(4); // clamped
    expect(s.invertY).toBe(false); // wrong type ignored
    expect(s.fov).toBe(90);
    expect(s.bindings.forward).toEqual(DEFAULT_BINDINGS.forward);
  });

  it('persists changes and reloads them', () => {
    const store = new MemoryStore();
    const a = new Settings(store);
    a.update({ invertY: true, masterVolume: 0.3 });
    const b = new Settings(store);
    expect(b.data.invertY).toBe(true);
    expect(b.data.masterVolume).toBe(0.3);
  });

  it('rebinding a key removes it from other actions', () => {
    const s = new Settings(new MemoryStore());
    s.bind('missile', 'KeyW');
    expect(s.data.bindings.missile).toEqual(['KeyW']);
    expect(s.data.bindings.forward).toEqual([]);
    s.reset();
    expect(s.data.bindings.forward).toEqual(['KeyW']);
    // Defaults are not mutated by rebinding.
    expect(DEFAULT_BINDINGS.missile).toEqual(['KeyX']);
  });

  it('works without storage and notifies listeners', () => {
    const s = new Settings(null);
    let seen = 0;
    s.onChange(() => seen++);
    s.update({ fov: 100 });
    expect(seen).toBe(1);
    expect(s.data.fov).toBe(100);
  });

  it('names keys readably', () => {
    expect(keyName('KeyQ')).toBe('Q');
    expect(keyName('ShiftLeft')).toBe('L-Shift');
    expect(keyName('ArrowUp')).toBe('↑');
  });
});
