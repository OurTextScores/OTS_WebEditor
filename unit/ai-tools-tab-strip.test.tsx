import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AiToolsTabStrip,
  type AiToolsTabStripProps,
} from '../components/score-editor/ai-tools/AiToolsTabStrip';

const props = (overrides: Partial<AiToolsTabStripProps> = {}): AiToolsTabStripProps => ({
  activeTab: 'assistant',
  setActiveTab: vi.fn(),
  aiEnabled: true,
  status: { checkpointCount: 0, dirtySinceCheckpoint: false, loading: false },
  ...overrides,
});

/** Every tab button, by the testid it is selected with elsewhere in the suite. */
const TABS: { testId: string; tab: AiToolsTabStripProps['activeTab'] }[] = [
  { testId: 'tab-ai', tab: 'assistant' },
  { testId: 'tab-notagen', tab: 'notagen' },
  { testId: 'tab-transcoda', tab: 'transcoda' },
  { testId: 'tab-multitrack-vae', tab: 'multitrack' },
  { testId: 'tab-harmony', tab: 'harmony' },
  { testId: 'tab-functional-harmony', tab: 'functional' },
  { testId: 'tab-mma', tab: 'mma' },
];

describe('AiToolsTabStrip', () => {
  it('switches to the tab that was clicked, for every tab', () => {
    // Seven near-identical buttons: a crossed pair is the failure a moved block
    // produces, and it is invisible in any other test.
    for (const { testId, tab } of TABS) {
      const setActiveTab = vi.fn();
      const { unmount } = render(<AiToolsTabStrip {...props({ setActiveTab })} />);

      fireEvent.click(screen.getByTestId(testId));
      expect(setActiveTab, `${testId} should select ${tab}`).toHaveBeenCalledWith(tab);
      unmount();
    }
  });

  it('hides the assistant-backed tabs when AI is not configured', () => {
    render(<AiToolsTabStrip {...props({ aiEnabled: false })} />);

    expect(screen.queryByTestId('tab-ai')).toBeNull();
    expect(screen.queryByTestId('tab-notagen')).toBeNull();
    // Tabs backed by local services stay available.
    expect(screen.getByTestId('tab-transcoda')).toBeVisible();
    expect(screen.getByTestId('tab-mma')).toBeVisible();
  });

  it('reports checkpoint state', () => {
    const { rerender } = render(<AiToolsTabStrip {...props()} />);
    expect(screen.getByText('No checkpoint yet')).toBeVisible();

    rerender(
      <AiToolsTabStrip
        {...props({
          status: { checkpointCount: 3, dirtySinceCheckpoint: true, loading: false },
        })}
      />,
    );
    expect(screen.getByText('Unsaved score changes')).toBeVisible();

    // Saved and up to date: no status text rather than a reassurance nobody needs.
    rerender(
      <AiToolsTabStrip
        {...props({
          status: { checkpointCount: 3, dirtySinceCheckpoint: false, loading: false },
        })}
      />,
    );
    expect(screen.queryByText('Unsaved score changes')).toBeNull();
    expect(screen.queryByText('No checkpoint yet')).toBeNull();
  });

  it('shows a loading note while the document is loading', () => {
    render(
      <AiToolsTabStrip
        {...props({
          status: { checkpointCount: 1, dirtySinceCheckpoint: false, loading: true },
        })}
      />,
    );

    expect(screen.getByText('Loading...')).toBeVisible();
  });
});
