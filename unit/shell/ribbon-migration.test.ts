import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RIBBON_MIGRATION,
  resolveLegacyTestId,
  type MigrationEntry,
} from '../../components/shell/ribbonMigration';
import { isCommandFamily, type AnyCommand, type CommandFamily } from '../../lib/commands/types';
import { allEditorCommands } from '../helpers/all-commands';

/** The last rollout phase (§10) that has shipped; entries up to it must be live. */
const SHIPPED_PHASE = 3;

/**
 * P7: nothing disappears silently. Every `data-testid` the legacy ribbon renders has a
 * manifest entry naming its new home, and every command a manifest entry names exists.
 *
 * While the ribbon exists the ids are read from its source, so adding a control without an
 * entry fails here. After Phase 5 deletes the sections this reads `LEGACY_RIBBON_TEST_IDS`
 * instead -- a frozen copy of what the scan finds today.
 */

const REPO = resolve(__dirname, '../..');
const SECTIONS_DIR = resolve(REPO, 'components/toolbar/sections');

/**
 * Chrome test ids outside the ribbon that SHELL_REDESIGN_DESIGN §2.3, §8.3 and §9 move,
 * keep, or remove. `source` is where each lives today, so a stale entry fails too.
 */
const CHROME_TEST_IDS: readonly { id: string; prefix?: boolean; source: string }[] = [
  { id: 'page-select', source: 'components/shell/StatusBar.tsx' },
  { id: 'page-indicator', source: 'components/shell/StatusBar.tsx' },
  { id: 'interaction-preparing-banner', source: 'components/shell/StatusBar.tsx' },
  { id: 'collapsed-panel-strip', source: 'components/ScoreEditor.tsx' },
  { id: 'expand-panel-', prefix: true, source: 'components/ScoreEditor.tsx' },
  { id: 'btn-xml-toggle', source: 'components/ScoreEditor.tsx' },
  { id: 'sidebar-resize-handle', source: 'components/ScoreEditor.tsx' },
  { id: 'xml-sidebar', source: 'components/ScoreEditor.tsx' },
  { id: 'checkpoint-sidebar', source: 'components/score-editor/LeftSidebar.tsx' },
  { id: 'input-checkpoint-label', source: 'components/score-editor/LeftSidebar.tsx' },
  { id: 'checkpoint-compare-modal', source: 'components/ScoreEditor.tsx' },
  { id: 'generated-share-link', source: 'components/score-editor/ShareLinkDialog.tsx' },
  ...[
    'tab-ai',
    'tab-notagen',
    'tab-transcoda',
    'tab-multitrack-vae',
    'tab-harmony',
    'tab-functional-harmony',
    'tab-mma',
  ].map((id) => ({ id, source: 'components/score-editor/ai-tools/AiToolsTabStrip.tsx' })),
  ...['tab-versions', 'tab-checkpoints', 'tab-scores'].map((id) => ({
    id,
    source: 'components/score-editor/LeftSidebar.tsx',
  })),
];

interface LegacyIds {
  exact: Set<string>;
  prefixes: Set<string>;
}

function scanRibbonSource(): LegacyIds {
  const exact = new Set<string>();
  const prefixes = new Set<string>();
  const files = [
    ...readdirSync(SECTIONS_DIR)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => resolve(SECTIONS_DIR, name)),
    resolve(REPO, 'components/toolbar/constants.ts'),
    resolve(REPO, 'components/toolbar/PaletteLink.tsx'),
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // data-testid="literal" and testId="literal" / testId: 'literal'
    for (const match of source.matchAll(/(?:data-testid|testId)(?:=|:\s*)["']([^"']+)["']/g)) {
      exact.add(match[1]);
    }
    // data-testid={`prefix-${...}`}: the literal part before the first interpolation.
    for (const match of source.matchAll(/data-testid=\{`([^`$]*)\$\{/g)) {
      prefixes.add(match[1]);
    }
  }
  return { exact, prefixes };
}

const covered = (id: string, prefix: boolean): boolean =>
  RIBBON_MIGRATION.some((entry) =>
    prefix
      ? entry.prefix && entry.legacyTestId === id
      : entry.legacyTestId === id || (entry.prefix && id.startsWith(entry.legacyTestId)),
  );

function editorCommandEntries(): AnyCommand[] {
  return allEditorCommands();
}

