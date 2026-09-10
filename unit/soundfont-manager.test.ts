import { describe, expect, it, vi } from 'vitest';
import { SoundFontManager, type SoundFontTarget } from '@/lib/playback/soundfont-manager';

const makeTarget = (): SoundFontTarget => ({ setSoundFont: vi.fn(async () => {}) });

describe('SoundFontManager', () => {
  it('deduplicates fetch and installation per score', async () => {
    const load = vi.fn(async () => ({ url: '/font.sf3', bytes: new Uint8Array([1, 2, 3]) }));
    const manager = new SoundFontManager(load);
    const target = makeTarget();

    const [left, right] = await Promise.all([manager.ensure(target), manager.ensure(target)]);
    expect([left, right]).toEqual([true, true]);
    expect(load).toHaveBeenCalledOnce();
    expect(target.setSoundFont).toHaveBeenCalledOnce();
    expect(manager.isApplied(target)).toBe(true);
  });

  it('copies cached bytes for every worker-backed score', async () => {
    const source = new Uint8Array([4, 5, 6]);
    const manager = new SoundFontManager(async () => ({ url: '/font.sf3', bytes: source }));
    const first = makeTarget();
    const second = makeTarget();

    await manager.ensure(first);
    await manager.ensure(second);
    const firstBytes = vi.mocked(first.setSoundFont).mock.calls[0][0];
    const secondBytes = vi.mocked(second.setSoundFont).mock.calls[0][0];

    expect(firstBytes).toEqual(source);
    expect(secondBytes).toEqual(source);
    expect(firstBytes).not.toBe(secondBytes);
    expect(firstBytes.buffer).not.toBe(secondBytes.buffer);
  });

  it('suppresses repeated failures until an explicit retry', async () => {
    const target = makeTarget();
    const load = vi.fn(async () => null);
    const manager = new SoundFontManager(load);

    expect(await manager.ensure(target)).toBe(false);
    expect(await manager.ensure(target)).toBe(false);
    expect(await manager.ensure(target, { forceRetry: true })).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidates applied scores when uploaded bytes replace the source', async () => {
    const target = makeTarget();
    const manager = new SoundFontManager(async () => ({
      url: '/default.sf3',
      bytes: new Uint8Array([1]),
    }));
    await manager.ensure(target);

    manager.replace({ url: 'uploaded:custom.sf3', bytes: new Uint8Array([9]) });
    expect(manager.isApplied(target)).toBe(false);
    expect(await manager.ensure(target)).toBe(true);
    expect(target.setSoundFont).toHaveBeenCalledTimes(2);
    expect(vi.mocked(target.setSoundFont).mock.calls[1][0]).toEqual(new Uint8Array([9]));
  });

  it('invalidates target installations without evicting cached source bytes', async () => {
    const load = vi.fn(async () => ({ url: '/default.sf3', bytes: new Uint8Array([3]) }));
    const manager = new SoundFontManager(load);
    const first = makeTarget();
    const second = makeTarget();
    await manager.ensure(first);

    manager.invalidateTargets();
    expect(manager.isApplied(first)).toBe(false);
    expect(await manager.ensure(second)).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(second.setSoundFont).toHaveBeenCalledWith(new Uint8Array([3]));
  });

  it('does not let a stale fetch overwrite replacement bytes', async () => {
    let finish!: (value: { url: string; bytes: Uint8Array }) => void;
    const load = new Promise<{ url: string; bytes: Uint8Array }>((resolve) => {
      finish = resolve;
    });
    const manager = new SoundFontManager(() => load);
    const pending = manager.prefetch();

    manager.replace({ url: 'uploaded:new.sf3', bytes: new Uint8Array([8]) });
    finish({ url: '/old.sf3', bytes: new Uint8Array([1]) });
    expect(await pending).toBeNull();

    const target = makeTarget();
    expect(await manager.ensure(target)).toBe(true);
    expect(vi.mocked(target.setSoundFont).mock.calls[0][0]).toEqual(new Uint8Array([8]));
  });

  it('serializes replacement behind an in-flight install', async () => {
    let finishOldInstall!: () => void;
    let markOldInstallStarted!: () => void;
    const oldInstall = new Promise<void>((resolve) => {
      finishOldInstall = resolve;
    });
    const oldInstallStarted = new Promise<void>((resolve) => {
      markOldInstallStarted = resolve;
    });
    const target = {
      setSoundFont: vi.fn(async (bytes: Uint8Array) => {
        if (bytes[0] === 1) {
          markOldInstallStarted();
          await oldInstall;
        }
      }),
    };
    const manager = new SoundFontManager(async () => ({
      url: '/default.sf3',
      bytes: new Uint8Array([1]),
    }));

    const stale = manager.ensure(target);
    await oldInstallStarted;
    manager.replace({ url: 'uploaded:new.sf3', bytes: new Uint8Array([9]) });
    const replacement = manager.ensure(target, { forceRetry: true });
    expect(target.setSoundFont).toHaveBeenCalledTimes(1);

    finishOldInstall();
    expect(await stale).toBe(false);
    expect(await replacement).toBe(true);
    expect(target.setSoundFont).toHaveBeenCalledTimes(2);
    expect(target.setSoundFont.mock.calls[1][0]).toEqual(new Uint8Array([9]));
  });
});
