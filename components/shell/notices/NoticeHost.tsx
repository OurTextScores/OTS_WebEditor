'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../../ui/Button';
import { Dialog, DialogContent } from '../../ui/Dialog';
import {
  getDialogQueue,
  registerDialogHost,
  settleDialog,
  subscribeToDialogs,
  type DialogRequest,
} from './dialogStore';
import {
  NOTICE_TOAST_MS,
  dismissToast,
  getNoticeSnapshot,
  subscribeToNotices,
  type Notice,
} from './noticeStore';

const kindClasses: Record<Notice['kind'], string> = {
  error: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-slate-300 bg-white text-slate-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

function Toast({ notice }: { notice: Notice }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(notice.id), NOTICE_TOAST_MS[notice.kind]);
    return () => window.clearTimeout(timer);
  }, [notice.id, notice.kind]);

  return (
    <div
      // Errors interrupt (alert); everything else waits its turn (status).
      role={notice.kind === 'error' ? 'alert' : 'status'}
      data-testid={`notice-${notice.kind}`}
      className={`pointer-events-auto flex items-start gap-3 rounded border px-3 py-2 text-sm shadow-raised ${kindClasses[notice.kind]}`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{notice.title}</div>
        {notice.detail && (
          <div className="mt-0.5 break-words text-xs opacity-80">{notice.detail}</div>
        )}
        {notice.action && (
          <button
            type="button"
            className="mt-1 text-xs font-semibold underline"
            onClick={() => {
              notice.action?.onSelect();
              dismissToast(notice.id);
            }}
          >
            {notice.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-mr-1 rounded px-1 text-base leading-none opacity-60 hover:opacity-100"
        onClick={() => dismissToast(notice.id)}
      >
        ×
      </button>
    </div>
  );
}

function RequestDialog({ request }: { request: DialogRequest }) {
  const [value, setValue] = useState(
    request.kind === 'prompt' ? (request.options.defaultValue ?? '') : '',
  );
  const { options } = request;
  const decline = () => settleDialog(request.id, request.kind === 'confirm' ? false : null);
  const accept = () => settleDialog(request.id, request.kind === 'confirm' ? true : value);

  return (
    <Dialog open onOpenChange={(open) => !open && decline()}>
      <DialogContent
        className="max-w-md"
        data-testid={request.kind === 'confirm' ? 'confirm-dialog' : 'prompt-dialog'}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            accept();
          }}
        >
          <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
            {options.title}
          </DialogPrimitive.Title>
          {request.kind === 'confirm' ? (
            <DialogPrimitive.Description className="mt-2 text-sm text-slate-600">
              {request.options.message ?? ''}
            </DialogPrimitive.Description>
          ) : (
            <label className="mt-3 block text-sm text-slate-700">
              {request.options.label && <span className="mb-1 block">{request.options.label}</span>}
              <input
                autoFocus
                data-testid="prompt-dialog-input"
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" size="md" onClick={decline}>
              {options.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              type="submit"
              size="md"
              variant={
                request.kind === 'confirm' && request.options.destructive ? 'danger' : 'primary'
              }
              data-testid="dialog-confirm"
            >
              {options.confirmLabel ?? 'OK'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders toasts and the confirm/prompt dialog queue. Mount once, near the app root; the
 * stores it reads are module-level, so `notify` works from any code.
 */
export function NoticeHost() {
  const { notices } = useSyncExternalStore(
    subscribeToNotices,
    getNoticeSnapshot,
    getNoticeSnapshot,
  );
  const queue = useSyncExternalStore(subscribeToDialogs, getDialogQueue, getDialogQueue);
  useEffect(() => registerDialogHost(), []);

  const toasts = notices.filter((notice) => notice.toast);
  const head = queue[0];

  return (
    <>
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 top-14 z-toast flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((notice) => (
          <Toast key={notice.id} notice={notice} />
        ))}
      </div>
      {head && <RequestDialog key={head.id} request={head} />}
    </>
  );
}
