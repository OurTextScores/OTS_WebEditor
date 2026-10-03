import { asRecord } from '../../lib/as-record';
import { type PartSummary } from './editor-types';

export const parsePartsFromMetadata = (metadata: unknown): PartSummary[] => {
  const metadataRecord = asRecord(metadata);
  const parts = Array.isArray(metadataRecord?.parts) ? metadataRecord.parts : [];
  return parts.map((value, index) => {
    const part = asRecord(value);
    return {
      index,
      name: typeof part?.name === 'string' ? part.name : '',
      instrumentName: typeof part?.instrumentName === 'string' ? part.instrumentName : '',
      instrumentId: typeof part?.instrumentId === 'string' ? part.instrumentId : '',
      isVisible: String(part?.isVisible ?? '').toLowerCase() === 'true',
    };
  });
};
