export type MusicXmlPatchOp = {
  op: 'replace' | 'setText' | 'setAttr' | 'insertBefore' | 'insertAfter' | 'delete';
  path: string;
  value?: string;
  name?: string;
};

export type MusicXmlPatch = {
  format: 'musicxml-patch@1';
  ops: MusicXmlPatchOp[];
};

export type AiImageAttachment = {
  mediaType: 'image/png';
  base64: string;
};

export type AiPdfAttachment = {
  mediaType: 'application/pdf';
  base64: string;
  filename: string;
};

export type AiSourceRagInfo = {
  enabled: boolean;
  used: boolean;
  reason?: string;
  sourceUrl?: string;
  snippetCount?: number;
  sourceCount?: number;
  sources?: Array<{
    id: string;
    label: string;
    url: string;
    tier: string;
    score: number;
  }>;
};

export type AiChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  sourceRag?: AiSourceRagInfo | null;
};

export type NotaGenSpaceCombinations = Record<string, Record<string, string[]>>;

export type HarmonyVariant = 0 | 1 | 2;

export type AiPromptSection = {
  title: string;
  content: string;
};
