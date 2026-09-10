import { type AiImageAttachment, type AiPdfAttachment } from './ai-assistant-types';

export type AiScoreBridge = {
  getLiveXml: (fallback?: string | null) => Promise<string | null>;
  getContextXml: () => Promise<string>;
  applyXml: (xml: string, telemetrySource: string) => Promise<boolean>;
  getSelectionContext: () => Promise<string>;
  getPageSvgContext: () => Promise<string>;
  getPageImage: () => Promise<AiImageAttachment | null>;
  getScorePdf: () => Promise<AiPdfAttachment | null>;
};
