import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  NotaGenPanel,
  type NotaGenPanelProps,
} from '../components/score-editor/ai-tools/NotaGenPanel';

vi.mock('../components/CodeMirrorEditor', () => ({
  CodeMirrorEditor: ({ value }: { value: string }) => <textarea readOnly value={value} />,
}));

const makeSpace = () => ({
  period: 'Romantic',
  composer: 'Chopin',
  instrumentation: 'Keyboard',
  periods: ['Baroque', 'Classical', 'Romantic'],
  composers: ['Chopin', 'Liszt'],
  instrumentations: ['Keyboard', 'Chamber'],
  optionsError: null as string | null,
  setPeriod: vi.fn(),
  setComposer: vi.fn(),
  setInstrumentation: vi.fn(),
});

const props = (overrides: Partial<NotaGenPanelProps> = {}): NotaGenPanelProps => ({
  space: makeSpace(),
  status: { busy: false, statusText: '', error: null, progressLog: '' },
  result: { generatedAbc: '', generatedXml: '', payload: null, setGeneratedXml: vi.fn() },
  actions: { run: vi.fn(), applyOutput: vi.fn() },
  progressRef: createRef<HTMLPreElement>(),
  editorTheme: 'light',
  ...overrides,
});

const selects = () => screen.getAllByRole('combobox');

describe('NotaGenPanel', () => {
  it('offers the option lists the owner supplies, in order', () => {
    render(<NotaGenPanel {...props()} />);
    const [period, composer, instrumentation] = selects();

    expect(period).toHaveValue('Romantic');
    expect(composer).toHaveValue('Chopin');
    expect(instrumentation).toHaveValue('Keyboard');
  });

  it('routes each selector to its own setter', () => {
    // Three same-shaped selects in a row: crossing two of them is the mistake a
    // moved block makes, and nothing else would catch it.
    const space = makeSpace();

    render(<NotaGenPanel {...props({ space })} />);
    const [period, composer, instrumentation] = selects();
    fireEvent.change(period, { target: { value: 'Baroque' } });
    fireEvent.change(composer, { target: { value: 'Liszt' } });
    fireEvent.change(instrumentation, { target: { value: 'Chamber' } });

    expect(space.setPeriod).toHaveBeenCalledWith('Baroque');
    expect(space.setComposer).toHaveBeenCalledWith('Liszt');
    expect(space.setInstrumentation).toHaveBeenCalledWith('Chamber');
  });

  it('falls back to the current value when an option list has not loaded', () => {
    render(
      <NotaGenPanel
        {...props({
          space: { ...makeSpace(), periods: [], composers: [] },
        })}
      />,
    );
    const [period] = selects();

    expect(period).toHaveValue('Romantic');
  });

  it('runs and applies through the owner', () => {
    const actions = { run: vi.fn(), applyOutput: vi.fn() };

    render(
      <NotaGenPanel
        {...props({
          actions,
          result: {
            generatedAbc: 'X:1',
            generatedXml: '<score-partwise/>',
            payload: null,
            setGeneratedXml: vi.fn(),
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run NotaGen Space' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Output' }));

    expect(actions.run).toHaveBeenCalledTimes(1);
    expect(actions.applyOutput).toHaveBeenCalledTimes(1);
  });

  it('will not apply an empty generation', () => {
    render(<NotaGenPanel {...props()} />);

    expect(screen.getByRole('button', { name: 'Apply Output' })).toBeDisabled();
  });

  it('shows working state while a generation runs', () => {
    render(
      <NotaGenPanel
        {...props({
          status: { busy: true, statusText: 'queued', error: null, progressLog: '' },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled();
    expect(screen.getByText('queued')).toBeVisible();
  });

  it('shows the progress area only once there is something to report', () => {
    // Neither a status line nor a log: the whole block stays out of the DOM rather
    // than showing an empty console.
    const { rerender } = render(<NotaGenPanel {...props()} />);
    expect(screen.queryByText('Waiting for generation output...')).toBeNull();

    // A status with no output yet gets the placeholder...
    rerender(
      <NotaGenPanel
        {...props({
          status: { busy: true, statusText: 'queued', error: null, progressLog: '' },
        })}
      />,
    );
    expect(screen.getByText('Waiting for generation output...')).toBeVisible();

    // ...and the streamed log replaces it.
    rerender(
      <NotaGenPanel
        {...props({
          status: { busy: true, statusText: 'queued', error: null, progressLog: 'bar 1 generated' },
        })}
      />,
    );
    expect(screen.getByText('bar 1 generated')).toBeVisible();
    expect(screen.queryByText('Waiting for generation output...')).toBeNull();
  });

  it('separates a failed generation from a failed option load', () => {
    render(
      <NotaGenPanel
        {...props({
          space: { ...makeSpace(), optionsError: 'space options unavailable' },
          status: { busy: false, statusText: '', error: 'notagen: run failed', progressLog: '' },
        })}
      />,
    );

    expect(screen.getByText('space options unavailable')).toBeVisible();
    expect(screen.getByText('notagen: run failed')).toBeVisible();
  });
});
