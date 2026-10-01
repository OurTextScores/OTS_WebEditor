import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NoticeHost,
  clearNotices,
  confirmDialog,
  dismissToast,
  getNoticeSnapshot,
  markAllNoticesRead,
  notify,
  promptDialog,
} from '../../components/shell/notices';
import { NOTICE_TOAST_MS } from '../../components/shell/notices/noticeStore';

beforeEach(() => clearNotices());
afterEach(() => vi.useRealTimers());

describe('notice store', () => {
  it('retains every notice for the session, newest last', () => {
    notify({ kind: 'info', title: 'one' });
    notify({ kind: 'error', title: 'two', detail: 'why' });
    const { notices, unreadCount } = getNoticeSnapshot();
    expect(notices.map((notice) => notice.title)).toEqual(['one', 'two']);
    expect(unreadCount).toBe(2);
  });

  it('gives each notice its own id', () => {
    const a = notify({ kind: 'info', title: 'a' });
    const b = notify({ kind: 'info', title: 'b' });
    expect(a).not.toBe(b);
  });

  it('keeps a dismissed toast in the retained list', () => {
    const id = notify({ kind: 'warning', title: 'careful' });
    dismissToast(id);
    const notice = getNoticeSnapshot().notices[0];
    expect(notice.toast).toBe(false);
    expect(notice.unread).toBe(true);
  });

  it('marks everything read without dropping it', () => {
    notify({ kind: 'info', title: 'a' });
    markAllNoticesRead();
    expect(getNoticeSnapshot().unreadCount).toBe(0);
    expect(getNoticeSnapshot().notices).toHaveLength(1);
  });

  it('caps what it retains', () => {
    for (let i = 0; i < 130; i += 1) notify({ kind: 'info', title: String(i) });
    const { notices } = getNoticeSnapshot();
    expect(notices).toHaveLength(100);
    expect(notices.at(-1)?.title).toBe('129');
  });

  it('returns a stable snapshot until something changes', () => {
    notify({ kind: 'info', title: 'a' });
    expect(getNoticeSnapshot()).toBe(getNoticeSnapshot());
  });
});

describe('NoticeHost toasts', () => {
  it('announces an error as an alert and everything else as status', () => {
    render(<NoticeHost />);
    act(() => {
      notify({ kind: 'error', title: 'Unable to delete', detail: 'See the console.' });
      notify({ kind: 'success', title: 'Saved' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to delete');
    expect(screen.getByRole('alert')).toHaveTextContent('See the console.');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('dismisses on request', async () => {
    const user = userEvent.setup();
    render(<NoticeHost />);
    act(() => void notify({ kind: 'info', title: 'hello' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('times a toast out, longest for errors', () => {
    vi.useFakeTimers();
    render(<NoticeHost />);
    act(() => {
      notify({ kind: 'info', title: 'quick' });
      notify({ kind: 'error', title: 'slow' });
    });
    act(() => void vi.advanceTimersByTime(NOTICE_TOAST_MS.info + 1));
    expect(screen.queryByText('quick')).toBeNull();
    expect(screen.getByText('slow')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(NOTICE_TOAST_MS.error));
    expect(screen.queryByText('slow')).toBeNull();
  });

  it('runs a notice action and dismisses the toast', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NoticeHost />);
    act(() => void notify({ kind: 'info', title: 'Undo?', action: { label: 'Undo', onSelect } }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByText('Undo?')).toBeNull();
  });
});

describe('confirmDialog and promptDialog', () => {
  it('resolves true when confirmed and false when declined', async () => {
    const user = userEvent.setup();
    render(<NoticeHost />);

    let answer = confirmDialog({
      title: 'Remove Piano?',
      message: 'Gone for good.',
      confirmLabel: 'Remove',
    });
    expect(await screen.findByRole('dialog')).toHaveTextContent('Remove Piano?');
    expect(screen.getByRole('dialog')).toHaveTextContent('Gone for good.');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await expect(answer).resolves.toBe(true);

    answer = confirmDialog({ title: 'Again?' });
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBe(false);
  });

  it('treats Escape as declining', async () => {
    const user = userEvent.setup();
    render(<NoticeHost />);
    const answer = confirmDialog({ title: 'Sure?' });
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await expect(answer).resolves.toBe(false);
  });

  it('returns the typed value, starting from the default, or null on cancel', async () => {
    const user = userEvent.setup();
    render(<NoticeHost />);

    let answer = promptDialog({ title: 'Rename', label: 'Name', defaultValue: 'Old' });
    const input = await screen.findByTestId('prompt-dialog-input');
    expect(input).toHaveValue('Old');
    await user.clear(input);
    await user.type(input, 'New{Enter}');
    await expect(answer).resolves.toBe('New');

    answer = promptDialog({ title: 'Rename' });
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBeNull();
  });

  it('shows queued requests one at a time, in order', async () => {
    const user = userEvent.setup();
    render(<NoticeHost />);
    const first = confirmDialog({ title: 'First' });
    const second = confirmDialog({ title: 'Second' });
    expect(await screen.findByRole('dialog')).toHaveTextContent('First');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await expect(first).resolves.toBe(true);
    expect(await screen.findByText('Second')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(second).resolves.toBe(false);
  });

  it('answers with the safe default instead of hanging when no host is mounted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(confirmDialog({ title: 'Nobody home' })).resolves.toBe(false);
    await expect(promptDialog({ title: 'Nobody home' })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('settles a pending request when the host unmounts', async () => {
    const view = render(<NoticeHost />);
    const answer = confirmDialog({ title: 'Pending' });
    await screen.findByRole('dialog');
    view.unmount();
    await expect(answer).resolves.toBe(false);
  });
});
