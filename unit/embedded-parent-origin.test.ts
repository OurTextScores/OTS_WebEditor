import { afterEach, describe, expect, it } from 'vitest';
import { embeddedParentOrigin } from '@/lib/embedded-parent-origin';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('embedded parent origin', () => {
  it('defaults to the editor origin and accepts an explicit cross-origin host', () => {
    expect(embeddedParentOrigin()).toBe(window.location.origin);
    window.history.replaceState(null, '', '/?parentOrigin=https%3A%2F%2Fhost.example');
    expect(embeddedParentOrigin()).toBe('https://host.example');
  });

  it('rejects wildcard and non-origin targets', () => {
    for (const value of ['*', 'https://host.example/path', 'https://host.example/']) {
      window.history.replaceState(null, '', `/?parentOrigin=${encodeURIComponent(value)}`);
      expect(embeddedParentOrigin()).toBeNull();
    }
  });
});
