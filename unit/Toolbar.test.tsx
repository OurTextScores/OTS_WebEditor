import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from '../components/Toolbar';

describe('Toolbar', () => {
  it('uploads score files', async () => {
    const user = userEvent.setup();
    const onFileUpload = vi.fn();

    render(
      <Toolbar
        onFileUpload={onFileUpload}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
      />,
    );

    const file = new File([new Uint8Array([1, 2, 3])], 'score.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    expect(onFileUpload).toHaveBeenCalledTimes(1);
    expect(onFileUpload).toHaveBeenCalledWith(file);
  });

  it('ignores empty file inputs', () => {
    const onFileUpload = vi.fn();
    const onSoundFontUpload = vi.fn();

    render(
      <Toolbar
        onFileUpload={onFileUpload}
        onSoundFontUpload={onSoundFontUpload}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
      />,
    );

    fireEvent.change(screen.getByTestId('open-score-input'), { target: { files: [] } });
    fireEvent.change(screen.getByTestId('soundfont-input'), { target: { files: [] } });

    expect(onFileUpload).not.toHaveBeenCalled();
    expect(onSoundFontUpload).not.toHaveBeenCalled();
  });

  it('uploads soundfonts only when handler is provided', async () => {
    const user = userEvent.setup();

    const onSoundFontUpload = vi.fn();
    const onFileUpload = vi.fn();

    const { rerender } = render(
      <Toolbar
        onFileUpload={onFileUpload}
        onSoundFontUpload={onSoundFontUpload}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
      />,
    );

    const sf = new File([new Uint8Array([9, 9, 9])], 'default.sf3', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('soundfont-input'), sf);
    expect(onSoundFontUpload).toHaveBeenCalledWith(sf);

    onSoundFontUpload.mockClear();
    rerender(
      <Toolbar
        onFileUpload={onFileUpload}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
      />,
    );
    await user.upload(screen.getByTestId('soundfont-input'), sf);
    expect(onSoundFontUpload).not.toHaveBeenCalled();
  });

  it('wires time signatures, key signatures, and clefs', async () => {
    const user = userEvent.setup();
    const onSetTimeSignature = vi.fn();
    const onSetKeySignature = vi.fn();
    const onSetClef = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        onSetTimeSignature={onSetTimeSignature}
        onSetKeySignature={onSetKeySignature}
        onSetClef={onSetClef}
      />,
    );

    await user.click(screen.getByTestId('btn-timesig-3-4'));
    expect(onSetTimeSignature).toHaveBeenCalledWith(3, 4);

    await user.click(screen.getByTestId('btn-keysig-0'));
    await user.click(screen.getByTestId('btn-keysig--1'));
    expect(onSetKeySignature).toHaveBeenCalledWith(0);
    expect(onSetKeySignature).toHaveBeenCalledWith(-1);

    await user.click(screen.getByTestId('btn-clef-0'));
    await user.click(screen.getByTestId('btn-clef-20'));
    expect(onSetClef).toHaveBeenCalledWith(0);
    expect(onSetClef).toHaveBeenCalledWith(20);
  });

  it('wires transpose and accidentals', async () => {
    const user = userEvent.setup();
    const onTranspose = vi.fn();
    const onSetAccidental = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onTranspose={onTranspose}
        onSetAccidental={onSetAccidental}
      />,
    );

    await user.click(screen.getByTestId('btn-transpose--12'));
    await user.click(screen.getByTestId('btn-transpose-12'));
    expect(onTranspose).toHaveBeenCalledWith(-12);
    expect(onTranspose).toHaveBeenCalledWith(12);

    await user.click(screen.getByTestId('btn-acc-3'));
    expect(onSetAccidental).toHaveBeenCalledWith(3);
  });

  it('supports legacy time signature handlers', async () => {
    const user = userEvent.setup();
    const onSetTimeSignature44 = vi.fn();
    const onSetTimeSignature34 = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        onSetTimeSignature44={onSetTimeSignature44}
        onSetTimeSignature34={onSetTimeSignature34}
      />,
    );

    await user.click(screen.getByTestId('btn-timesig-4-4'));
    await user.click(screen.getByTestId('btn-timesig-3-4'));

    expect(onSetTimeSignature44).toHaveBeenCalledTimes(1);
    expect(onSetTimeSignature34).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId('btn-timesig-2-2')).toBeDisabled();
  });

  it('wires tempo markings', async () => {
    const user = userEvent.setup();
    const onAddTempoText = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        onAddTempoText={onAddTempoText}
      />,
    );

    await user.click(screen.getByTestId('btn-tempo-120'));
    expect(onAddTempoText).toHaveBeenCalledWith(120);
  });

  it('wires sticking text', async () => {
    const user = userEvent.setup();
    const onAddStickingText = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddStickingText={onAddStickingText}
      />,
    );

    await user.click(screen.getByTestId('btn-text-sticking'));
    expect(onAddStickingText).toHaveBeenCalledTimes(1);
  });

  it('wires guitar fingering text', async () => {
    const user = userEvent.setup();
    const onAddLeftHandGuitarFingeringText = vi.fn();
    const onAddRightHandGuitarFingeringText = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddLeftHandGuitarFingeringText={onAddLeftHandGuitarFingeringText}
        onAddRightHandGuitarFingeringText={onAddRightHandGuitarFingeringText}
      />,
    );

    await user.click(screen.getByTestId('btn-text-fingering-lh'));
    await user.click(screen.getByTestId('btn-text-fingering-rh'));
    expect(onAddLeftHandGuitarFingeringText).toHaveBeenCalledTimes(1);
    expect(onAddRightHandGuitarFingeringText).toHaveBeenCalledTimes(1);
  });

  it('shows busy labels for playback and audio export', () => {
    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        exportsEnabled
        audioAvailable
        onExportAudio={() => {}}
        onPlayAudio={() => {}}
        onStopAudio={() => {}}
        audioBusy
      />,
    );

    expect(screen.getByTestId('btn-play')).toHaveTextContent('Working…');
    expect(screen.getByTestId('btn-export-audio')).toHaveTextContent('Exporting…');
  });
});
