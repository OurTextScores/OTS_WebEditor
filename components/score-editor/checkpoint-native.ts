import type { CheckpointRecord } from '../../lib/checkpoints';
import type { Score } from '../../lib/webmscore-loader';

type Serialized = <T>(operation: () => Promise<T>, label: string) => Promise<T>;
const direct: Serialized = (operation) => operation();

/**
 * Checkpoints keep the score natively too (roadmap E23). Their MusicXML (compare views, uploads) cannot hold Style
 * settings, system locks and the other notation MusicXML lacks, so a restore from it reset them. A checkpoint now also
 * stores the score's MSCZ, and a restore loads that; one saved before this has only MusicXML and restores from it.
 */
export async function nativeCheckpointFields(
  score: Score | null | undefined,
  run: Serialized = direct,
): Promise<Pick<CheckpointRecord, 'native'>> {
  if (!score?.saveMsc) return {};
  try {
    const data = await run(() => Promise.resolve(score.saveMsc!('mscz')), 'saveMsc(checkpoint)');
    return data?.byteLength ? { native: data.slice().buffer } : {};
  } catch (error) {
    console.warn('Could not save the checkpoint natively; it keeps MusicXML only', error);
    return {};
  }
}

/** The file a checkpoint restores from: its MSCZ when it has one, else its MusicXML. */
export function checkpointRestoreFile(record: CheckpointRecord, name: string): File {
  return record.native
    ? new File([new Uint8Array(record.native)], `${name}.mscz`, {
        type: 'application/vnd.musescore.mscz',
      })
    : new File([new Uint8Array(record.data)], `${name}.musicxml`, { type: 'application/xml' });
}
