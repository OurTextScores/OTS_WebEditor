import { defineCommand, type AnyCommand } from '../../../lib/commands/types';
import { getPartsSnapshot } from './partsStore';
import { exportAllParts, generate, show, type PartsInputs } from './useScoreParts';

/**
 * The parts commands (roadmap E18): `view.part.show` (argument: -1 for the full score, else the part's index),
 * `view.part.full`, `view.part.generate` and `file.export.parts`. useScoreParts registers them with the live inputs; the command catalog
 * builds them with inert ones, for what only needs to know they exist.
 */
export function buildPartCommands(getInputs: () => PartsInputs): AnyCommand[] {
  return [
    defineCommand<number>({
      id: 'view.part.show',
      label: 'Show Part',
      keywords: ['parts', 'excerpt', 'full score'],
      enabled: (ctx) => ctx.hasScore && Boolean(getPartsSnapshot().score?.setExcerptId),
      run: (_ctx, index) => show(getInputs(), Number(index)),
    }),
    defineCommand({
      id: 'view.part.full',
      label: 'Show Full Score',
      keywords: ['parts', 'full score', 'conductor'],
      enabled: (ctx) => ctx.hasScore && getPartsSnapshot().current !== -1,
      run: () => show(getInputs(), -1),
    }),
    defineCommand({
      id: 'view.part.generate',
      label: 'Make Parts from Instruments',
      keywords: ['parts', 'excerpts', 'generate'],
      enabled: (ctx) =>
        ctx.hasScore &&
        Boolean(getPartsSnapshot().score?.generateExcerpts) &&
        getPartsSnapshot().parts.length === 0,
      run: () => generate(getInputs()),
    }),
    defineCommand({
      id: 'file.export.parts',
      label: 'Export All Parts (PDF)',
      testId: 'btn-export-parts',
      keywords: ['export', 'download', 'parts', 'zip', 'pdf'],
      enabled: (ctx) => ctx.hasScore && getPartsSnapshot().parts.length > 0,
      run: () => exportAllParts(getInputs()),
    }),
  ];
}