describe('ribbon migration manifest', () => {
  const legacy = scanRibbonSource();

  it('finds the ribbon test ids it is meant to audit', () => {
    // A scan that silently matched nothing would make every assertion below vacuous.
    expect(legacy.exact.size).toBeGreaterThan(100);
    expect(legacy.prefixes.size).toBeGreaterThan(20);
    expect(legacy.exact).toContain('btn-export-pdf');
    expect(legacy.exact).toContain('btn-new-score');
    expect(legacy.prefixes).toContain('btn-clef-');
  });

  it('has an entry for every exact ribbon test id', () => {
    const missing = [...legacy.exact].filter((id) => !covered(id, false));
    expect(missing, 'Add these to RIBBON_MIGRATION with their new home.').toEqual([]);
  });

  it('has a prefix entry for every templated ribbon test id', () => {
    const missing = [...legacy.prefixes].filter((id) => !covered(id, true));
    expect(missing, 'Add these as prefix entries to RIBBON_MIGRATION.').toEqual([]);
  });

  it('has an entry for every chrome test id the design moves', () => {
    const missing = CHROME_TEST_IDS.filter((chrome) => !covered(chrome.id, Boolean(chrome.prefix)));
    expect(missing.map((chrome) => chrome.id)).toEqual([]);
  });

  it('lists chrome test ids that still exist in the source', () => {
    const stale = CHROME_TEST_IDS.filter((chrome) => {
      const source = readFileSync(resolve(REPO, chrome.source), 'utf8');
      return !source.includes(chrome.id);
    });
    expect(stale.map((chrome) => chrome.id)).toEqual([]);
  });

  it('has no entry that matches nothing', () => {
    const known = new Set([
      ...legacy.exact,
      ...CHROME_TEST_IDS.filter((chrome) => !chrome.prefix).map((chrome) => chrome.id),
    ]);
    const prefixes = [
      ...legacy.prefixes,
      ...CHROME_TEST_IDS.filter((chrome) => chrome.prefix).map((chrome) => chrome.id),
    ];
    const dead = RIBBON_MIGRATION.filter((entry) =>
      entry.prefix
        ? !prefixes.includes(entry.legacyTestId) &&
          ![...known].some((id) => id.startsWith(entry.legacyTestId))
        : !known.has(entry.legacyTestId) &&
          // An exact entry for one instance of a templated id (btn-timesig-4-4).
          !prefixes.some((prefix) => entry.legacyTestId.startsWith(prefix)),
    );
    expect(dead.map((entry) => entry.legacyTestId)).toEqual([]);
  });

  it('lists each legacy test id once', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of RIBBON_MIGRATION) {
      const key = `${entry.prefix ? 'prefix:' : 'exact:'}${entry.legacyTestId}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  describe('commands', () => {
    const registered = new Map(editorCommandEntries().map((entry) => [entry.id, entry]));

    it('registers every command id the manifest names for a shipped phase', () => {
      const missing = RIBBON_MIGRATION.filter(
        (entry) =>
          (entry.phase ?? 0) <= SHIPPED_PHASE &&
          entry.kind !== 'container' &&
          entry.kind !== 'decoration',
      )
        .filter((entry) => entry.kind !== 'chrome' || entry.commandId)
        .filter((entry) => !entry.commandId || !registered.has(entry.commandId))
        .map((entry) => `${entry.legacyTestId} -> ${entry.commandId ?? '(no commandId)'}`);
      expect(missing).toEqual([]);
    });

    it('gives every command-bearing entry a command id', () => {
      const bad = RIBBON_MIGRATION.filter(
        (entry) =>
          ((entry.kind ?? 'command') === 'command' || entry.kind === 'input') && !entry.commandId,
      );
      expect(bad.map((entry) => entry.legacyTestId)).toEqual([]);
    });

    it('does not name a command for containers or decorations', () => {
      const bad = RIBBON_MIGRATION.filter(
        (entry: MigrationEntry) =>
          (entry.kind === 'container' || entry.kind === 'decoration') && entry.commandId,
      );
      expect(bad.map((entry) => entry.legacyTestId)).toEqual([]);
    });

    it('resolves every command test id back to its own command', () => {
      const wrong: string[] = [];
      for (const entry of registered.values()) {
        if (isCommandFamily(entry) || !('testId' in entry) || !entry.testId) continue;
        const resolved = resolveLegacyTestId(entry.testId);
        if (resolved?.commandId !== entry.id) {
          wrong.push(
            `${entry.testId} -> ${resolved?.commandId ?? 'unresolved'} (want ${entry.id})`,
          );
        }
      }
      expect(wrong).toEqual([]);
    });

    it('resolves every family variant test id to that family and argument', () => {
      const wrong: string[] = [];
      for (const entry of registered.values()) {
        if (!isCommandFamily(entry)) continue;
        for (const variant of (entry as unknown as CommandFamily<unknown>).variants) {
          if (!variant.testId) continue;
          const resolved = resolveLegacyTestId(variant.testId);
          const same =
            resolved?.commandId === entry.id &&
            JSON.stringify(resolved.arg) === JSON.stringify(variant.arg);
          if (!same) {
            wrong.push(
              `${variant.testId} -> ${resolved?.commandId}(${JSON.stringify(resolved?.arg)}) ` +
                `want ${entry.id}(${JSON.stringify(variant.arg)})`,
            );
          }
        }
      }
      expect(wrong).toEqual([]);
    });
  });

  describe('resolveLegacyTestId', () => {
    it('prefers an exact entry over a prefix', () => {
      expect(resolveLegacyTestId('btn-timesig-custom')?.commandId).toBe('add.timeSig.custom');
      expect(resolveLegacyTestId('btn-timesig-4-4')?.arg).toEqual({
        numerator: 4,
        denominator: 4,
        timeSigType: 1,
      });
    });

    it('derives the argument from the suffix', () => {
      expect(resolveLegacyTestId('btn-clef-20')).toMatchObject({ commandId: 'add.clef', arg: 20 });
      expect(resolveLegacyTestId('btn-keysig--3')).toMatchObject({
        commandId: 'add.keySig',
        arg: -3,
      });
      // Voices are one-based in the test id and zero-based in the engine.
      expect(resolveLegacyTestId('btn-voice-1')).toMatchObject({
        commandId: 'tools.voice',
        arg: 0,
      });
      expect(resolveLegacyTestId('zoom-preset-75')).toMatchObject({
        commandId: 'view.zoom.preset',
        arg: 0.75,
      });
    });

    it('returns undefined for an id the ribbon never rendered', () => {
      expect(resolveLegacyTestId('not-a-real-test-id')).toBeUndefined();
    });
  });
});
