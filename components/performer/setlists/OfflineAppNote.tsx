'use client';

import React, { useSyncExternalStore } from 'react';

const supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

const subscribe = (onChange: () => void) => {
  if (!supported()) return () => {};
  navigator.serviceWorker.addEventListener('controllerchange', onChange);
  return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
};

const noteNow = (): string | null => {
  if (!supported()) return 'This browser cannot keep the app for offline use.';
  if (process.env.NODE_ENV !== 'production') return null; // the dev server has no service worker
  return navigator.serviceWorker.controller
    ? 'The app is saved on this device and opens offline.'
    : 'Saving the app for offline use…';
};

/** Whether the perform app itself opens offline here (its service worker controls the page), in one line. */
export function OfflineAppNote() {
  const note = useSyncExternalStore(subscribe, noteNow, () => null);
  if (!note) return null;
  return (
    <p data-testid="offline-app-note" className="text-sm text-slate-500">
      {note}
    </p>
  );
}
