import type { Positions } from '../webmscore-loader';

type Box = Positions['elements'][number];

/**
 * Whether a note or rest centred at (`x`, `y`) belongs to the engine's segment `box`, all in score units. The box is the
 * segment's x extent and its staff's height, so a head on ledger lines sits just outside it: three staff spaces of
 * margin (a quarter of the box height each side) take those in. Shared by the player (DOM) and the video export
 * (canvas), so a note lights the same way in both.
 */
export function centreInSegmentBox(x: number, y: number, box: Box): boolean {
  const width = box.width ?? box.sx ?? 0;
  const height = box.height ?? box.sy ?? 0;
  const margin = height * 0.75;
  return x >= box.x && x <= box.x + width && y >= box.y - margin && y <= box.y + height + margin;
}
