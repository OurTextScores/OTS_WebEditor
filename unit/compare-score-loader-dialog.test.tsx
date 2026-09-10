import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CompareScoreLoaderDialog } from '../components/score-editor/CompareScoreLoaderDialog';

describe('CompareScoreLoaderDialog', () => {
  it('collects both score files before enabling Compare', async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    render(
      <CompareScoreLoaderDialog
        busy={false}
        error={null}
        onCompare={onCompare}
        onClose={() => {}}
      />,
    );

    const compareButton = screen.getByRole('button', { name: 'Compare' });
    expect(compareButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load left score' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load right score' })).toBeInTheDocument();

    const leftFile = new File(['<score-partwise/>'], 'reference.musicxml', {
      type: 'application/xml',
    });
    const rightFile = new File(['<score-partwise/>'], 'revision.musicxml', {
      type: 'application/xml',
    });
    await user.upload(screen.getByTestId('compare-left-score-input'), leftFile);
    expect(compareButton).toBeDisabled();
    await user.upload(screen.getByTestId('compare-right-score-input'), rightFile);

    expect(screen.getByText('reference.musicxml')).toBeInTheDocument();
    expect(screen.getByText('revision.musicxml')).toBeInTheDocument();
    expect(compareButton).toBeEnabled();
    await user.click(compareButton);
    expect(onCompare).toHaveBeenCalledWith(leftFile, rightFile);
  });
});
