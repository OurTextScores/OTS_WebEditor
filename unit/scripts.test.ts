import { describe, expect, it, vi } from 'vitest';

type CheckWasmModule = {
  checkWasmArtifacts: (options: Record<string, unknown>) => boolean;
};

type SyncWasmModule = {
  syncWasmArtifacts: (options: Record<string, unknown>) => boolean;
};

const loadCjs = async <Module>(path: string): Promise<Module> => {
  const imported: unknown = await import(path);
  const moduleRecord = imported as Record<string, unknown>;
  const resolved =
    moduleRecord.default && Object.keys(moduleRecord).length === 1
      ? moduleRecord.default
      : moduleRecord;
  return resolved as Module;
};

describe('scripts', () => {
  it('check-wasm reports success when all artifacts exist', async () => {
    const mod = await loadCjs<CheckWasmModule>('../scripts/check-wasm.js');

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
    const mod = await loadCjs<CheckWasmModule>('../scripts/check-wasm.js');

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
    const mod = await loadCjs<CheckWasmModule>('../scripts/check-wasm.js');

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
    const mod = await loadCjs<SyncWasmModule>('../scripts/sync-wasm.js');

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
    const mod = await loadCjs<SyncWasmModule>('../scripts/sync-wasm.js');

    const originalEnv = process.env.OTS_WEB_REPO_ROOT;
    process.env.OTS_WEB_REPO_ROOT = '/envroot';

    const fsModule = {
      existsSync: vi.fn(() => false),
      copyFileSync: vi.fn(),
    };

    try {
      expect(() => mod.syncWasmArtifacts({ fsModule, log: vi.fn() })).toThrow(
        'Missing source artifact',
      );
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
    const mod = await loadCjs<SyncWasmModule>('../scripts/sync-wasm.js');

    const originalEnv = process.env.OTS_WEB_REPO_ROOT;
    delete process.env.OTS_WEB_REPO_ROOT;

    const fsModule = {
      existsSync: vi.fn(() => false),
      copyFileSync: vi.fn(),
    };

    try {
      expect(() => mod.syncWasmArtifacts({ fsModule, log: vi.fn() })).toThrow(
        'Missing source artifact',
      );
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

  describe('memory initializer (webmscore.lib.mem.wasm)', () => {
    const loader = (declares: boolean) =>
      declares ? 'var memoryInitializer="webmscore.lib.js.mem";' : 'var Module=moduleArg;';
    const checkFs = (declares: boolean, present: (p: string) => boolean) => ({
      existsSync: vi.fn(present),
      statSync: vi.fn(() => ({ size: 123 })),
      openSync: vi.fn(() => 'fd'),
      readSync: vi.fn(() => 0),
      closeSync: vi.fn(),
      readFileSync: vi.fn(() => loader(declares)),
    });
    const withoutMem = (p: string) => !p.endsWith('mem.wasm');

    it('check-wasm requires it only when the loader declares one (the emsdk 2 / 4.00 build)', async () => {
      const mod = await loadCjs<CheckWasmModule>('../scripts/check-wasm.js');
      const run = (declares: boolean) =>
        mod.checkWasmArtifacts({
          cwd: '/repo',
          files: [],
          optional: [],
          fsModule: checkFs(declares, withoutMem),
          log: vi.fn(),
          error: vi.fn(),
        });
      expect(run(true)).toBe(false);
      expect(run(false)).toBe(true);
    });

    it('check-wasm still requires it when the loader cannot be read', async () => {
      const mod = await loadCjs<CheckWasmModule>('../scripts/check-wasm.js');
      const fsModule = {
        ...checkFs(false, withoutMem),
        readFileSync: vi.fn(() => {
          throw new Error('ENOENT');
        }),
      };
      const ok = mod.checkWasmArtifacts({
        cwd: '/repo',
        files: [],
        optional: [],
        fsModule,
        log: vi.fn(),
        error: vi.fn(),
      });
      expect(ok).toBe(false);
    });

    it('sync-wasm copies it when present and tolerates its absence for an emsdk 4 loader', async () => {
      const mod = await loadCjs<SyncWasmModule>('../scripts/sync-wasm.js');
      const sync = (declares: boolean) => {
        const fsModule = {
          existsSync: vi.fn(withoutMem),
          copyFileSync: vi.fn(),
          readFileSync: vi.fn(() => loader(declares)),
        };
        return () =>
          mod.syncWasmArtifacts({
            srcDir: '/src',
            destDir: '/dest',
            files: [],
            optional: [],
            fsModule,
            log: vi.fn(),
          });
      };
      expect(sync(true)).toThrow('webmscore.lib.mem.wasm');
      expect(sync(false)()).toBe(true);
    });
  });
});
