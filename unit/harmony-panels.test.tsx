import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HarmonyPanel,
  type HarmonyPanelProps,
} from '../components/score-editor/ai-tools/HarmonyPanel';
import {
  FunctionalHarmonyPanel,
  type FunctionalHarmonyPanelProps,
} from '../components/score-editor/ai-tools/FunctionalHarmonyPanel';

vi.mock('../components/CodeMirrorEditor', () => ({
  CodeMirrorEditor: ({ value }: { value: string }) => <textarea readOnly value={value} />,
}));

const harmonyActions = () => ({
  analyze: vi.fn(),
  analyzeAndApply: vi.fn(),
  analyzeAndGenerateMma: vi.fn(),
  applyOutput: vi.fn(),
  downloadXml: vi.fn(),
});

const harmonyProps = (overrides: Partial<HarmonyPanelProps> = {}): HarmonyPanelProps => ({
  config: {
    rhythmMode: 'auto',
    maxChangesPerMeasure: 2,
    setRhythmMode: vi.fn(),
    setMaxChangesPerMeasure: vi.fn(),
  },
  status: { busy: false, mmaBusy: false, error: null },
  result: { generatedXml: '', warnings: [], payload: null, setGeneratedXml: vi.fn() },
  actions: harmonyActions(),
  editorTheme: 'light',
  ...overrides,
});

describe('HarmonyPanel', () => {
  it('keeps the three analyses distinct', () => {
    // They differ only in what the owner does afterwards -- apply immediately, or
    // chain an MMA template. Collapsing them would silently change behavior.
    const actions = harmonyActions();

    render(<HarmonyPanel {...harmonyProps({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-harmony-analyze'));
    fireEvent.click(screen.getByTestId('btn-harmony-analyze-apply'));
    fireEvent.click(screen.getByTestId('btn-harmony-analyze-mma'));

    expect(actions.analyze).toHaveBeenCalledTimes(1);
    expect(actions.analyzeAndApply).toHaveBeenCalledTimes(1);
    expect(actions.analyzeAndGenerateMma).toHaveBeenCalledTimes(1);
  });

  it('routes settings changes to the owner', () => {
    const config = harmonyProps().config;

    render(<HarmonyPanel {...harmonyProps({ config })} />);
    fireEvent.change(screen.getByTestId('select-harmony-rhythm'), { target: { value: 'beat' } });

    expect(config.setRhythmMode).toHaveBeenCalledWith('beat');
  });

  it('waits for MMA only on the combined action', () => {
    render(
      <HarmonyPanel
        {...harmonyProps({
          status: { busy: false, mmaBusy: true, error: null },
        })}
      />,
    );

    expect(screen.getByTestId('btn-harmony-analyze')).toBeEnabled();
    expect(screen.getByTestId('btn-harmony-analyze-mma')).toBeDisabled();
  });

  it('blocks every analysis while harmony itself is busy', () => {
    render(
      <HarmonyPanel
        {...harmonyProps({
          status: { busy: true, mmaBusy: false, error: null },
        })}
      />,
    );

    expect(screen.getByTestId('btn-harmony-analyze')).toBeDisabled();
    expect(screen.getByTestId('btn-harmony-analyze-apply')).toBeDisabled();
    expect(screen.getByTestId('btn-harmony-analyze-mma')).toBeDisabled();
  });

  it('surfaces an analysis error', () => {
    render(
      <HarmonyPanel
        {...harmonyProps({
          status: { busy: false, mmaBusy: false, error: 'chordify: no pitched notes' },
        })}
      />,
    );

    expect(screen.getByText('chordify: no pitched notes')).toBeVisible();
  });
});

const functionalActions = () => ({
  analyze: vi.fn(),
  applyOutput: vi.fn(),
  download: vi.fn(),
  downloadXml: vi.fn(),
});

const functionalProps = (
  overrides: Partial<FunctionalHarmonyPanelProps> = {},
): FunctionalHarmonyPanelProps => ({
  status: { busy: false, error: null },
  result: {
    payload: { ok: true },
    segments: [{ romanNumeral: 'V7', measure: 3 }],
    warnings: [],
    annotatedXml: '<score-partwise/>',
    jsonExport: '{"segments":[]}',
    rntxtExport: 'm1 C: I',
    setAnnotatedXml: vi.fn(),
    setRntxtExport: vi.fn(),
  },
  actions: functionalActions(),
  editorTheme: 'light',
  ...overrides,
});

describe('FunctionalHarmonyPanel', () => {
  it('gives each export its own format', () => {
    const actions = functionalActions();

    render(<FunctionalHarmonyPanel {...functionalProps({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-functional-harmony-download-json'));
    fireEvent.click(screen.getByTestId('btn-functional-harmony-download-rntxt'));

    expect(actions.download).toHaveBeenNthCalledWith(1, 'json');
    expect(actions.download).toHaveBeenNthCalledWith(2, 'rntxt');
  });

  it('keeps the annotated-MusicXML download separate from the data exports', () => {
    const actions = functionalActions();

    render(<FunctionalHarmonyPanel {...functionalProps({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-functional-harmony-download-xml'));

    expect(actions.downloadXml).toHaveBeenCalledTimes(1);
    expect(actions.download).not.toHaveBeenCalled();
  });

  it('applies the annotated score through the owner', () => {
    const actions = functionalActions();

    render(<FunctionalHarmonyPanel {...functionalProps({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-functional-harmony-apply-xml'));

    expect(actions.applyOutput).toHaveBeenCalledTimes(1);
  });

  it('blocks analysis while one is running', () => {
    render(
      <FunctionalHarmonyPanel
        {...functionalProps({
          status: { busy: true, error: null },
        })}
      />,
    );

    expect(screen.getByTestId('btn-functional-harmony-analyze')).toBeDisabled();
  });

  it('surfaces an analysis error', () => {
    render(
      <FunctionalHarmonyPanel
        {...functionalProps({
          status: { busy: false, error: 'music21: unsupported key' },
        })}
      />,
    );

    expect(screen.getByText('music21: unsupported key')).toBeVisible();
  });
});
