import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Toolbar } from '../components/Toolbar';

describe('Toolbar', () => {
  it('shows Load Score button label', () => {
    render(
      <Toolbar onFileUpload={() => {}} onZoomIn={() => {}} onZoomOut={() => {}} zoomLevel={1} />,
    );

    expect(screen.getByText('Load Score')).toBeInTheDocument();
  });

  it('opens the score comparison loader', async () => {
    const user = userEvent.setup();
    const onLoadScoresToCompare = vi.fn();
    render(
      <Toolbar
        onFileUpload={() => {}}
        onLoadScoresToCompare={onLoadScoresToCompare}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Load scores to compare' }));
    expect(onLoadScoresToCompare).toHaveBeenCalledOnce();
  });

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

    const file = new File([new Uint8Array([1, 2, 3])], 'score.mscz', {
      type: 'application/octet-stream',
    });
    await user.upload(screen.getByTestId('open-score-input'), file);

    expect(onFileUpload).toHaveBeenCalledTimes(1);
    expect(onFileUpload).toHaveBeenCalledWith(file);
  });

  it('wires the Google Drive export and share-link actions', async () => {
    const user = userEvent.setup();
    const onExportToGoogleDrive = vi.fn();
    const onCreateShareableLink = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        exportsEnabled
        onExportToGoogleDrive={onExportToGoogleDrive}
        onCreateShareableLink={onCreateShareableLink}
      />,
    );

    await user.click(screen.getByTestId('btn-export-google-drive'));
    await user.click(screen.getByTestId('btn-create-share-link'));

    expect(onExportToGoogleDrive).toHaveBeenCalledTimes(1);
    expect(onCreateShareableLink).toHaveBeenCalledTimes(1);
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

    const sf = new File([new Uint8Array([9, 9, 9])], 'default.sf3', {
      type: 'application/octet-stream',
    });
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

    fireEvent.pointerDown(screen.getByTestId('dropdown-signature'));
    fireEvent.click(screen.getByTestId('btn-timesig-4-4'));
    expect(onSetTimeSignature).toHaveBeenCalledWith(4, 4, 1);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Key' }));
    fireEvent.click(screen.getByTestId('btn-keysig-0'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Key' }));
    fireEvent.click(screen.getByTestId('btn-keysig--1'));
    expect(onSetKeySignature).toHaveBeenCalledWith(0);
    expect(onSetKeySignature).toHaveBeenCalledWith(-1);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Clef' }));
    expect(screen.getByTestId('clef-symbol-0')).toHaveTextContent('\uE050');
    expect(screen.getByTestId('btn-clef-0')).toHaveTextContent('Treble');
    for (const value of [10, 11]) {
      expect(screen.getByTestId(`clef-symbol-${value}`)).toHaveTextContent('\uE05C');
    }
    // "Other" clefs now live behind the full clef palette rather than in the dropdown.
    expect(screen.getByTestId('btn-open-clef-palette')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-clef-0'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Clef' }));
    fireEvent.click(screen.getByTestId('btn-clef-20'));
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

    await user.click(screen.getByRole('button', { name: 'Accidental' }));
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

    await user.click(screen.getByTestId('dropdown-signature'));
    await user.click(screen.getByTestId('btn-timesig-4-4'));
    await user.click(screen.getByTestId('dropdown-signature'));
    await user.click(screen.getByTestId('btn-timesig-2-2'));

    expect(onSetTimeSignature44).toHaveBeenCalledTimes(1);
    expect(onSetTimeSignature34).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('dropdown-signature'));
    expect(screen.getByTestId('btn-timesig-2-2')).toBeEnabled();
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

    const tempoInput = screen.getByTestId('input-tempo-bpm');
    await user.clear(tempoInput);
    await user.type(tempoInput, '144');
    await user.click(screen.getByTestId('btn-tempo-apply'));
    expect(onAddTempoText).toHaveBeenCalledWith(144);
  });

  it('wires duration buttons', async () => {
    const user = userEvent.setup();
    const onSetDurationType = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onSetDurationType={onSetDurationType}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rhythm' }));
    await user.click(screen.getByTestId('btn-duration-32'));
    await user.click(screen.getByRole('button', { name: 'Rhythm' }));
    await user.click(screen.getByTestId('btn-duration-16'));
    await user.click(screen.getByRole('button', { name: 'Rhythm' }));
    await user.click(screen.getByTestId('btn-duration-8'));
    await user.click(screen.getByRole('button', { name: 'Rhythm' }));
    await user.click(screen.getByTestId('btn-duration-4'));
    await user.click(screen.getByRole('button', { name: 'Rhythm' }));
    await user.click(screen.getByTestId('btn-duration-2'));
    await user.click(screen.getByRole('button', { name: 'Rhythm' }));
    await user.click(screen.getByTestId('btn-duration-1'));

    expect(onSetDurationType).toHaveBeenCalledWith(7);
    expect(onSetDurationType).toHaveBeenCalledWith(6);
    expect(onSetDurationType).toHaveBeenCalledWith(5);
    expect(onSetDurationType).toHaveBeenCalledWith(4);
    expect(onSetDurationType).toHaveBeenCalledWith(3);
    expect(onSetDurationType).toHaveBeenCalledWith(2);
    // Ten sequential userEvent clicks flake past the default 5s under full-suite load.
  }, 20_000);

  it('wires hairpin controls', async () => {
    const user = userEvent.setup();
    const onAddHairpin = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddHairpin={onAddHairpin}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Hairpins' }));
    expect(screen.getByTestId('btn-hairpin-cresc')).toHaveTextContent(/^\uE53E$/);
    expect(screen.getByTestId('btn-hairpin-cresc').firstElementChild?.className).toContain(
      'hairpinSymbol',
    );
    await user.click(screen.getByTestId('btn-hairpin-cresc'));
    await user.click(screen.getByRole('button', { name: 'Hairpins' }));
    expect(screen.getByTestId('btn-hairpin-decresc')).toHaveTextContent(/^\uE53F$/);
    await user.click(screen.getByTestId('btn-hairpin-decresc'));

    expect(onAddHairpin).toHaveBeenCalledWith(0);
    expect(onAddHairpin).toHaveBeenCalledWith(1);
  });

  it('renders a scrollable dynamics menu with notation-font symbols', async () => {
    const user = userEvent.setup();
    const onAddDynamic = vi.fn();
    const setData = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        paletteDropEnabled
        selectionActive
        onAddDynamic={onAddDynamic}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Dynamics' }));
    expect(screen.getByTestId('markings-menu').className).toContain('markingsMenu');
    expect(screen.getByText('Common')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-dynamics-palette')).toBeInTheDocument();
    const pianoSymbol = screen.getByTestId('dynamic-symbol-6');
    expect(pianoSymbol).toHaveTextContent('\uE520');
    expect(screen.getByTestId('btn-dynamic-6')).toHaveTextContent(/^\uE520$/);
    expect(screen.getByTestId('btn-dynamic-18')).toHaveTextContent(/^\uE524\uE522\uE525$/);
    fireEvent.dragStart(screen.getByTestId('btn-dynamic-18'), {
      dataTransfer: { effectAllowed: 'none', setData },
    });
    expect(setData).toHaveBeenCalledWith(
      'application/x-ots-score-palette+json',
      expect.stringContaining('"subtype":18'),
    );

    await user.click(screen.getByTestId('btn-dynamic-18'));
    expect(onAddDynamic).toHaveBeenCalledWith(18);
  });

  it('renders articulation symbols with labels in the Leland font', async () => {
    const user = userEvent.setup();
    const onAddArticulation = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        paletteDropEnabled
        selectionActive
        onAddArticulation={onAddArticulation}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Articulations' }));
    expect(screen.getByTestId('artic-symbol-articStaccatoAbove')).toHaveTextContent('\uE4A2');
    expect(screen.getByTestId('btn-artic-articStaccatoAbove')).toHaveTextContent('Staccato');
    await user.click(screen.getByTestId('btn-artic-articStaccatoAbove'));
    expect(onAddArticulation).toHaveBeenCalledWith('articStaccatoAbove');
  });

  it('groups and wires fermatas, breaths, and caesuras in the articulations menu', async () => {
    const user = userEvent.setup();
    const onAddFermata = vi.fn();
    const onAddBreath = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddFermata={onAddFermata}
        onAddBreath={onAddBreath}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Articulations' }));
    expect(screen.getByTestId('articulations-menu').className).toContain('markingsMenu');
    expect(screen.getByText('Fermatas')).toBeInTheDocument();
    expect(screen.getByText('Breaths & Caesuras')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-fermata-palette')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-breath-palette')).toBeInTheDocument();
    expect(screen.getByTestId('fermata-symbol-0')).toHaveTextContent('\uE4C0');
    expect(screen.getByTestId('breath-symbol-5')).toHaveTextContent('\uE4D1');
    await user.click(screen.getByTestId('btn-fermata-2'));
    expect(onAddFermata).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: 'Articulations' }));
    await user.click(screen.getByTestId('btn-breath-5'));
    expect(onAddBreath).toHaveBeenCalledWith(5);
  });

  it('renders grace-note symbols with labels in the Leland font', async () => {
    const user = userEvent.setup();
    const onAddGraceNote = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddGraceNote={onAddGraceNote}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Grace Notes' }));
    expect(screen.getByTestId('grace-symbol-1')).toHaveTextContent('\uE560');
    expect(screen.getByTestId('btn-grace-acciaccatura')).toHaveTextContent('Acciaccatura');
    expect(screen.getByTestId('grace-symbol-16')).toHaveTextContent('\uE1DB');
    await user.click(screen.getByTestId('btn-grace-acciaccatura'));
    expect(onAddGraceNote).toHaveBeenCalledWith(1);
  });

  it('renders and wires ottava, trill, and glissando line options', async () => {
    const user = userEvent.setup();
    const onAddOttava = vi.fn();
    const onAddTrill = vi.fn();
    const onAddGlissando = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddOttava={onAddOttava}
        onAddTrill={onAddTrill}
        onAddGlissando={onAddGlissando}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Lines' }));
    expect(screen.getByTestId('ottava-symbol-0')).toHaveTextContent('\uE511');
    expect(screen.getByTestId('btn-ottava-0')).toHaveTextContent('8va');
    expect(screen.getByTestId('trill-symbol-0')).toHaveTextContent('\uE566\uEAA4');
    expect(screen.getByTestId('glissando-symbol-1')).toHaveTextContent('\uEAAF');
    await user.click(screen.getByTestId('btn-ottava-3'));
    expect(onAddOttava).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole('button', { name: 'Lines' }));
    await user.click(screen.getByTestId('btn-trill-2'));
    expect(onAddTrill).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: 'Lines' }));
    await user.click(screen.getByTestId('btn-glissando-1'));
    expect(onAddGlissando).toHaveBeenCalledWith(1);
  });

  it('renders and wires arpeggio and tremolo chord options', async () => {
    const user = userEvent.setup();
    const onAddArpeggio = vi.fn();
    const onAddTremolo = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddArpeggio={onAddArpeggio}
        onAddTremolo={onAddTremolo}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Chord' }));
    expect(screen.getByText('Arpeggios')).toBeInTheDocument();
    expect(screen.getByText('Tremolos')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-tremolo-palette')).toBeInTheDocument();
    expect(screen.getByTestId('arpeggio-symbol-1')).toHaveTextContent('\uE634');
    expect(screen.getByTestId('tremolo-symbol-2')).toHaveTextContent('\uE222');
    await user.click(screen.getByTestId('btn-arpeggio-3'));
    expect(onAddArpeggio).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole('button', { name: 'Chord' }));
    await user.click(screen.getByTestId('btn-tremolo-2'));
    expect(onAddTremolo).toHaveBeenCalledWith(2);
  });

  it('renders and wires semantic markers and jumps', async () => {
    const user = userEvent.setup();
    const onAddMarker = vi.fn();
    const onAddJump = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddMarker={onAddMarker}
        onAddJump={onAddJump}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Navigation' }));
    expect(screen.getByTestId('navigation-menu').className).toContain('navigationMenu');
    expect(screen.getByText('Markers')).toBeInTheDocument();
    expect(screen.getByText('Jumps')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-markers-palette')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-jumps-palette')).toBeInTheDocument();
    expect(screen.getByTestId('marker-symbol-0')).toHaveTextContent('\uE047');
    await user.click(screen.getByTestId('btn-marker-2'));
    expect(onAddMarker).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: 'Navigation' }));
    await user.click(screen.getByTestId('btn-jump-2'));
    expect(onAddJump).toHaveBeenCalledWith(2);
  });

  it('renders and wires Batch 4 notation and filter controls', async () => {
    const user = userEvent.setup();
    const onSetBeamMode = vi.fn();
    const onOpenPalette = vi.fn();
    const onSetSelectionFilterBit = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        selectionFilterMask={0xffffff}
        onOpenPalette={onOpenPalette}
        onSetBeamMode={onSetBeamMode}
        onSetSelectionFilterBit={onSetSelectionFilterBit}
      />,
    );

    // Noteheads now live only in the floating palette (no toolbar button).

    await user.click(screen.getByTestId('dropdown-beams'));
    await user.click(screen.getByTestId('btn-beam-3'));
    expect(onSetBeamMode).toHaveBeenCalledWith(3);

    await user.click(screen.getByTestId('dropdown-selection-filter'));
    await user.click(screen.getByTestId(`selection-filter-${1 << 23}`));
    expect(onSetSelectionFilterBit).toHaveBeenCalledWith(1 << 23, false);
  });

  it('lists the slur keyboard shortcut', async () => {
    const user = userEvent.setup();

    render(
      <Toolbar onFileUpload={() => {}} onZoomIn={() => {}} onZoomOut={() => {}} zoomLevel={1} />,
    );

    await user.click(screen.getByRole('button', { name: 'Shortcuts' }));
    expect(screen.getByText('Slur: S')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Text' }));
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

    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByTestId('btn-text-fingering-lh'));
    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByTestId('btn-text-fingering-rh'));
    expect(onAddLeftHandGuitarFingeringText).toHaveBeenCalledTimes(1);
    expect(onAddRightHandGuitarFingeringText).toHaveBeenCalledTimes(1);
  });

  it('wires string number text', async () => {
    const user = userEvent.setup();
    const onAddStringNumberText = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddStringNumberText={onAddStringNumberText}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByTestId('btn-text-string-number'));
    expect(onAddStringNumberText).toHaveBeenCalledTimes(1);
  });

  it('wires figured bass text', async () => {
    const user = userEvent.setup();
    const onAddFiguredBassText = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onAddFiguredBassText={onAddFiguredBassText}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByTestId('btn-text-figured-bass'));
    expect(onAddFiguredBassText).toHaveBeenCalledTimes(1);
  });

  it('opens the header text editor from the Text dropdown', async () => {
    const user = userEvent.setup();
    const onOpenHeaderEditor = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        onOpenHeaderEditor={onOpenHeaderEditor}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByTestId('btn-text-title'));
    expect(onOpenHeaderEditor).toHaveBeenCalledWith('title', expect.any(Object));
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
        onTogglePlayPause={() => {}}
        audioBusy
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export' }));
    // The transport control is disabled while audio work is in flight; it keeps its
    // Play label rather than gaining a busy label of its own.
    expect(screen.getByTestId('btn-play')).toBeDisabled();
    expect(screen.getByTestId('btn-export-audio')).toHaveTextContent('Exporting…');
  });

  // Regression: playTransportAudio holds audioBusy for the whole of a streamed
  // playback, because it awaits a render loop that runs until the score is
  // exhausted. Gating the transport control on audioBusy alone made Pause
  // unclickable for exactly as long as there was something to pause.
  it('keeps the transport control live while playing, even when audioBusy', () => {
    const onTogglePlayPause = vi.fn();
    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        audioAvailable
        onTogglePlayPause={onTogglePlayPause}
        isPlaying
        audioBusy
      />,
    );

    const transport = screen.getByTestId('btn-play');
    expect(transport).toHaveTextContent('Pause');
    expect(transport).toBeEnabled();

    fireEvent.click(transport);
    expect(onTogglePlayPause).toHaveBeenCalledTimes(1);
  });

  it('offers Resume while paused, and Stop only while the transport is active', () => {
    const { rerender } = render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        audioAvailable
        onTogglePlayPause={() => {}}
        onStopAudio={() => {}}
      />,
    );

    // Idle: Play offered, nothing to stop.
    expect(screen.getByTestId('btn-play')).toHaveTextContent('Play');
    expect(screen.getByTestId('btn-stop')).toBeDisabled();

    // Paused: the stream is alive, so both resuming and rewinding are available.
    rerender(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        audioAvailable
        onTogglePlayPause={() => {}}
        onStopAudio={() => {}}
        isPlaying
        isPaused
        audioBusy
      />,
    );
    expect(screen.getByTestId('btn-play')).toHaveTextContent('Resume');
    expect(screen.getByTestId('btn-play')).toBeEnabled();
    expect(screen.getByTestId('btn-stop')).toBeEnabled();
  });

  it('renders export order with MSCZ default first and includes MSCX/MUSICXML/ABC', () => {
    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        exportsEnabled
        onExportMscz={() => {}}
        onExportPdf={() => {}}
        onExportMscx={() => {}}
        onExportMusicXml={() => {}}
        onExportAbc={() => {}}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Export' }));
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems[0]).toHaveTextContent('MSCZ (MuseScore default)');
    expect(menuItems[1]).toHaveTextContent('PDF');
    expect(screen.getByTestId('btn-export-mscx')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-musicxml')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-abc')).toBeInTheDocument();
  });

  it('wires remove-containing-measures and labels trailing measure removal', async () => {
    const user = userEvent.setup();
    const onRemoveContainingMeasures = vi.fn();
    const onRemoveTrailingEmptyMeasures = vi.fn();

    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
        onRemoveContainingMeasures={onRemoveContainingMeasures}
        onRemoveTrailingEmptyMeasures={onRemoveTrailingEmptyMeasures}
      />,
    );

    await user.click(screen.getByTestId('btn-remove-containing-measures'));
    expect(onRemoveContainingMeasures).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('btn-remove-trailing-empty')).toHaveTextContent(
      /Trailing Empty Bars/i,
    );
  });

  it('renders Add Pickup button in Measures section', () => {
    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        onAddPickup={() => {}}
      />,
    );

    expect(screen.getByTestId('btn-add-pickup')).toBeInTheDocument();
    expect(screen.getByTestId('btn-add-pickup')).toHaveTextContent(/Add Pickup/i);
  });

  it('renders pickup numerator and denominator inputs', () => {
    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        onAddPickup={() => {}}
      />,
    );

    expect(screen.getByTestId('input-pickup-numerator')).toBeInTheDocument();
    expect(screen.getByTestId('select-pickup-denominator')).toBeInTheDocument();
  });

  it('does not render Add Note button in PitchSection', () => {
    render(
      <Toolbar
        onFileUpload={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
        mutationsEnabled
        selectionActive
      />,
    );

    expect(screen.queryByTestId('btn-add-note-top')).not.toBeInTheDocument();
  });
});
