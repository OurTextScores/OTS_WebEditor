import { describe, expect, it, vi } from 'vitest';
import type { CheckpointRecord } from '../../lib/checkpoints';
import type { Score } from '../../lib/webmscore-loader';
import {
  checkpointRestoreFile,
  nativeCheckpointFields,
} from '../../components/score-editor/checkpoint-native';

const record = (native?: ArrayBuffer): CheckpointRecord => ({
  title: 'Before',
  createdAt: 0,
  format: 'musicxml',
  data: new TextEncoder().encode('<score-partwise/>').buffer,
  size: 17,
  ...(native ? { native } : {}),
});

describe('checkpoints kept natively (roadmap E23)', () => {
  it("stores the score's MSCZ, through the serialized engine queue", async () => {
    const saveMsc = vi.fn(async () => new Uint8Array([0x50, 0x4b, 3, 4]));
    const run = vi.fn((operation: () => Promise<unknown>) => operation());
    const fields = await nativeCheckpointFields({ saveMsc } as unknown as Score, run as never);
    expect(saveMsc).toHaveBeenCalledWith('mscz');
    expect(run).toHaveBeenCalledWith(expect.any(Function), 'saveMsc(checkpoint)');
    expect(new Uint8Array(fields.native!)).toEqual(new Uint8Array([0x50, 0x4b, 3, 4]));
  });

  it('keeps MusicXML only when the score cannot be saved natively', async () => {
    await expect(nativeCheckpointFields(null)).resolves.toEqual({});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = {
      saveMsc: vi.fn(async () => {
        throw new Error('no');
      }),
    } as unknown as Score;
    await expect(nativeCheckpointFields(failing)).resolves.toEqual({});
    warn.mockRestore();
  });

  it('restores from the MSCZ when there is one, else from MusicXML (older checkpoints)', async () => {
    const native = checkpointRestoreFile(record(new Uint8Array([0x50, 0x4b]).buffer), 'Before');
    expect(native.name).toBe('Before.mscz');
    expect(new Uint8Array(await native.arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b]));
    const xml = checkpointRestoreFile(record(), 'Before');
    expect(xml.name).toBe('Before.musicxml');
    expect(await xml.text()).toBe('<score-partwise/>');
  });
});
