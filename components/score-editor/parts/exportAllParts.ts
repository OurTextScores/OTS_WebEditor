import { zipStore, type ZipEntry } from '../../../lib/zip-store-writer';
import type { Score } from '../../../lib/webmscore-loader';
import { safeFileStem } from './partFileName';
import { getPartsSnapshot } from './partsStore';

type Serialized = <T>(operation: () => Promise<T>, label: string) => Promise<T>;

/**
 * Every part as a PDF, with the full score, in one ZIP (roadmap E18), as MuseScore's Export dialog does with "all
 * parts". One serialized operation points the engine at each part in turn and back to the one shown, so no drawing
 * runs in between.
 */
export async function allPartsPdfArchive(
  score: Score,
  run: Serialized,
): Promise<Uint8Array | null> {
  const { parts, current } = getPartsSnapshot();
  if (!parts.length || !score.setExcerptId || !score.savePdf) return null;
  const entries = await run(async () => {
    const files: ZipEntry[] = [];
    const used = new Set<string>();
    const unique = (stem: string) => {
      let name = `${stem}.pdf`;
      for (let n = 2; used.has(name); n++) name = `${stem} (${n}).pdf`;
      used.add(name);
      return name;
    };
    try {
      for (let index = -1; index < parts.length; index++) {
        await score.setExcerptId!(index);
        const pdf = await score.savePdf();
        files.push({
          name: unique(index === -1 ? 'Score' : safeFileStem(parts[index].name)),
          data: pdf,
        });
      }
    } finally {
      await score.setExcerptId!(current);
    }
    return files;
  }, 'savePdf(all parts)');
  return zipStore(entries);
}
