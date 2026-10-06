/**
 * RGBA pixels to planar I420 (Y, then U, then V), BT.709 limited range, chroma averaged over each 2x2 block. Frames made
 * this way are plain CPU memory in the one pixel format every H.264 encoder takes, so they do not depend on how the
 * browser happens to back a canvas frame (a GPU texture some Windows encoders refuse: "Unexpected frame format").
 * Width and height must be even. Alpha is ignored: the export draws on an opaque background.
 */
export function rgbaToI420(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (width % 2 !== 0 || height % 2 !== 0) throw new Error('I420 needs an even width and height');
  const lumaSize = width * height;
  const chromaWidth = width >> 1;
  const out = new Uint8Array(lumaSize + 2 * (lumaSize >> 2));
  const uBase = lumaSize;
  const vBase = lumaSize + (lumaSize >> 2);

  for (let y = 0; y < height; y += 2) {
    const row0 = y * width;
    const row1 = row0 + width;
    for (let x = 0; x < width; x += 2) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        const rowStart = dy === 0 ? row0 : row1;
        for (let dx = 0; dx < 2; dx += 1) {
          const index = rowStart + x + dx;
          const p = index << 2;
          const r = rgba[p];
          const g = rgba[p + 1];
          const b = rgba[p + 2];
          out[index] = ((47 * r + 157 * g + 16 * b + 128) >> 8) + 16;
          rSum += r;
          gSum += g;
          bSum += b;
        }
      }
      const r = rSum >> 2;
      const g = gSum >> 2;
      const b = bSum >> 2;
      const chroma = (y >> 1) * chromaWidth + (x >> 1);
      out[uBase + chroma] = ((-26 * r - 86 * g + 112 * b + 128) >> 8) + 128;
      out[vBase + chroma] = ((112 * r - 102 * g - 10 * b + 128) >> 8) + 128;
    }
  }
  return out;
}
