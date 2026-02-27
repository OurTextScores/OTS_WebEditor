import { MUSIC_CONTEXT_TOOL_CONTRACT } from './music-context-contract';
import { MUSIC_CONVERT_TOOL_CONTRACT } from './music-convert-contract';
import { MUSIC_GENERATE_TOOL_CONTRACT } from './music-generate-contract';

export { MUSIC_CONTEXT_TOOL_CONTRACT } from './music-context-contract';
export { MUSIC_CONVERT_TOOL_CONTRACT } from './music-convert-contract';
export { MUSIC_GENERATE_TOOL_CONTRACT } from './music-generate-contract';
export type { MusicToolContract, JsonSchema } from './types';

export const MUSIC_TOOL_CONTRACTS = [
  MUSIC_CONTEXT_TOOL_CONTRACT,
  MUSIC_CONVERT_TOOL_CONTRACT,
  MUSIC_GENERATE_TOOL_CONTRACT,
];

