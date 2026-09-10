import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TranscodaPanel,
  type TranscodaPanelProps,
} from '../components/score-editor/ai-tools/TranscodaPanel';

const makeActions = () => ({
  transcribe: vi.fn(),
  applyOutput: vi.fn(),
  downloadXml: vi.fn(),
});

const props = (overrides: Partial<TranscodaPanelProps> = {}): TranscodaPanelProps => ({
  input: { imageFile: null, onImageUpload: vi.fn() },
  decoding: {
    mode: 'greedy',
    numBeams: 4,
    maxLength: 1024,
    repetitionPenalty: 1.1,
    setMode: vi.fn(),
    setNumBeams: vi.fn(),
    setMaxLength: vi.fn(),
    setRepetitionPenalty: vi.fn(),
  },
  status: { busy: false, phase: 'idle', elapsedMs: 0, error: null, warning: null },
  result: { generatedXml: '', generatedKern: '', payload: null },
  actions: makeActions(),
  service: { spaceId: 'jhlusko/transcoda', model: 'transcoda-base', revision: 'abc1234' },
  apply: { busy: false, canAppend: true },
  ...overrides,
});

const withResult = (overrides: Partial<TranscodaPanelProps> = {}) =>
  props({
    result: {
      generatedXml: '<score-partwise version="4.0"/>',
      generatedKern: '**kern',
      payload: { ok: true },
    },
    ...overrides,
  });

describe('TranscodaPanel', () => {
  it('shows the service identity that produced a result, read only', () => {
    render(<TranscodaPanel {...props()} />);

    expect(screen.getByLabelText('Transcoda Space ID')).toHaveValue('jhlusko/transcoda');
    expect(screen.getByLabelText('Transcoda model ID')).toHaveValue('transcoda-base');
    expect(screen.getByLabelText('Transcoda Space ID')).toHaveAttribute('readonly');
  });

  it('requires an image before transcribing', () => {
    const actions = makeActions();

    const { rerender } = render(<TranscodaPanel {...props({ actions })} />);
    expect(screen.getByTestId('btn-transcoda-transcribe')).toBeDisabled();

    rerender(
      <TranscodaPanel
        {...props({
          actions,
          input: {
            imageFile: new File(['x'], 'page.png', { type: 'image/png' }),
            onImageUpload: vi.fn(),
          },
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-transcoda-transcribe'));

    expect(actions.transcribe).toHaveBeenCalledTimes(1);
  });

  it('keeps overwrite and append distinct', () => {
    // One action, two meanings; the argument is the whole difference between
    // replacing the document and adding to it.
    const actions = makeActions();

    render(<TranscodaPanel {...withResult({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-transcoda-apply-overwrite'));
    fireEvent.click(screen.getByTestId('btn-transcoda-apply-append'));

    expect(actions.applyOutput).toHaveBeenNthCalledWith(1, 'overwrite');
    expect(actions.applyOutput).toHaveBeenNthCalledWith(2, 'append');
  });

  it('cannot append without a score to append to', () => {
    render(<TranscodaPanel {...withResult({ apply: { busy: false, canAppend: false } })} />);

    expect(screen.getByTestId('btn-transcoda-apply-append')).toBeDisabled();
    expect(screen.getByTestId('btn-transcoda-apply-overwrite')).toBeEnabled();
  });

  it('blocks both apply paths while the document is loading', () => {
    render(<TranscodaPanel {...withResult({ apply: { busy: true, canAppend: true } })} />);

    expect(screen.getByTestId('btn-transcoda-apply-overwrite')).toBeDisabled();
    expect(screen.getByTestId('btn-transcoda-apply-append')).toBeDisabled();
  });

  it('delegates the download instead of building the file itself', () => {
    const actions = makeActions();

    render(<TranscodaPanel {...withResult({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-transcoda-download-xml'));

    expect(actions.downloadXml).toHaveBeenCalledTimes(1);
  });

  it('reports elapsed time as mm:ss while a phase is running', () => {
    render(
      <TranscodaPanel
        {...props({
          status: {
            busy: true,
            phase: 'transcribing',
            elapsedMs: 95_000,
            error: null,
            warning: null,
          },
        })}
      />,
    );

    expect(screen.getByText(/1:35/)).toBeVisible();
  });

  it('surfaces errors and warnings separately', () => {
    render(
      <TranscodaPanel
        {...props({
          status: {
            busy: false,
            phase: 'idle',
            elapsedMs: 0,
            error: 'transcoda: space unavailable',
            warning: 'low confidence on system 3',
          },
        })}
      />,
    );

    expect(screen.getByText('transcoda: space unavailable')).toBeVisible();
    expect(screen.getByText('low confidence on system 3')).toBeVisible();
  });
});
