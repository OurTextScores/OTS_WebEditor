import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/score-editor/compare/useMergedScoreDocument', () => ({
  useMergedScoreDocument: () => ({ score: null, revision: 0 }),
}));

import { ScannerFindingRows } from '../components/score-editor/compare/ScannerFindingRows';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('finding messages', () => {
  it('uses the configured exact parent and clamps the issue index after findings change', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('parent', { postMessage });
    window.history.replaceState(null, '', '/?parentOrigin=https%3A%2F%2Fhost.example');
    const findings = [{ kind: 'first', message: 'one' }, { kind: 'second', message: 'two' }];
    const props = { systems: [], xml: '', label: 'Reading', engineId: 'one', merged: null, resolveUrl: (url: string) => url };
    const view = render(<ScannerFindingRows {...props} findings={findings} />);
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'ots-finding-issue', kind: 'first', index: 0, total: 2 }),
      'https://host.example',
    ));
    fireEvent.click(screen.getByTestId('finding-rows-next'));
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'second', index: 1, total: 2 }), 'https://host.example',
    ));
    view.rerender(<ScannerFindingRows {...props} findings={[findings[0]]} />);
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'first', index: 0, total: 1 }), 'https://host.example',
    ));
    expect(screen.getByTestId('finding-rows-position')).toHaveTextContent('Issue 1 of 1');
    view.unmount();
    postMessage.mockClear();
    window.history.replaceState(null, '', '/?parentOrigin=*');
    render(<ScannerFindingRows {...props} findings={findings} />);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
