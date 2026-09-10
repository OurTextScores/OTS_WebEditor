import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupScoreEditorTest } from './test-harness';

const mocked = vi.hoisted(() => ({
  loadWebMscore: vi.fn(),
  loadWebMscoreInProcess: vi.fn(),
}));
const mockedNavigation = vi.hoisted(() => ({ useSearchParams: vi.fn() }));

vi.mock('next/navigation', () => ({ useSearchParams: mockedNavigation.useSearchParams }));
vi.mock('../../lib/webmscore-loader', () => ({
  loadWebMscore: mocked.loadWebMscore,
  loadWebMscoreInProcess: mocked.loadWebMscoreInProcess,
}));

import ScoreEditor from '../../components/ScoreEditor';

describe('ScoreEditor: dialogs rendered by the editor', () => {
  setupScoreEditorTest(mocked, mockedNavigation);

  it('new score dialog shows pickup checkbox and reveals inputs when checked', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore = {
      load: vi.fn(async () => score),
      ready: Promise.resolve(),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);

    render(<ScoreEditor />);

    // Open new score dialog
    const newScoreButton = screen.getByText('New Score');
    await user.click(newScoreButton);

    await waitFor(() => expect(screen.getByTestId('new-score-modal')).toBeInTheDocument());

    // Verify pickup checkbox exists
    const checkbox = screen.getByTestId('new-score-pickup-checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    // Pickup numerator/denominator should not be visible yet
    expect(screen.queryByTestId('new-score-pickup-numerator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-score-pickup-denominator')).not.toBeInTheDocument();

    // Check the checkbox
    await user.click(checkbox);

    // Now pickup inputs should be visible
    await waitFor(() => {
      expect(screen.getByTestId('new-score-pickup-numerator')).toBeInTheDocument();
      expect(screen.getByTestId('new-score-pickup-denominator')).toBeInTheDocument();
    });
  });

  it('loads local left and right scores into the compare workspace', async () => {
    const user = userEvent.setup();
    const leftXml = '<score-partwise version="4.0"><part-list/></score-partwise>';
    const rightXml = '<score-partwise version="4.0"><part-list/><credit/></score-partwise>';
    const makeScore = (xml: string) => ({
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg width="100" height="40"></svg>'),
      saveXml: vi.fn(async () => new TextEncoder().encode(xml)),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({ parts: [] })),
      measurePositions: vi.fn(async () => ({
        elements: [],
        events: [],
        pageSize: { width: 100, height: 40 },
      })),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
    });
    const mainScore = makeScore(rightXml);
    const leftCompareScore = makeScore(leftXml);
    const webmscore = {
      load: vi.fn().mockResolvedValueOnce(mainScore).mockResolvedValueOnce(leftCompareScore),
      ready: Promise.resolve(),
    };
    mocked.loadWebMscore.mockResolvedValue(webmscore);

    render(<ScoreEditor />);
    await user.click(screen.getByRole('button', { name: 'Load scores to compare' }));
    expect(screen.getByTestId('compare-score-loader-modal')).toBeInTheDocument();

    const leftFile = new File([leftXml], 'reference.musicxml', { type: 'application/xml' });
    const rightFile = new File([rightXml], 'revision.musicxml', { type: 'application/xml' });
    await user.upload(screen.getByTestId('compare-left-score-input'), leftFile);
    await user.upload(screen.getByTestId('compare-right-score-input'), rightFile);
    await user.click(screen.getByRole('button', { name: 'Compare' }));

    await waitFor(() => expect(screen.getByTestId('checkpoint-compare-modal')).toBeInTheDocument());
    expect(screen.getByText('reference.musicxml vs revision.musicxml')).toBeInTheDocument();
    expect(webmscore.load.mock.calls.map((call) => call[0])).toEqual(['musicxml', 'musicxml']);
  });
});
