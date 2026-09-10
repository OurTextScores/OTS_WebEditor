'use client';

import { useState } from 'react';

import { type AiProvider } from '../../lib/ai-provider-adapters';
import { type AiModelDescriptor } from '../../lib/ai-model-capabilities';
import { DEFAULT_AI_EDIT_EFFORT, type AiEditEffort } from '../../lib/ai-edit-effort';
import { type AiChatMessage, type MusicXmlPatch } from './ai-assistant-types';

export function useAiAssistantController() {
  const [aiProvider, setAiProvider] = useState<AiProvider>('openai');
  const [aiModel, setAiModel] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiMode, setAiMode] = useState<'patch' | 'chat'>('patch');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiIncludeXml, setAiIncludeXml] = useState(true);
  const [aiIncludePdf, setAiIncludePdf] = useState(false);
  const [aiIncludePage, setAiIncludePage] = useState(false);
  const [aiIncludeSelection, setAiIncludeSelection] = useState(false);
  const [aiIncludeChat, setAiIncludeChat] = useState(false);
  const [aiDeepEdit, setAiDeepEdit] = useState(false);
  const [aiEditEffort, setAiEditEffort] = useState<AiEditEffort>(DEFAULT_AI_EDIT_EFFORT);
  const [aiIncludeRenderedImage, setAiIncludeRenderedImage] = useState(false);
  const [aiMaxTokensMode, setAiMaxTokensMode] = useState<'auto' | 'custom'>('auto');
  const [aiMaxTokens, setAiMaxTokens] = useState(4096);
  const [aiTemperatureMode, setAiTemperatureMode] = useState<'auto' | 'custom'>('auto');
  const [aiTemperature, setAiTemperature] = useState(1);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
  const [aiChatSourceRagHintDismissed, setAiChatSourceRagHintDismissed] = useState(false);
  const [aiOutput, setAiOutput] = useState('');
  const [aiPatch, setAiPatch] = useState<MusicXmlPatch | null>(null);
  const [aiPatchError, setAiPatchError] = useState<string | null>(null);
  const [aiPatchedXml, setAiPatchedXml] = useState('');
  const [aiBaseXml, setAiBaseXml] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiModelDescriptors, setAiModelDescriptors] = useState<AiModelDescriptor[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiModelsError, setAiModelsError] = useState<string | null>(null);

  return {
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    aiApiKey,
    setAiApiKey,
    aiMode,
    setAiMode,
    aiPrompt,
    setAiPrompt,
    aiIncludeXml,
    setAiIncludeXml,
    aiIncludePdf,
    setAiIncludePdf,
    aiIncludePage,
    setAiIncludePage,
    aiIncludeSelection,
    setAiIncludeSelection,
    aiIncludeChat,
    setAiIncludeChat,
    aiDeepEdit,
    setAiDeepEdit,
    aiEditEffort,
    setAiEditEffort,
    aiIncludeRenderedImage,
    setAiIncludeRenderedImage,
    aiMaxTokensMode,
    setAiMaxTokensMode,
    aiMaxTokens,
    setAiMaxTokens,
    aiTemperatureMode,
    setAiTemperatureMode,
    aiTemperature,
    setAiTemperature,
    aiChatInput,
    setAiChatInput,
    aiChatMessages,
    setAiChatMessages,
    aiChatSourceRagHintDismissed,
    setAiChatSourceRagHintDismissed,
    aiOutput,
    setAiOutput,
    aiPatch,
    setAiPatch,
    aiPatchError,
    setAiPatchError,
    aiPatchedXml,
    setAiPatchedXml,
    aiBaseXml,
    setAiBaseXml,
    aiError,
    setAiError,
    aiModels,
    setAiModels,
    aiModelDescriptors,
    setAiModelDescriptors,
    aiModelsLoading,
    setAiModelsLoading,
    aiModelsError,
    setAiModelsError,
  };
}

export type AiAssistantController = ReturnType<typeof useAiAssistantController>;
