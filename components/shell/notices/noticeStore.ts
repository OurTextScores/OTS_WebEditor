/**
 * Notice service (SHELL_REDESIGN_DESIGN §8.6): non-modal feedback that replaces `alert()`.
 *
 * A module-level store, so `notify` can be called from anywhere (including handlers that
 * are not React components) and `NoticeHost` renders it. Notices are retained for the
 * session so a status-bar indicator (Phase 2) can list the ones a user missed.
 */
export type NoticeKind = 'error' | 'warning' | 'info' | 'success';

export interface NoticeAction {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface NoticeInput {
  readonly kind: NoticeKind;
  readonly title: string;
  readonly detail?: string;
  readonly action?: NoticeAction;
}

export interface Notice extends NoticeInput {
  readonly id: number;
  readonly createdAt: number;
  /** Still shown as a toast; cleared on dismiss or timeout but the notice is retained. */
  readonly toast: boolean;
  /** Not yet seen in the notice list. */
  readonly unread: boolean;
}

export interface NoticeSnapshot {
  readonly notices: readonly Notice[];
  readonly unreadCount: number;
}

/** Errors linger longest: they are the ones a user must be able to read and act on. */
export const NOTICE_TOAST_MS: Record<NoticeKind, number> = {
  success: 5_000,
  info: 5_000,
  warning: 8_000,
  error: 12_000,
};

const MAX_RETAINED = 100;

let nextId = 1;
let notices: readonly Notice[] = [];
let snapshot: NoticeSnapshot = { notices, unreadCount: 0 };
const listeners = new Set<() => void>();

function commit(next: readonly Notice[]): void {
  notices = next;
  snapshot = { notices, unreadCount: next.filter((notice) => notice.unread).length };
  for (const listener of [...listeners]) listener();
}

export function notify(input: NoticeInput): number {
  const notice: Notice = {
    ...input,
    id: nextId++,
    createdAt: Date.now(),
    toast: true,
    unread: true,
  };
  commit([...notices, notice].slice(-MAX_RETAINED));
  return notice.id;
}

/**
 * `alert(message)` without the modal: the first line is the title, any further lines the
 * detail. For the many call sites that already build a single message string.
 */
const fromMessage = (kind: NoticeKind, message: string): number => {
  const [title, ...rest] = message.split('\n');
  const detail = rest.join('\n').trim();
  return notify({ kind, title: title.trim(), ...(detail ? { detail } : {}) });
};

export const notifyError = (message: string): number => fromMessage('error', message);
export const notifyWarning = (message: string): number => fromMessage('warning', message);

/** Hides the toast but keeps the notice in the retained list. */
export function dismissToast(id: number): void {
  if (!notices.some((notice) => notice.id === id && notice.toast)) return;
  commit(notices.map((notice) => (notice.id === id ? { ...notice, toast: false } : notice)));
}

export function markAllNoticesRead(): void {
  if (snapshot.unreadCount === 0) return;
  commit(notices.map((notice) => (notice.unread ? { ...notice, unread: false } : notice)));
}

export function clearNotices(): void {
  commit([]);
}

export function subscribeToNotices(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNoticeSnapshot(): NoticeSnapshot {
  return snapshot;
}

/** Test seam: forget everything, including id numbering. */
export function resetNoticesForTests(): void {
  nextId = 1;
  commit([]);
}
