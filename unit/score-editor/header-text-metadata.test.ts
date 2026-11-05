import { describe, expect, it, vi } from 'vitest';
import { headerTextForPrompt } from '../../components/score-editor/header-text-metadata';

describe('header prompt metadata', () => {
  it('waits for the current metadata instead of using a stale cached value', async () => {
    let complete!: (value: Record<string, unknown>) => void;
    const metadata = new Promise<Record<string, unknown>>((resolve) => { complete = resolve; });
    let settled = false;
    const result = headerTextForPrompt('subtitle', '', () => metadata, vi.fn()).then((value) => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false);
    complete({ subtitle: 'Bach: Cello Suite' });
    await expect(result).resolves.toBe('Bach: Cello Suite');
  });

  it('uses poet for a missing lyricist and preserves intentionally empty fields', async () => {
    const read = async () => ({ lyricist: undefined, poet: 'Poet', title: '' });
    await expect(headerTextForPrompt('lyricist', 'old', read, vi.fn())).resolves.toBe('Poet');
    await expect(headerTextForPrompt('title', 'old', read, vi.fn())).resolves.toBe('');
  });

  it('uses the cached value if the engine metadata request fails', async () => {
    const error = new Error('unavailable');
    const onError = vi.fn();
    await expect(headerTextForPrompt('composer', 'cached', async () => { throw error; }, onError)).resolves.toBe('cached');
    expect(onError).toHaveBeenCalledWith(error);
  });
});
