import { Score } from '../../../lib/webmscore-loader';

export const normalizeXmlData = async (data: unknown): Promise<Uint8Array | null> => {
  if (!data) {
    return null;
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  console.warn('Unexpected saveXml response type', data);
  return null;
};

export const decodeXmlData = async (data: unknown): Promise<string | null> => {
  const normalized = await normalizeXmlData(data);
  if (!normalized) {
    return null;
  }
  return new TextDecoder().decode(normalized);
};

export const getScoreMscxText = async (targetScore: Score) => {
  if (!targetScore?.saveMsc) {
    return null;
  }
  const data = await targetScore.saveMsc('mscx');
  return await decodeXmlData(data);
};
