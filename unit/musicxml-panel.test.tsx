import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MusicXmlPanel,
  CODE_EDITOR_THEME_OPTIONS,
  type MusicXmlPanelProps,
} from '../components/score-editor/MusicXmlPanel';

vi.mock('../components/CodeMirrorEditor', () => ({
  CodeMirrorEditor: ({
    value,
    onChange,
    readOnly,
    placeholderText,
  }: {
    value: string;
    onChange: (next: string) => void;
    readOnly: boolean;
    placeholderText: string;
  }) => (
    <textarea
      data-testid="musicxml-editor"
      value={value}
      readOnly={readOnly}
      placeholder={placeholderText}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const props = (overrides: Partial<MusicXmlPanelProps> = {}): MusicXmlPanelProps => ({
  text: '<score-partwise/>',
  setText: vi.fn(),
  setDirty: vi.fn(),
  scoreLoaded: true,
  layout: { editorHeight: '45vh', editorMaxHeight: '55vh' },
  permissions: {
    applyEnabled: true,
    applyDisabled: false,
    reloadEnabled: true,
    controlsDisabled: false,
  },
  theme: { mode: 'light', setMode: vi.fn() },
  actions: { apply: vi.fn(), refresh: vi.fn(), close: vi.fn() },
  ...overrides,
});

describe('MusicXmlPanel', () => {
  it('offers every editor theme, including the high-contrast pair', () => {
    // The accessible themes are easy to drop when this list is retyped by hand;
    // ScoreEditor validates stored values against this same constant.
    expect(CODE_EDITOR_THEME_OPTIONS.map((option) => option.value)).toEqual([
      'light',
      'light-contrast',
      'dark',
      'dark-contrast',
    ]);

    render(<MusicXmlPanel {...props()} />);
    expect(screen.getByTestId('select-musicxml-theme').querySelectorAll('option')).toHaveLength(4);
  });

  it('changes theme through the owner', () => {
    const theme = { mode: 'light' as const, setMode: vi.fn() };

    render(<MusicXmlPanel {...props({ theme })} />);
    fireEvent.change(screen.getByTestId('select-musicxml-theme'), {
      target: { value: 'dark-contrast' },
    });

    expect(theme.setMode).toHaveBeenCalledWith('dark-contrast');
  });

  it('marks the document dirty when the source is edited', () => {
    const setText = vi.fn();
    const setDirty = vi.fn();

    render(<MusicXmlPanel {...props({ setText, setDirty })} />);
    fireEvent.change(screen.getByTestId('musicxml-editor'), {
      target: { value: '<score-partwise version="4.0"/>' },
    });

    expect(setText).toHaveBeenCalledWith('<score-partwise version="4.0"/>');
    expect(setDirty).toHaveBeenCalledWith(true);
  });

  it('applies and reloads through their own actions', () => {
    const actions = { apply: vi.fn(), refresh: vi.fn(), close: vi.fn() };

    render(<MusicXmlPanel {...props({ actions })} />);
    fireEvent.click(screen.getByTestId('btn-xml-apply'));
    fireEvent.click(screen.getByTestId('btn-xml-reload'));

    expect(actions.apply).toHaveBeenCalledTimes(1);
    expect(actions.refresh).toHaveBeenCalledTimes(1);
  });

  it('refuses to apply when the owner says it is not allowed', () => {
    render(
      <MusicXmlPanel
        {...props({
          permissions: {
            applyEnabled: true,
            applyDisabled: true,
            reloadEnabled: true,
            controlsDisabled: false,
          },
        })}
      />,
    );

    expect(screen.getByTestId('btn-xml-apply')).toBeDisabled();
  });

  it('makes the source read-only while the controls are locked', () => {
    render(
      <MusicXmlPanel
        {...props({
          permissions: {
            applyEnabled: true,
            applyDisabled: false,
            reloadEnabled: true,
            controlsDisabled: true,
          },
        })}
      />,
    );

    expect(screen.getByTestId('musicxml-editor')).toHaveAttribute('readonly');
  });

  it('prompts to load a score when there is none', () => {
    const { rerender } = render(<MusicXmlPanel {...props({ scoreLoaded: false, text: '' })} />);
    expect(screen.getByPlaceholderText('Load a score to view MusicXML.')).toBeVisible();

    rerender(<MusicXmlPanel {...props({ scoreLoaded: true, text: '' })} />);
    expect(screen.getByPlaceholderText('MusicXML will appear here.')).toBeVisible();
  });
});
