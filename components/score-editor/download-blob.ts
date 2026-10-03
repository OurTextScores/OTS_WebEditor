import { toOwnedBytes } from './byte-encoding';

export const downloadBlob = (data: BlobPart | Uint8Array, filename: string, mime: string) => {
  const blobPart = data instanceof Uint8Array ? toOwnedBytes(data) : data;
  const blob = new Blob([blobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
