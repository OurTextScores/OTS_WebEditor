import { defineCommand, type AnyCommand } from '../../../lib/commands/types';
import { getPartsSnapshot } from './partsStore';
import { getPartsSnapshot as snapshot, setPartsSnapshot } from './partsStore';
import {
  createPart,
  duplicatePart,
  exportAllParts,
  generate,
  removePart,
  renamePart,
  resetPart,
  show,
  type PartsInputs,
} from './useScoreParts';

/**
 * The parts commands (roadmap E18): `view.part.show` (argument: -1 for the full score, else the part's index),
 * `view.part.full`, `view.part.generate`, `file.export.parts`, and managing parts: `view.part.manage` (the dialog),
 * `view.part.create`, `.rename`, `.remove`, `.duplicate` and `.reset`. useScoreParts registers them with the live inputs; the command catalog
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
      id: 'view.part.manage',
      label: 'Manage Parts',
      opensDialog: true,
      keywords: ['parts', 'excerpts', 'rename part', 'new part'],
      enabled: (ctx) => ctx.hasScore && Boolean(snapshot().score?.createExcerpt),
      run: () => setPartsSnapshot({ managing: true }),
    }),
    defineCommand<{ name: string; partIndices: number[] }>({
      id: 'view.part.create',
      label: 'New Part',
      enabled: (ctx) => ctx.hasScore && Boolean(snapshot().score?.createExcerpt),
      run: (_ctx, args) => createPart(getInputs(), args?.name ?? '', args?.partIndices ?? []),
    }),
    defineCommand<{ index: number; name: string }>({
      id: 'view.part.rename',
      label: 'Rename Part',
      enabled: (ctx) => ctx.hasScore && snapshot().parts.length > 0,
      run: (_ctx, args) => renamePart(getInputs(), Number(args?.index), args?.name ?? ''),
    }),
    defineCommand<number>({
      id: 'view.part.remove',
      label: 'Delete Part',
      enabled: (ctx) => ctx.hasScore && snapshot().parts.length > 0,
      run: (_ctx, index) => removePart(getInputs(), Number(index)),
    }),
    defineCommand<number>({
      id: 'view.part.duplicate',
      label: 'Duplicate Part',
      enabled: (ctx) => ctx.hasScore && snapshot().parts.length > 0,
      run: (_ctx, index) => duplicatePart(getInputs(), Number(index)),
    }),
    defineCommand<number>({
      id: 'view.part.reset',
      label: 'Reset Part',
      enabled: (ctx) => ctx.hasScore && snapshot().parts.length > 0,
      run: (_ctx, index) => resetPart(getInputs(), Number(index)),
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
