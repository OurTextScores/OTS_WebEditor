import { describe, expect, it, vi } from 'vitest';
import {
  WRITE_TO_DISK_BYTES,
  getSaveFilePicker,
  isPickerDismissed,
  shouldWriteToDisk,
} from '../../lib/video-export/saveTarget';

describe('saveTarget', () => {
  it('finds the browser picker, bound to its owner, or reports none', () => {
    const owner = {
      showSaveFilePicker: vi.fn(function (this: unknown) {
        return Promise.resolve(this);
      }),
    };
    const picker = getSaveFilePicker(owner)!;
    expect(picker).toBeTypeOf('function');
    expect(getSaveFilePicker({})).toBeNull();
  });

  it('writes to disk only when the export is big and a picker exists', () => {
    const picker = vi.fn();
    expect(shouldWriteToDisk(WRITE_TO_DISK_BYTES + 1, picker as never)).toBe(true);
    expect(shouldWriteToDisk(WRITE_TO_DISK_BYTES, picker as never)).toBe(false);
    expect(shouldWriteToDisk(WRITE_TO_DISK_BYTES * 10, null)).toBe(false);
  });

  it('treats a dismissed picker as not an error', () => {
    expect(isPickerDismissed(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isPickerDismissed(new DOMException('x', 'NotAllowedError'))).toBe(false);
    expect(isPickerDismissed(new Error('AbortError'))).toBe(false);
  });
});
