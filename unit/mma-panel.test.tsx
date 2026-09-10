import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MmaPanel, type MmaPanelProps } from '../components/score-editor/ai-tools/MmaPanel';

// The panel embeds CodeMirror for the script and the generated MusicXML. Its editing
// behavior has its own suite (unit/code-mirror-editor.test.tsx); here it is noise.
vi.mock('../components/CodeMirrorEditor', () => ({
  CodeMirrorEditor: ({ value }: { value: string }) => <textarea readOnly value={value} />,
}));

const makeActions = () => ({
  generateTemplate: vi.fn(),
  chordifyAndGenerate: vi.fn(),
  render: vi.fn(),
  download: vi.fn(),
  applyOutput: vi.fn(),
  openChordify: vi.fn(),
});

const makeConfig = () => ({
  starterPreset: 'lead-sheet' as const,
  arrangementPreset: 'default' as MmaPanelProps['config']['arrangementPreset'],
  groove: 'Swing',
  script: 'Groove Swing\n1 C',
  setStarterPreset: vi.fn(),
  setArrangementPreset: vi.fn(),
  setGroove: vi.fn(),
  setScript: vi.fn(),
  editorTheme: 'light' as const,
});

const props = (overrides: Partial<MmaPanelProps> = {}): MmaPanelProps => ({
  config: makeConfig(),
  status: { busy: false, harmonyBusy: false, error: null },
  result: {
    generatedXml: '',
    midiBase64: '',
    warnings: [],
    sanitizedStderr: '',
    payload: null,
    setGeneratedXml: vi.fn(),
  },
  actions: makeActions(),
  ...overrides,
});

describe('MmaPanel', () => {
  it('reports the configured starter, arrangement and groove', () => {
    render(<MmaPanel {...props()} />);

    expect(screen.getByTestId('select-mma-starter')).toHaveValue('lead-sheet');
    expect(screen.getByTestId('select-mma-groove')).toHaveValue('Swing');
  });

  it('routes control changes to the owner', () => {
    const config = makeConfig();

    render(<MmaPanel {...props({ config })} />);
    fireEvent.change(screen.getByTestId('select-mma-starter'), { target: { value: 'blues' } });
    fireEvent.change(screen.getByTestId('select-mma-groove'), { target: { value: 'BossaNova' } });

    expect(config.setStarterPreset).toHaveBeenCalledWith('blues');
    expect(config.setGroove).toHaveBeenCalledWith('BossaNova');
  });

  it('distinguishes the two render buttons by their MusicXML flag', () => {
    // Both buttons call the same action; only the argument separates "render MIDI"
    // from "render MIDI and MusicXML", which is exactly where a moved call goes wrong.
    const actions = makeActions();

    render(<MmaPanel {...props({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-mma-render-midi'));
    fireEvent.click(screen.getByTestId('btn-mma-render-xml'));

    expect(actions.render).toHaveBeenNthCalledWith(1, false);
    expect(actions.render).toHaveBeenNthCalledWith(2, true);
  });

  it('passes each download its own format', () => {
    const actions = makeActions();

    render(
      <MmaPanel
        {...props({
          actions,
          result: {
            generatedXml: '<score-partwise/>',
            midiBase64: 'TVRoZA==',
            warnings: [],
            sanitizedStderr: '',
            payload: null,
            setGeneratedXml: vi.fn(),
          },
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-mma-download-script'));
    fireEvent.click(screen.getByTestId('btn-mma-download-midi'));
    fireEvent.click(screen.getByTestId('btn-mma-download-xml'));

    expect(actions.download.mock.calls.map(([format]) => format)).toEqual([
      'mma',
      'midi',
      'musicxml',
    ]);
  });

  it('separates generating a template from chordify-and-generate', () => {
    const actions = makeActions();

    render(<MmaPanel {...props({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-mma-generate-template'));
    fireEvent.click(screen.getByTestId('btn-mma-analyze-harmony-template'));

    expect(actions.generateTemplate).toHaveBeenCalledTimes(1);
    expect(actions.chordifyAndGenerate).toHaveBeenCalledTimes(1);

    // Opening the Chordify tab only switches tabs; it must not start an analysis.
    fireEvent.click(screen.getByRole('button', { name: 'Open Chordify' }));
    expect(actions.openChordify).toHaveBeenCalledTimes(1);
    expect(actions.chordifyAndGenerate).toHaveBeenCalledTimes(1);
  });

  it('disables the generating controls while either service is busy', () => {
    const { rerender } = render(
      <MmaPanel
        {...props({
          status: { busy: true, harmonyBusy: false, error: null },
        })}
      />,
    );
    expect(screen.getByTestId('btn-mma-generate-template')).toBeDisabled();
    expect(screen.getByTestId('btn-mma-analyze-harmony-template')).toBeDisabled();

    // Harmony busy must block the combined action but not the MMA-only one.
    rerender(
      <MmaPanel
        {...props({
          status: { busy: false, harmonyBusy: true, error: null },
        })}
      />,
    );
    expect(screen.getByTestId('btn-mma-generate-template')).toBeEnabled();
    expect(screen.getByTestId('btn-mma-analyze-harmony-template')).toBeDisabled();
  });

  it('surfaces an MMA error', () => {
    render(
      <MmaPanel
        {...props({
          status: { busy: false, harmonyBusy: false, error: 'mma: unknown groove' },
        })}
      />,
    );

    expect(screen.getByText('mma: unknown groove')).toBeVisible();
  });
});
