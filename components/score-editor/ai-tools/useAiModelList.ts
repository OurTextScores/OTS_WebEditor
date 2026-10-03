import React, { useEffect } from 'react';
import {
  type AiProvider,
  loadAiModelDescriptorsDirect,
  DEFAULT_MODEL_BY_PROVIDER,
  AI_PROVIDER_LABELS,
} from '../../../lib/ai-provider-adapters';
import {
  type AiModelDescriptor,
  parseAiModelDescriptors,
  resolveAiModelDescriptor,
} from '../../../lib/ai-model-capabilities';
import { isMissingProxyStatus, ANTHROPIC_EMBED_PROXY_ERROR } from '../ai-constants';
import { errorMessage } from '../error-messages';

export type AiModelListContext = {
  aiEnabled: boolean;
  setAiModels: React.Dispatch<React.SetStateAction<string[]>>;
  setAiModelDescriptors: React.Dispatch<React.SetStateAction<AiModelDescriptor[]>>;
  setAiModelsError: React.Dispatch<React.SetStateAction<string | null>>;
  setAiModelsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  aiApiKey: string;
  useLlmProxy: boolean;
  proxyUrlFor: (path: string) => string;
  aiProvider: AiProvider;
  isEmbedBuild: boolean;
  llmProxyBase: string;
  setAiModel: React.Dispatch<React.SetStateAction<string>>;
};

/** Fetches the model list for the configured AI provider (directly or through the proxy) and mirrors it into the model state. */
export function useAiModelList(ctx: AiModelListContext) {
  const {
    aiEnabled,
    setAiModels,
    setAiModelDescriptors,
    setAiModelsError,
    setAiModelsLoading,
    aiApiKey,
    useLlmProxy,
    proxyUrlFor,
    aiProvider,
    isEmbedBuild,
    llmProxyBase,
    setAiModel,
  } = ctx;

  useEffect(() => {
    if (!aiEnabled) {
      setAiModels([]);
      setAiModelDescriptors([]);
      setAiModelsError(null);
      setAiModelsLoading(false);
      return;
    }
    const trimmedKey = aiApiKey.trim();
    if (!trimmedKey) {
      setAiModels([]);
      setAiModelDescriptors([]);
      setAiModelsError(null);
      setAiModelsLoading(false);
      return;
    }
    let canceled = false;
    setAiModelsLoading(true);
    setAiModelsError(null);
    const loadModels = async () => {
      try {
        let models: string[] = [];
        let descriptors: AiModelDescriptor[] = [];
        let proxyResponse: Response | null = null;
        if (useLlmProxy) {
          const nextProxyResponse = await fetch(proxyUrlFor(`/api/llm/${aiProvider}/models`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: trimmedKey }),
          });
          if (nextProxyResponse.ok) {
            proxyResponse = nextProxyResponse;
          } else if (
            aiProvider === 'anthropic' &&
            isEmbedBuild &&
            !llmProxyBase &&
            isMissingProxyStatus(nextProxyResponse.status)
          ) {
            throw new Error(ANTHROPIC_EMBED_PROXY_ERROR);
          } else if (!(
            isEmbedBuild &&
            !llmProxyBase &&
            isMissingProxyStatus(nextProxyResponse.status)
          )) {
            const errorText = await nextProxyResponse.text();
            throw new Error(errorText || 'Failed to load models.');
          }
        }

        if (proxyResponse) {
          const data = await proxyResponse.json();
          models = Array.isArray(data?.models)
            ? data.models.filter((id: unknown): id is string => typeof id === 'string')
            : [];
          descriptors = parseAiModelDescriptors(data?.modelDescriptors);
        } else {
          descriptors = await loadAiModelDescriptorsDirect({
            provider: aiProvider,
            apiKey: trimmedKey,
          });
          models = descriptors.map((descriptor) => descriptor.id);
        }

        if (canceled) {
          return;
        }
        const filtered =
          aiProvider === 'openai' ? models.filter((id: string) => /^gpt-|^o/.test(id)) : models;
        const sorted = [...new Set(filtered.length ? filtered : models)].sort();
        const descriptorsById = new Map(
          descriptors.map((descriptor) => [descriptor.id, descriptor]),
        );
        const sortedDescriptors = sorted.map(
          (id) => descriptorsById.get(id) ?? resolveAiModelDescriptor(aiProvider, id),
        );
        setAiModels(sorted);
        setAiModelDescriptors(sortedDescriptors);
        // Keep the user's current selection if it is still valid; only
        // pick a default when the selection is empty or no longer offered.
        // Uses a functional update so this effect need not depend on
        // aiModel (which would refetch/reset on every keystroke).
        setAiModel((prev) => {
          if (prev && sorted.includes(prev)) {
            return prev;
          }
          return (
            sorted.find((id: string) => id === DEFAULT_MODEL_BY_PROVIDER[aiProvider]) ||
            sorted[0] ||
            DEFAULT_MODEL_BY_PROVIDER[aiProvider] ||
            ''
          );
        });
      } catch (err) {
        if (!canceled) {
          console.error(`Failed to load ${AI_PROVIDER_LABELS[aiProvider]} models`, err);
          setAiModels([]);
          setAiModelDescriptors([]);
          const message = errorMessage(err);
          setAiModelsError(
            message || 'Failed to load models. Check your API key or enter a model manually.',
          );
        }
      } finally {
        if (!canceled) {
          setAiModelsLoading(false);
        }
      }
    };
    void loadModels();
    return () => {
      canceled = true;
    };
  }, [
    aiApiKey,
    aiEnabled,
    aiProvider,
    isEmbedBuild,
    llmProxyBase,
    proxyUrlFor,
    setAiModel,
    setAiModelDescriptors,
    setAiModels,
    setAiModelsError,
    setAiModelsLoading,
    useLlmProxy,
  ]);
}
