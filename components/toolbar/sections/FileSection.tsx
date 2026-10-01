import React from 'react';
import { Button } from '../../ui/Button';
import {
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenu,
} from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { CloudUpload, Columns2, FilePlus, FolderOpen, Download, Music, Share2 } from 'lucide-react';

export const FileSection: React.FC<ToolbarSectionProps> = ({
  onNewScore,
  onFileUpload,
  onLoadScoresToCompare,
  onExportSvg,
  onExportPdf,
  onExportPng,
  onExportMxl,
  onExportMscz,
  onExportMscx,
  onExportMusicXml,
  onExportAbc,
  onExportMidi,
  onExportAudio,
  onExportCurrentPageAudio,
  onExportToGoogleDrive,
  onCreateShareableLink,
  onSoundFontUpload,
  exportsEnabled,
  pngAvailable,
  audioAvailable,
  audioBusy,
}) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileUpload(file);
  };

  const handleSoundFontChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onSoundFontUpload) onSoundFontUpload(file);
  };

  return (
    <>
      <Button
        data-testid="btn-new-score"
        onClick={onNewScore}
        variant="primary"
        size="sm"
        disabled={!onNewScore}
        className="shadow-sm"
      >
        <FilePlus size={14} className="mr-2" />
        New Score
      </Button>

      <Button asChild variant="primary" size="sm" className="shadow-sm">
        <label className="cursor-pointer">
          <FolderOpen size={14} className="mr-2" />
          Load Score
          <input
            data-testid="open-score-input"
            type="file"
            accept=".mscz,.mscx,.mxl,.xml,.musicxml"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </Button>

      <Button
        data-testid="btn-load-scores-to-compare"
        onClick={onLoadScoresToCompare}
        variant="outline"
        size="sm"
        disabled={!onLoadScoresToCompare}
        className="shadow-sm"
      >
        <Columns2 size={14} className="mr-2" />
        Load scores to compare
      </Button>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-export"
            variant="primary"
            size="sm"
            disabled={!exportsEnabled}
            className="shadow-sm"
          >
            <Download size={14} className="mr-2" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            data-testid="btn-export-mscz"
            disabled={!exportsEnabled || !onExportMscz}
            onSelect={() => onExportMscz?.()}
          >
            MSCZ (MuseScore default)
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-pdf"
            disabled={!exportsEnabled || !onExportPdf}
            onSelect={() => onExportPdf?.()}
          >
            PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-svg"
            disabled={!exportsEnabled || !onExportSvg}
            onSelect={() => onExportSvg?.()}
          >
            SVG
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-png"
            disabled={!exportsEnabled || !onExportPng || !pngAvailable}
            onSelect={() => onExportPng?.()}
          >
            PNG
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-mscx"
            disabled={!exportsEnabled || !onExportMscx}
            onSelect={() => onExportMscx?.()}
          >
            MSCX
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-musicxml"
            disabled={!exportsEnabled || !onExportMusicXml}
            onSelect={() => onExportMusicXml?.()}
          >
            MUSICXML
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-mxl"
            disabled={!exportsEnabled || !onExportMxl}
            onSelect={() => onExportMxl?.()}
          >
            MXL
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-abc"
            disabled={!exportsEnabled || !onExportAbc}
            onSelect={() => onExportAbc?.()}
          >
            ABC
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-midi"
            disabled={!exportsEnabled || !onExportMidi}
            onSelect={() => onExportMidi?.()}
          >
            MIDI
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-audio"
            disabled={!exportsEnabled || !onExportAudio || !audioAvailable || audioBusy}
            onSelect={() => onExportAudio?.()}
          >
            {audioBusy ? 'Exporting…' : 'WAV'}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-export-current-page-audio"
            disabled={!exportsEnabled || !onExportCurrentPageAudio || !audioAvailable || audioBusy}
            onSelect={() => onExportCurrentPageAudio?.()}
          >
            {audioBusy ? 'Exporting…' : 'Current Page WAV'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        data-testid="btn-export-google-drive"
        onClick={onExportToGoogleDrive}
        variant="outline"
        size="sm"
        disabled={!exportsEnabled || !onExportToGoogleDrive}
        className="shadow-sm"
        title="Download this score, then upload it to Google Drive"
      >
        <CloudUpload size={14} className="mr-2" />
        Export to Drive
      </Button>

      <Button
        data-testid="btn-create-share-link"
        onClick={onCreateShareableLink}
        variant="outline"
        size="sm"
        className="shadow-sm"
        title="Create an editor link from a public Google Drive share URL"
      >
        <Share2 size={14} className="mr-2" />
        Share Link
      </Button>

      <div className="h-3 w-px bg-slate-200"></div>

      <Button asChild variant="outline" size="sm" className="shadow-sm">
        <label className="cursor-pointer">
          <Music size={14} className="mr-2" />
          Load SoundFont
          <input
            data-testid="soundfont-input"
            type="file"
            accept=".sf2,.sf3"
            onChange={handleSoundFontChange}
            className="hidden"
          />
        </label>
      </Button>
    </>
  );
};
