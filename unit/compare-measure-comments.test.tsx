import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CompareMeasureComments,
  type AiMeasureAnchor,
  type AiMeasureThread,
} from '../components/score-editor/compare/CompareMeasureComments';

const anchor: AiMeasureAnchor = {
  key: 'p0-m3',
  partIndex: 0,
  measureNumber: 3,
  leftIndex: 2,
  rightIndex: 5,
};

const thread = (key: string, measureNumber: number, comments = 1): AiMeasureThread => ({
  key,
  partIndex: 0,
  measureNumber,
  leftIndex: null,
  rightIndex: null,
  comments: Array.from({ length: comments }, (_, index) => ({
    id: `${key}-${index}`,
    author: 'you' as const,
    text: `comment ${index}`,
    createdAt: '2026-07-31T00:00:00.000Z',
  })),
});

const makeActions = () => ({
  focusAnchor: vi.fn(),
  changeDraft: vi.fn(),
  addComment: vi.fn(),
  removeComment: vi.fn(),
});

describe('CompareMeasureComments', () => {
  it('renders nothing with no focused anchor and no threads', () => {
    const { container } = render(
      <CompareMeasureComments
        model={{ threads: {}, focusedAnchor: null, draft: '' }}
        actions={makeActions()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('prompts for a measure when threads exist but none is focused', () => {
    render(
      <CompareMeasureComments
        model={{ threads: { 'p0-m3': thread('p0-m3', 3) }, focusedAnchor: null, draft: '' }}
        actions={makeActions()}
      />,
    );

    expect(
      screen.getByText('Click a measure in either pane to add a comment.'),
    ).toBeInTheDocument();
  });

  it('shows the focused anchor part and measure with its comments', () => {
    render(
      <CompareMeasureComments
        model={{ threads: { 'p0-m3': thread('p0-m3', 3, 2) }, focusedAnchor: anchor, draft: '' }}
        actions={makeActions()}
      />,
    );

    // partIndex is zero-based in the model and one-based in the label.
    expect(screen.getByText(/Part 1 · Measure 3/)).toBeInTheDocument();
    expect(screen.getByText('comment 0')).toBeInTheDocument();
    expect(screen.getByText('comment 1')).toBeInTheDocument();
  });

  it('disables Add comment until the draft has non-whitespace content', () => {
    const actions = makeActions();
    const { rerender } = render(
      <CompareMeasureComments
        model={{ threads: {}, focusedAnchor: anchor, draft: '   ' }}
        actions={actions}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled();

    rerender(
      <CompareMeasureComments
        model={{ threads: {}, focusedAnchor: anchor, draft: 'looks wrong' }}
        actions={actions}
      />,
    );
    const add = screen.getByRole('button', { name: 'Add comment' });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(actions.addComment).toHaveBeenCalledOnce();
  });

  it('submits on Ctrl/Cmd+Enter but not on a bare Enter', () => {
    const actions = makeActions();
    render(
      <CompareMeasureComments
        model={{ threads: {}, focusedAnchor: anchor, draft: 'note' }}
        actions={actions}
      />,
    );
    const textarea = screen.getByPlaceholderText('Add a comment for this measure…');

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(actions.addComment).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(actions.addComment).toHaveBeenCalledTimes(2);
  });

  it('closing the focused anchor also clears the draft', () => {
    const actions = makeActions();
    render(
      <CompareMeasureComments
        model={{ threads: {}, focusedAnchor: anchor, draft: 'half typed' }}
        actions={actions}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(actions.focusAnchor).toHaveBeenCalledWith(null);
    expect(actions.changeDraft).toHaveBeenCalledWith('');
  });

  it('removes a comment against the focused anchor key', () => {
    const actions = makeActions();
    render(
      <CompareMeasureComments
        model={{ threads: { 'p0-m3': thread('p0-m3', 3) }, focusedAnchor: anchor, draft: '' }}
        actions={actions}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove comment' }));

    expect(actions.removeComment).toHaveBeenCalledWith('p0-m3', 'p0-m3-0');
  });

  it('orders the thread chips by measure number and focuses the whole anchor', () => {
    const actions = makeActions();
    render(
      <CompareMeasureComments
        model={{
          threads: {
            b: { ...thread('b', 12), leftIndex: 4, rightIndex: 9 },
            a: thread('a', 2),
          },
          focusedAnchor: null,
          draft: '',
        }}
        actions={actions}
      />,
    );

    const chips = screen.getAllByRole('button').filter((b) => b.textContent?.startsWith('m'));
    expect(chips.map((b) => b.textContent)).toEqual(['m2 · 1', 'm12 · 1']);

    fireEvent.click(chips[1]);
    // The full anchor travels with the click; side indices must not be dropped.
    expect(actions.focusAnchor).toHaveBeenCalledWith({
      key: 'b',
      partIndex: 0,
      measureNumber: 12,
      leftIndex: 4,
      rightIndex: 9,
    });
  });
});
