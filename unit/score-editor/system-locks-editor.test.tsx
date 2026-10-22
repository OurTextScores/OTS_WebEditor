import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { runEditorCommand, setupScoreEditorTest, testGlobals } from './test-harness';
import type { SystemLockState } from '../../lib/webmscore-loader';
const mocked = vi.hoisted(() => ({ loadWebMscore: vi.fn(), loadWebMscoreInProcess: vi.fn() }));
const navigation = vi.hoisted(() => ({ useSearchParams: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: navigation.useSearchParams }));
vi.mock('../../lib/webmscore-loader', () => mocked);
import ScoreEditor from '../../components/ScoreEditor';

describe('ScoreEditor system-lock wiring', () => {
  setupScoreEditorTest(mocked, navigation);
  it.each([false, true])(
    'shows working controls only with the complete API (supported=%s)',
    async (supported) => {
      let locked = false;
      const score = {
        destroy: vi.fn(),
        saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
        savePdf: vi.fn(async () => new Uint8Array([1])),
        metadata: vi.fn(async () => ({})),
        measurePositions: vi.fn(async () => ({})),
        segmentPositions: vi.fn(async () => ({})),
        selectElementAtPoint: vi.fn(async () => true),
        pitchUp: vi.fn(async () => true),
        relayout: vi.fn(async () => true),
        undo: vi.fn(async () => {
          locked = false;
          return true;
        }),
        redo: vi.fn(async () => {
          locked = true;
          return true;
        }),
        getSelectedElementProperties: vi.fn(async () => ({
          selectionCount: 1,
          elementType: 'Note',
          properties: {},
        })),
        getSystemLockState: supported
          ? vi.fn(async (): Promise<SystemLockState> => ({
              selection: { startMeasure: 0, endMeasure: 2 },
              locks: locked ? [{ startMeasure: 0, endMeasure: 2 }] : [],
              locked: { value: locked, mixed: false, applicableCount: 1 },
              canLock: !locked,
              canUnlock: locked,
              canMovePrevious: false,
              canMoveNext: true,
            }))
          : undefined,
        setSystemLock: supported
          ? vi.fn(async (value: boolean) => {
              locked = value;
              return true;
            })
          : undefined,
        moveSelectedMeasureToSystem: supported ? vi.fn(async () => true) : undefined,
      };
      mocked.loadWebMscore.mockResolvedValue({
        ready: Promise.resolve(),
        load: vi.fn(async () => score),
      });
      testGlobals.fetch = vi.fn(async () => ({
        ok: false,
        arrayBuffer: async () => new ArrayBuffer(0),
      }));
      render(<ScoreEditor />);
      await userEvent.upload(
        screen.getByTestId('open-score-input'),
        new File([new Uint8Array([1])], 'test.mscz'),
      );
      await waitFor(() =>
        expect(screen.getByTestId('svg-container').querySelector('.Note')).not.toBeNull(),
      );
      fireEvent.click(screen.getByTestId('svg-container').querySelector('.Note')!);
      await screen.findByTestId('selection-overlay');
      fireEvent.click(screen.getByRole('tab', { name: 'Properties' }));
      if (!supported) {
        expect(screen.queryByRole('region', { name: 'System layout' })).toBeNull();
        return;
      }
      const checkbox = await screen.findByRole('checkbox', {
        name: 'Keep selected measures on one system',
      });
      await waitFor(() => expect(checkbox).toBeEnabled());
      fireEvent.click(checkbox);
      await waitFor(() => expect(score.setSystemLock).toHaveBeenCalledWith(true));
      await screen.findByText('Locked measure positions 1–3');
      await runEditorCommand('btn-undo');
      await screen.findByText('No system locks in this score or part.');
      await runEditorCommand('btn-redo');
      await screen.findByText('Locked measure positions 1–3');
      fireEvent.click(await screen.findByRole('button', { name: 'Unlock selected measures' }));
      await waitFor(() => expect(score.setSystemLock).toHaveBeenCalledWith(false));
      await screen.findByText('No system locks in this score or part.');
      expect(score.relayout).toHaveBeenCalled();
    },
  );
});
