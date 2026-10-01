/**
 * Promise-returning replacements for `confirm()` and `prompt()` (SHELL_REDESIGN_DESIGN §8.6).
 *
 * The store holds one request at a time and queues the rest; `NoticeHost` renders the
 * head of the queue. With no host mounted nothing could ever answer, so the request
 * resolves to its safe default (declined / cancelled) instead of hanging the caller.
 */
export interface ConfirmOptions {
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Styles the confirm button as destructive (e.g. removing a part). */
  readonly destructive?: boolean;
}

export interface PromptOptions {
  readonly title: string;
  readonly label?: string;
  readonly defaultValue?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

export type DialogRequest =
  | {
      readonly id: number;
      readonly kind: 'confirm';
      readonly options: ConfirmOptions;
      readonly resolve: (value: boolean) => void;
    }
  | {
      readonly id: number;
      readonly kind: 'prompt';
      readonly options: PromptOptions;
      readonly resolve: (value: string | null) => void;
    };

let nextId = 1;
let queue: readonly DialogRequest[] = [];
let hosts = 0;
const listeners = new Set<() => void>();

function commit(next: readonly DialogRequest[]): void {
  queue = next;
  for (const listener of [...listeners]) listener();
}

/** `NoticeHost` registers itself so requests know somebody can answer them. */
export function registerDialogHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts === 0) {
      // Nobody left to answer: settle everything pending rather than leak promises.
      for (const request of queue) cancel(request);
      commit([]);
    }
  };
}

const cancel = (request: DialogRequest) =>
  request.kind === 'confirm' ? request.resolve(false) : request.resolve(null);

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (hosts === 0) {
    console.warn(`confirmDialog("${options.title}") has no host mounted; treating as declined.`);
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    commit([...queue, { id: nextId++, kind: 'confirm', options, resolve }]);
  });
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  if (hosts === 0) {
    console.warn(`promptDialog("${options.title}") has no host mounted; treating as cancelled.`);
    return Promise.resolve(null);
  }
  return new Promise<string | null>((resolve) => {
    commit([...queue, { id: nextId++, kind: 'prompt', options, resolve }]);
  });
}

/** Resolves the head request and shows the next. */
export function settleDialog(id: number, value: boolean | string | null): void {
  const request = queue.find((entry) => entry.id === id);
  if (!request) return;
  commit(queue.filter((entry) => entry.id !== id));
  if (request.kind === 'confirm') request.resolve(value === true);
  else request.resolve(typeof value === 'string' ? value : null);
}

export function subscribeToDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDialogQueue(): readonly DialogRequest[] {
  return queue;
}
