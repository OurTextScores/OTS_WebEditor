import { defineCommand, type AnyCommand } from '../../lib/commands/types';
import type { EditorCommandProps } from './editorProps';
import { openMarksReview } from './marks-review';

type ExportKey = Extract<keyof EditorCommandProps, `onExport${string}`>;

/**
 * File ▸ Export: one command per format, each calling its `onExport…` handler. Test ids are the ribbon's,
 * `btn-export-<suffix>` (but for current page audio); MEI and MNX came with the 4.7 engine (roadmap E25, E29).
 */
export function buildExportCommands(getProps: () => EditorCommandProps): AnyCommand[] {
  const exportCommand = (
    suffix: string,
    label: string,
    key: ExportKey,
    extraGate: () => boolean = () => true,
    testId = `btn-export-${suffix}`,
  ) =>
    defineCommand({
      id: `file.export.${suffix}`,
      label,
      testId,
      keywords: ['export', 'download', 'save'],
      enabled: (ctx) => ctx.hasScore && Boolean(getProps()[key]) && extraGate(),
      run: async () => {
        await (getProps()[key] as (() => unknown) | undefined)?.();
      },
    });
  // Audio can be rendered: available and not already rendering.
  const audioIdle = () => Boolean(getProps().audioAvailable && !getProps().audioBusy);

  return [
    defineCommand({
      id: 'file.perform',
      label: 'Open in Performance Mode',
      keywords: ['perform', 'performer', 'stage', 'ipad', 'page turn', 'setlist', 'concert'],
      enabled: (ctx) => ctx.hasScore && Boolean(getProps().onPerform),
      run: () => {
        getProps().onPerform?.();
      },
    }),
    defineCommand({
      id: 'file.reviewMarks',
      label: 'Review Rehearsal Marks',
      opensDialog: true,
      keywords: ['rehearsal', 'marks', 'annotations', 'stamps', 'engrave', 'performer', 'review'],
      enabled: (ctx) => ctx.hasScore,
      run: openMarksReview,
    }),
    exportCommand('mscz', 'Export MuseScore (.mscz)', 'onExportMscz'),
    exportCommand('pdf', 'Export PDF', 'onExportPdf'),
    exportCommand('svg', 'Export SVG', 'onExportSvg'),
    exportCommand('png', 'Export PNG', 'onExportPng', () => Boolean(getProps().pngAvailable)),
    exportCommand('mscx', 'Export MuseScore Uncompressed (.mscx)', 'onExportMscx'),
    exportCommand('musicxml', 'Export MusicXML', 'onExportMusicXml'),
    exportCommand('mxl', 'Export Compressed MusicXML (.mxl)', 'onExportMxl'),
    exportCommand('mei', 'Export MEI', 'onExportMei'),
    exportCommand('mnx', 'Export MNX', 'onExportMnx'),
    exportCommand('abc', 'Export ABC', 'onExportAbc'),
    exportCommand('midi', 'Export MIDI', 'onExportMidi'),
    exportCommand('audio', 'Export Audio (WAV)', 'onExportAudio', audioIdle),
    exportCommand(
      'pageAudio',
      'Export Current Page Audio',
      'onExportCurrentPageAudio',
      audioIdle,
      'btn-export-current-page-audio',
    ),
  ];
}
