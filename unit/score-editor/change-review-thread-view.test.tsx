// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeReviewThreadView } from '../../components/score-editor/compare/ChangeReviewThreadView';
import type { ChangeReviewThread } from '../../components/score-editor/compare/compare-types';

const fetcher = vi.hoisted(() => ({ fetchJsonOrThrow: vi.fn(async () => ({})) }));
vi.mock('../../lib/fetch-json', () => fetcher);

const comment = (id: string, userId: string, over: Record<string, unknown> = {}) => ({
  commentId: id,
  userId,
  username: `name-${userId}`,
  content: `text ${id}`,
  createdAt: '2026-10-01T10:00:00Z',
  editedAt: null,
  ...over,
});
const thread = (over: Record<string, unknown> = {}) =>
  ({
    threadId: 'th/1',
    status: 'open',
    comments: [
      comment('c1', 'u1'),
      comment('c2', 'u2', { editedAt: '2026-10-02T10:00:00Z', username: '' }),
    ],
    ...over,
  }) as unknown as ChangeReviewThread;

function setup(over: Record<string, unknown> = {}) {
  const props = {
    thread: thread(),
    changeReviewId: 'cr 7',
    canResolve: true,
    canReply: true,
    viewerUserId: 'u1',
    actionBusy: false,
    replyThreadId: null as string | null,
    replyContent: '',
    setReplyThreadId: vi.fn(),
    setReplyContent: vi.fn(),
    runAction: vi.fn(async (action: () => Promise<void>) => action()),
    ...over,
  };
  render(
    <ChangeReviewThreadView
      {...(props as unknown as React.ComponentProps<typeof ChangeReviewThreadView>)}
    />,
  );
  return props;
}
const lastCall = () =>
  fetcher.fetchJsonOrThrow.mock.calls.at(-1) as unknown as [string, RequestInit];

beforeEach(() => fetcher.fetchJsonOrThrow.mockClear());
afterEach(cleanup);

describe('ChangeReviewThreadView', () => {
  it('shows the status, and the author and text of every comment, marking edited ones', () => {
    setup();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('text c1')).toBeInTheDocument();
    expect(screen.getByText(/name-u1/)).toBeInTheDocument();
    // no username: falls back to the user id; edited comments say so
    expect(screen.getByText(/u2/)).toHaveTextContent('edited');
    expect(screen.getByText(/name-u1/)).not.toHaveTextContent('edited');
  });

  it('colours a resolved thread differently from an open one', () => {
    setup({ thread: thread({ status: 'resolved' }) });
    expect(screen.getByText('resolved').className).toContain('bg-emerald-100');
    cleanup();
    setup();
    expect(screen.getByText('open').className).toContain('bg-amber-100');
  });

  it('resolves an open thread through the API, escaping the ids', async () => {
    const props = setup();
    fireEvent.click(screen.getByText('Resolve'));
    expect(props.runAction).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(fetcher.fetchJsonOrThrow).toHaveBeenCalled());
    const [url, init] = lastCall();
    expect(url).toBe('/api/proxy/change-reviews/cr%207/threads/th%2F1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ status: 'resolved' });
  });

  it('reopens a resolved thread', async () => {
    setup({ thread: thread({ status: 'resolved' }) });
    fireEvent.click(screen.getByText('Reopen'));
    await vi.waitFor(() => expect(fetcher.fetchJsonOrThrow).toHaveBeenCalled());
    expect(JSON.parse(String(lastCall()[1].body))).toEqual({ status: 'open' });
  });

  it('offers Resolve only to someone who may resolve', () => {
    setup({ canResolve: false });
    expect(screen.queryByText('Resolve')).toBeNull();
  });

  it('lets the viewer delete only their own comments', async () => {
    setup();
    const deletes = screen.getAllByText('Delete');
    expect(deletes).toHaveLength(1);
    fireEvent.click(deletes[0]);
    await vi.waitFor(() => expect(fetcher.fetchJsonOrThrow).toHaveBeenCalled());
    const [url, init] = lastCall();
    expect(url).toBe('/api/proxy/change-reviews/cr%207/comments/c1');
    expect(init.method).toBe('DELETE');
  });

  it('shows no Delete when the viewer is unknown', () => {
    setup({ viewerUserId: undefined });
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('opens the reply box for this thread with an empty draft', () => {
    const props = setup();
    fireEvent.click(screen.getByText('Reply'));
    expect(props.setReplyThreadId).toHaveBeenCalledWith('th/1');
    expect(props.setReplyContent).toHaveBeenCalledWith('');
  });

  it('shows no reply control to someone who cannot reply', () => {
    setup({ canReply: false });
    expect(screen.queryByText('Reply')).toBeNull();
    expect(screen.queryByPlaceholderText('Write a reply')).toBeNull();
  });

  it('shows the reply box only on the thread being replied to', () => {
    setup({ replyThreadId: 'another' });
    expect(screen.queryByPlaceholderText('Write a reply')).toBeNull();
    expect(screen.getByText('Reply')).toBeInTheDocument();
  });

  it('edits the draft, cancels it, and sends it', async () => {
    const props = setup({ replyThreadId: 'th/1', replyContent: 'Looks good' });
    const box = screen.getByPlaceholderText('Write a reply');
    expect(box).toHaveValue('Looks good');
    fireEvent.change(box, { target: { value: 'Looks great' } });
    expect(props.setReplyContent).toHaveBeenCalledWith('Looks great');

    fireEvent.click(screen.getByText('Cancel'));
    expect(props.setReplyThreadId).toHaveBeenCalledWith(null);
    expect(props.setReplyContent).toHaveBeenLastCalledWith('');
    props.setReplyThreadId.mockClear();
    props.setReplyContent.mockClear();

    fireEvent.click(screen.getByText('Reply'));
    await vi.waitFor(() => expect(fetcher.fetchJsonOrThrow).toHaveBeenCalled());
    const [url, init] = lastCall();
    expect(url).toBe('/api/proxy/change-reviews/cr%207/threads/th%2F1/comments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ content: 'Looks good' });
    await vi.waitFor(() => expect(props.setReplyThreadId).toHaveBeenCalledWith(null));
    expect(props.setReplyContent).toHaveBeenCalledWith('');
  });

  it('disables every control while an action is running', () => {
    setup({ actionBusy: true, replyThreadId: 'th/1' });
    for (const label of ['Resolve', 'Delete', 'Cancel', 'Reply']) {
      expect(screen.getByText(label)).toBeDisabled();
    }
    expect(screen.getByPlaceholderText('Write a reply')).toBeDisabled();
  });
});
