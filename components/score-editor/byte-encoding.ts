export const encodeBase64 = (data: Uint8Array) => {
  const globalBuffer = (
    globalThis as {
      Buffer?: { from: (bytes: Uint8Array) => { toString: (encoding: string) => string } };
    }
  ).Buffer;
  if (globalBuffer) {
    return globalBuffer.from(data).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  throw new Error('No base64 encoder available in this environment.');
};

export const decodeBase64ToBytes = (input: string) => {
  const compact = input.replace(/\s+/g, '');
  if (!compact) {
    return new Uint8Array();
  }
  const globalBuffer = (
    globalThis as { Buffer?: { from: (value: string, encoding: string) => Uint8Array } }
  ).Buffer;
  if (globalBuffer) {
    return new Uint8Array(globalBuffer.from(compact, 'base64'));
  }
  if (typeof atob === 'function') {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('No base64 decoder available in this environment.');
};

export const toOwnedBytes = (data: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(data);

export const toOwnedArrayBuffer = (data: Uint8Array): ArrayBuffer => toOwnedBytes(data).buffer;
