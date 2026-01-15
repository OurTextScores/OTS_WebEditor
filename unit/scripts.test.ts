import { describe, expect, it, vi } from 'vitest';

const loadCjs = async (path: string) => {
  const mod: any = await import(path);
  return mod?.default && Object.keys(mod).length === 1 ? mod.default : mod;
};

describe('scripts', () => {
  it('check-wasm reports success when all artifacts exist', async () => {
    const mod: any = await loadCjs('../scripts/check-wasm.js');

    const files = new Map<string, Buffer>([
      ['/repo/public/a.wasm', Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])],
      ['/repo/public/a.data', Buffer.from('not-lfs')],
    ]);

    const fsModule = {
      existsSync: vi.fn(() => true),
      statSync: vi.fn(() => ({ size: 123 })),
      openSync: vi.fn((p: string) => p),
      readSync: vi.fn((fd: string, buf: Buffer, offset: number, length: number) => {
        const data = files.get(fd) ?? Buffer.alloc(0);
        const slice = data.subarray(0, length);
        slice.copy(buf, offset);
        return slice.length;
      }),
      closeSync: vi.fn(),
    };

    const ok = mod.checkWasmArtifacts({
      cwd: '/repo',
      files: ['public/a.wasm', 'public/a.data'],
      fsModule,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(ok).toBe(true);
    expect(fsModule.existsSync).toHaveBeenCalledWith('/repo/public/a.wasm');
  });

  it('check-wasm reports failure when an artifact is empty', async () => {
    const mod: any = await loadCjs('../scripts/check-wasm.js');

    const fsModule = {
      existsSync: vi.fn(() => true),
      statSync: vi.fn((p: string) => ({ size: p.endsWith('empty.wasm') ? 0 : 123 })),
    };

    const ok = mod.checkWasmArtifacts({
      cwd: '/repo',
      files: ['public/ok.wasm', 'public/empty.wasm'],
      fsModule,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(ok).toBe(false);
  });

  it('check-wasm reports failure when an artifact is missing', async () => {
    const mod: any = await loadCjs('../scripts/check-wasm.js');

    const fsModule = {
      existsSync: vi.fn((p: string) => !p.endsWith('missing.wasm')),
      statSync: vi.fn(() => ({ size: 123 })),
    };

    const ok = mod.checkWasmArtifacts({
      cwd: '/repo',
      files: ['public/ok.wasm', 'public/missing.wasm'],
      fsModule,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(ok).toBe(false);
  });

  it('sync-wasm copies artifacts when sources exist', async () => {
    const mod: any = await loadCjs('../scripts/sync-wasm.js');

    const fsModule = {
      existsSync: vi.fn(() => true),
      copyFileSync: vi.fn(),
    };

    const ok = mod.syncWasmArtifacts({
      repoRoot: '/repo',
      srcDir: '/repo/webmscore-fork/web-public',
      destDir: '/repo/public',
      files: ['webmscore.lib.js'],
      fsModule,
      log: vi.fn(),
    });

    expect(ok).toBe(true);
    expect(fsModule.copyFileSync).toHaveBeenCalledWith(
      '/repo/webmscore-fork/web-public/webmscore.lib.js',
      '/repo/public/webmscore.lib.js',
    );
  });

  it('sync-wasm respects OTS_WEB_REPO_ROOT for default paths', async () => {
    const mod: any = await loadCjs('../scripts/sync-wasm.js');

    const originalEnv = process.env.OTS_WEB_REPO_ROOT;
    process.env.OTS_WEB_REPO_ROOT = '/envroot';

    const fsModule = {
      existsSync: vi.fn(() => false),
      copyFileSync: vi.fn(),
    };

    try {
      expect(() => mod.syncWasmArtifacts({ fsModule, log: vi.fn() })).toThrow('Missing source artifact');
      expect(fsModule.existsSync).toHaveBeenNthCalledWith(
        1,
        '/envroot/webmscore-fork/web-public/webmscore.lib.js.mem',
      );
      expect(fsModule.existsSync).toHaveBeenNthCalledWith(
        2,
        '/envroot/webmscore-fork/web-public/webmscore.lib.js',
      );
    } finally {
      if (originalEnv === undefined) delete process.env.OTS_WEB_REPO_ROOT;
      else process.env.OTS_WEB_REPO_ROOT = originalEnv;
    }
  });

  it('sync-wasm falls back to __dirname when OTS_WEB_REPO_ROOT is unset', async () => {
    const mod: any = await loadCjs('../scripts/sync-wasm.js');

    const originalEnv = process.env.OTS_WEB_REPO_ROOT;
    delete process.env.OTS_WEB_REPO_ROOT;

    const fsModule = {
      existsSync: vi.fn(() => false),
      copyFileSync: vi.fn(),
    };

    try {
      expect(() => mod.syncWasmArtifacts({ fsModule, log: vi.fn() })).toThrow('Missing source artifact');
      expect(fsModule.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('webmscore-fork/web-public/webmscore.lib.js.mem'),
      );
      expect(fsModule.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('webmscore-fork/web-public/webmscore.lib.js'),
      );
    } finally {
      if (originalEnv === undefined) delete process.env.OTS_WEB_REPO_ROOT;
      else process.env.OTS_WEB_REPO_ROOT = originalEnv;
    }
  });
});
