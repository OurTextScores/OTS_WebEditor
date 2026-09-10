import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined' && !window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 0);
  window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
}

// jsdom's File/Blob implementations are minimal and don't include `.arrayBuffer()`,
// but our app code relies on it for file uploads. Use Node's web-compatible versions in tests.
if (typeof window !== 'undefined') {
  const fileProto = (window as any).File?.prototype;
  if (!fileProto || typeof fileProto.arrayBuffer !== 'function') {
    (window as any).Blob = NodeBlob;
    (window as any).File = NodeFile;
    (globalThis as any).Blob = NodeBlob;
    (globalThis as any).File = NodeFile;
  }
}
