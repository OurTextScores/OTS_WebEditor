export type CrossEngineFacts = {
  parts: number;
  measures: number | null;
  pitchedNotes: number | null;
  rests: number;
  visiblePitchedNotes: number | null;
};
export type CrossEngineComparison = {
  metric: keyof CrossEngineFacts;
  values: { input: number | null; osmd: number | null; musescore: number | null };
  status: 'agree' | 'needs-review' | 'unsupported';
};
export function musicXmlFacts(xml: string): CrossEngineFacts;
export const factNames: (keyof CrossEngineFacts)[];
export function compareFacts(input: CrossEngineFacts, osmd: CrossEngineFacts, musescore: CrossEngineFacts): CrossEngineComparison[];
