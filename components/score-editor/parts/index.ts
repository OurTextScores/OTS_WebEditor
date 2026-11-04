/** Parts (roadmap E18): the live score's parts, which one the editor shows, and the whole-score guard. */
export {
  ensureFullScore,
  getPartsSnapshot,
  resetParts,
  subscribeToParts,
  type PartsSnapshot,
  type ScorePart,
} from './partsStore';
export { useScoreParts } from './useScoreParts';
