import { type AiImageAttachment, type AiPdfAttachment } from './ai-assistant-types';
import type { Omission } from './musicxml-omissions';

export type AiScoreBridge = {
  getLiveXml: (fallback?: string | null) => Promise<string | null>;
  getContextXml: () => Promise<string>;
  applyXml: (xml: string, telemetrySource: string) => Promise<boolean>;
  getSelectionContext: () => Promise<string>;
  /** What the live score has that its MusicXML leaves out (musicxml-omissions.ts). */
  getMusicXmlOmissions?: () => Promise<Omission[]>;
  getPageSvgContext: () => Promise<string>;
  getPageImage: () => Promise<AiImageAttachment | null>;
  getScorePdf: () => Promise<AiPdfAttachment | null>;
};
