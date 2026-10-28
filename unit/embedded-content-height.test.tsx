import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEmbeddedContentHeight } from '../components/score-editor/useEmbeddedContentHeight';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.cssText = '';
  document.body.style.cssText = '';
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('embedded content height', () => {
  it('retains the scrollbar gutter while switching between short and tall layouts', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('parent', { postMessage });
    let resized!: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resized = callback; }
      observe() {}
      disconnect = disconnect;
    });
    let contentHeight = 400;
    vi.spyOn(document.body, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
    vi.stubGlobal('innerHeight', 500);
    document.body.innerHTML = '<main style="min-height: 100vh"></main>';
    const root = document.documentElement;
    root.style.overflow = 'auto';
    root.style.scrollbarGutter = 'auto';
    const { unmount } = renderHook(() => useEmbeddedContentHeight(true));
    expect(root.style.scrollbarGutter).toBe('stable');
    expect(root.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('clip');
    contentHeight = 900;
    act(() => resized([], {} as ResizeObserver));
    expect(root.style.overflow).toBe('');
    expect(root.style.scrollbarGutter).toBe('stable');
    vi.stubGlobal('innerHeight', 900);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.scrollbarGutter).toBe('stable');
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'ots-compare-height', height: 900 }, window.location.origin);
    unmount();
    expect(root.style.overflow).toBe('auto');
    expect(root.style.scrollbarGutter).toBe('auto');
    expect(document.querySelector('main')?.style.minHeight).toBe('100vh');
    expect(disconnect).toHaveBeenCalledOnce();
    postMessage.mockClear();
    act(() => window.dispatchEvent(new Event('resize')));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('targets only the explicitly configured cross-origin parent', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('parent', { postMessage });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    window.history.replaceState(null, '', '/?parentOrigin=https%3A%2F%2Fhost.example');
    const view = renderHook(() => useEmbeddedContentHeight(true));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'ots-compare-height' }), 'https://host.example');
    view.unmount();
    postMessage.mockClear();
    window.history.replaceState(null, '', '/?parentOrigin=*');
    renderHook(() => useEmbeddedContentHeight(true));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('leaves standalone editors alone', () => {
    const observe = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect() {} });
    renderHook(() => useEmbeddedContentHeight(true));
    expect(observe).not.toHaveBeenCalled();
    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });
});
