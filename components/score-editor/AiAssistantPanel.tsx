'use client';

import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { LoaderCircle, Square } from 'lucide-react';

import {
  AI_PROVIDER_CONFIGS,
  AI_PROVIDER_LABELS,
  type AiProvider,
} from '../../lib/ai-provider-adapters';
import { type AiModelDescriptor } from '../../lib/ai-model-capabilities';
import {
  AI_EDIT_EFFORT_PROFILES,
  AI_EDIT_EFFORTS,
  formatAiEditBudgetDuration,
  type AiEditEffort,
} from '../../lib/ai-edit-effort';
import { CodeMirrorEditor, type CodeEditorThemeMode } from '../CodeMirrorEditor';
import { type AiAssistantController } from './useAiAssistantController';
import { type AiEditWorkKind } from './useAiEditController';

type AiAssistantPanelProps = {
  controller: AiAssistantController;
  presentation: {
    work: { kind: AiEditWorkKind; message: string } | null;
    elapsedMs: number;
    budgetMs: number;
    busy: boolean;
    feedbackBusy: boolean;
    feedbackError: string | null;
    modelHint: string | null;
    selectedModel: AiModelDescriptor;
    supportsCustomMaxTokens: boolean;
    supportsTemperature: boolean;
    supportsImageContext: boolean;
    supportsPdfContext: boolean;
    scoreCanSavePng: boolean;
    outputValidation: { valid: boolean; message: string };
    applyDisabled: boolean;
    patchEditorHeight: string | number;
    patchEditorMaxHeight: string | number;
    codeEditorTheme: CodeEditorThemeMode;
  };
  actions: {
    cancel: () => void;
    requestPatch: () => void;
    reviewPatch: () => void;
    sendChat: () => void;
    updateOutput: (value: string) => void | Promise<unknown>;
  };
};

export function AiAssistantPanel({ controller, presentation, actions }: AiAssistantPanelProps) {
  const {
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
    aiError,
    aiModels,
    aiModelDescriptors,
    aiModelsLoading,
    aiModelsError,
  } = controller;
  const {
    work: aiEditWork,
    elapsedMs: aiEditElapsedMs,
    budgetMs: activeAiEditBudgetMs,
    busy: aiBusy,
    feedbackBusy: aiDiffFeedbackBusy,
    feedbackError: aiDiffFeedbackError,
    modelHint: aiModelHint,
    selectedModel: selectedAiModelDescriptor,
    supportsCustomMaxTokens: aiSupportsCustomMaxTokens,
    supportsTemperature: aiSupportsTemperature,
    supportsImageContext: aiSupportsImageContext,
    supportsPdfContext: aiSupportsPdfContext,
    scoreCanSavePng,
    outputValidation: aiOutputValidation,
    applyDisabled: aiApplyDisabled,
    patchEditorHeight,
    patchEditorMaxHeight,
    codeEditorTheme,
  } = presentation;
  const {
    cancel: cancelAiEditRequest,
    requestPatch: handleAiRequest,
    reviewPatch: handleApplyAiOutput,
    sendChat: handleAiChatSend,
    updateOutput: updateAiOutput,
  } = actions;

  return (
    <div className="mt-3 flex min-h-full flex-col gap-3 text-sm text-slate-700">
      {aiEditWork && (
        <div
          data-testid={
            aiEditWork.kind === 'feedback' ? 'ai-diff-feedback-working' : 'ai-edit-working'
          }
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900"
        >
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">{aiEditWork.message}</div>
            <div className="mt-0.5 text-caption text-blue-700">
              {AI_EDIT_EFFORT_PROFILES[aiEditEffort].label}
              {' · '}
              {formatAiEditBudgetDuration(aiEditElapsedMs)} elapsed
              {' · up to '}
              {formatAiEditBudgetDuration(activeAiEditBudgetMs)}
            </div>
          </div>
          <button
            type="button"
            onClick={cancelAiEditRequest}
            title="Cancel AI edit"
            aria-label="Cancel AI edit"
            className="flex shrink-0 items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
          >
            <Square className="h-3 w-3 fill-current" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>
      )}
      {aiDiffFeedbackError && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Diff feedback failed: {aiDiffFeedbackError}
        </div>
      )}
      <details className="rounded border border-slate-200 bg-slate-50/70 px-3 py-2" open>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
          Model &amp; Access
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Provider
            </label>
            <select
              value={aiProvider}
              onChange={(event) => setAiProvider(event.target.value as AiProvider)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => (
                <option key={provider} value={provider}>
                  {AI_PROVIDER_LABELS[provider]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Model
            </label>
            {aiModels.length > 0 ? (
              <select
                value={aiModels.includes(aiModel) ? aiModel : ''}
                onChange={(event) => setAiModel(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              >
                {!aiModels.includes(aiModel) && (
                  <option value="" disabled>
                    Select a model…
                  </option>
                )}
                {aiModels.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {aiModelDescriptors.find((descriptor) => descriptor.id === modelId)
                      ?.displayName || modelId}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={aiModel}
                onChange={(event) => setAiModel(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                placeholder="Enter model name"
              />
            )}
            {aiModelsLoading && (
              <div className="mt-1 text-caption text-slate-500">Loading models...</div>
            )}
            {!aiModelsLoading && !aiModels.length && !aiModelsError && (
              <div className="mt-1 text-caption text-slate-500">
                {aiApiKey.trim()
                  ? 'No models loaded. Enter a model name manually.'
                  : 'Enter your API key to load available models.'}
              </div>
            )}
            {aiModelsError && <div className="mt-1 text-xs text-red-600">{aiModelsError}</div>}
            {aiModelHint && <div className="mt-1 text-caption text-amber-600">{aiModelHint}</div>}
          </div>
          <form onSubmit={(e) => e.preventDefault()}>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              API Key ({AI_PROVIDER_LABELS[aiProvider]})
            </label>
            <input
              type="password"
              value={aiApiKey}
              onChange={(event) => setAiApiKey(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Paste your key"
              autoComplete="off"
            />
            <div className="mt-1 text-caption text-slate-500">
              Saved in this browser tab and sent through our server to{' '}
              {AI_PROVIDER_LABELS[aiProvider]} with each request. We never store it on our servers;
              it clears when you close the tab.
            </div>
            {AI_PROVIDER_CONFIGS[aiProvider].apiKeyUrl && (
              <div className="mt-1 text-caption">
                <a
                  href={AI_PROVIDER_CONFIGS[aiProvider].apiKeyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Create {AI_PROVIDER_LABELS[aiProvider]} API key
                </a>
              </div>
            )}
          </form>
        </div>
      </details>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAiMode('patch')}
            className={`rounded border px-2 py-1 ${aiMode === 'patch' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            Patch
          </button>
          <button
            type="button"
            onClick={() => setAiMode('chat')}
            className={`rounded border px-2 py-1 ${aiMode === 'chat' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            Chat
          </button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-slate-600">
            <span>Effort</span>
            <select
              data-testid="ai-edit-effort"
              value={aiEditEffort}
              onChange={(event) => setAiEditEffort(event.target.value as AiEditEffort)}
              disabled={aiBusy || aiDiffFeedbackBusy}
              className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              title={AI_EDIT_EFFORT_PROFILES[aiEditEffort].description}
            >
              {AI_EDIT_EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {AI_EDIT_EFFORT_PROFILES[effort].label}
                </option>
              ))}
            </select>
            <span>Max output</span>
            <select
              value={aiMaxTokensMode}
              onChange={(event) => setAiMaxTokensMode(event.target.value as 'auto' | 'custom')}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              title={
                aiSupportsCustomMaxTokens
                  ? 'Configure maximum output tokens'
                  : 'Custom output is not confirmed for this model'
              }
            >
              <option value="auto">Auto</option>
              <option value="custom" disabled={!aiSupportsCustomMaxTokens}>
                Custom
              </option>
            </select>
            {aiMaxTokensMode === 'custom' && (
              <input
                type="number"
                min={256}
                max={
                  selectedAiModelDescriptor.maxOutputTokens ??
                  selectedAiModelDescriptor.parameters.maxOutputTokens.max
                }
                value={aiMaxTokens}
                onChange={(event) => setAiMaxTokens(Number(event.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
              />
            )}
            <span>Temperature</span>
            <select
              value={aiTemperatureMode}
              onChange={(event) => setAiTemperatureMode(event.target.value as 'auto' | 'custom')}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              title={
                aiSupportsTemperature
                  ? 'Configure sampling temperature'
                  : 'Temperature is unavailable for this model'
              }
            >
              <option value="auto">Auto</option>
              <option value="custom" disabled={!aiSupportsTemperature}>
                Custom
              </option>
            </select>
            {aiTemperatureMode === 'custom' && (
              <input
                type="number"
                step={0.1}
                min={selectedAiModelDescriptor.parameters.temperature.min}
                max={selectedAiModelDescriptor.parameters.temperature.max}
                value={aiTemperature}
                onChange={(event) => setAiTemperature(Number(event.target.value))}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                aria-label="Temperature"
              />
            )}
          </div>
        </div>
        <details
          className="rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600"
          open
        >
          <summary className="cursor-pointer text-caption font-semibold uppercase tracking-wide text-slate-500">
            Context
          </summary>
          <div className="mt-3 space-y-2">
            <div className="flex flex-col items-start gap-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiIncludeSelection}
                  onChange={(event) => setAiIncludeSelection(event.target.checked)}
                />
                Include selection
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiIncludePage}
                  onChange={(event) => setAiIncludePage(event.target.checked)}
                />
                Include current page
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiIncludeRenderedImage}
                  onChange={(event) => setAiIncludeRenderedImage(event.target.checked)}
                  disabled={!aiSupportsImageContext}
                />
                Include rendered image
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiIncludePdf}
                  onChange={(event) => setAiIncludePdf(event.target.checked)}
                  disabled={!aiSupportsPdfContext}
                />
                Include score PDF
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiIncludeChat}
                  onChange={(event) => setAiIncludeChat(event.target.checked)}
                />
                Include chat
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiIncludeXml}
                  onChange={(event) => setAiIncludeXml(event.target.checked)}
                />
                Include MusicXML text
              </label>
            </div>
            {aiIncludeRenderedImage && !scoreCanSavePng && (
              <div className="text-caption text-amber-600">
                PNG capture is not available in this build. The request will continue without image
                context.
              </div>
            )}
            {!aiSupportsImageContext && (
              <div className="text-caption text-slate-500">
                Image input is not confirmed for {selectedAiModelDescriptor.id || 'this model'}.
              </div>
            )}
            {!aiSupportsPdfContext && (
              <div className="text-caption text-slate-500">
                PDF input is not confirmed for {selectedAiModelDescriptor.id || 'this model'}.
              </div>
            )}
            {aiIncludePdf && (
              <div className="text-caption text-slate-500">
                PDF context is generated from the current score and attached when available.
              </div>
            )}
          </div>
        </details>
        {aiMode === 'patch' && (
          <div className="space-y-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Instruction
              </label>
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                placeholder="Describe the change you want in the MusicXML."
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                data-testid="ai-deep-edit-toggle"
                checked={aiDeepEdit}
                onChange={(event) => setAiDeepEdit(event.target.checked)}
                disabled={aiBusy || aiDiffFeedbackBusy}
              />
              Deep Edit (slower, tries and verifies alternatives; ignores image/PDF context)
            </label>
            <button
              type="button"
              onClick={handleAiRequest}
              disabled={aiBusy || aiDiffFeedbackBusy}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiBusy ? 'Working...' : aiDeepEdit ? 'Deep Edit' : 'Generate Patch'}
            </button>
            {aiOutput && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>AI Patch</span>
                  {aiOutputValidation.message && (
                    <span className={aiOutputValidation.valid ? 'text-slate-500' : 'text-red-600'}>
                      {aiOutputValidation.message}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleApplyAiOutput}
                  disabled={aiApplyDisabled}
                  title="Review AI changes in the diff editor before applying."
                  data-testid="btn-ai-review-diff"
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Review in Diff Editor
                </button>
                <CodeMirrorEditor
                  value={aiOutput}
                  onChange={(nextValue) => {
                    void updateAiOutput(nextValue);
                  }}
                  readOnly={false}
                  language="json"
                  placeholderText="AI patch will appear here."
                  height={patchEditorHeight}
                  maxHeight={patchEditorMaxHeight}
                  themeMode={codeEditorTheme}
                />
              </div>
            )}
          </div>
        )}
        {aiMode === 'chat' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Open Chat</span>
              <button
                type="button"
                onClick={() => setAiChatMessages([])}
                disabled={aiBusy || !aiChatMessages.length}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
            <div
              className="min-h-[260px] flex-1 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2"
              style={{ resize: 'vertical' }}
            >
              {aiChatMessages.length ? (
                <div className="space-y-2">
                  {aiChatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}-${message.text.slice(0, 12)}`}
                      className={`rounded px-2 py-1 text-xs ${message.role === 'assistant' ? 'bg-blue-50 text-blue-900' : 'bg-white text-slate-800'}`}
                    >
                      <span className="mb-1 block text-caption uppercase tracking-wide text-slate-500">
                        {message.role === 'assistant' ? 'Assistant' : 'You'}
                      </span>
                      <div className="leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }) => (
                              <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>
                            ),
                            li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
                            code: ({ className, children }) => {
                              const languageClass = className ?? '';
                              const isBlock = languageClass.includes('language-');
                              if (isBlock) {
                                return (
                                  <code className="block overflow-x-auto rounded bg-black/10 px-2 py-1 font-mono text-caption">
                                    {children}
                                  </code>
                                );
                              }
                              return (
                                <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-caption">
                                  {children}
                                </code>
                              );
                            },
                            pre: ({ children }) => (
                              <pre className="mb-2 overflow-x-auto rounded bg-black/5 p-2">
                                {children}
                              </pre>
                            ),
                            hr: () => <hr className="my-2 border-slate-300/70" />,
                          }}
                        >
                          {message.text}
                        </ReactMarkdown>
                      </div>
                      {message.role === 'assistant' && message.sourceRag?.enabled && (
                        <div className="mt-2 rounded border border-blue-100 bg-white/70 p-2 text-caption text-slate-600">
                          <div className="font-semibold uppercase tracking-wide text-slate-500">
                            External Sources
                          </div>
                          {message.sourceRag.used && message.sourceRag.sources?.length ? (
                            <div className="mt-1 space-y-1">
                              {message.sourceRag.sources.map((source) => (
                                <div key={`${source.id}-${source.url}`} className="leading-relaxed">
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-blue-700 hover:underline"
                                  >
                                    {source.label}
                                  </a>
                                  <span className="ml-1 text-slate-500">[{source.tier}]</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1 text-slate-500">
                              Retrieval not used
                              {message.sourceRag.reason ? `: ${message.sourceRag.reason}` : '.'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Start a conversation about this score. You can include this chat when generating
                  patches. Ask for source history, background, or “look this up on IMSLP/Wikipedia”
                  to trigger external-source retrieval.
                </div>
              )}
            </div>
            {!aiChatSourceRagHintDismissed && (
              <div className="flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-caption text-amber-900">
                <div>
                  External-source lookup is on-demand. Ask for source history, background,
                  citations, or explicitly mention IMSLP/Wikipedia/web search to use it.
                </div>
                <button
                  type="button"
                  onClick={() => setAiChatSourceRagHintDismissed(true)}
                  className="shrink-0 rounded border border-amber-300 bg-white/80 px-2 py-0.5 text-caption font-medium text-amber-900 hover:bg-white"
                  aria-label="Dismiss external-source lookup hint"
                >
                  Dismiss
                </button>
              </div>
            )}
            <textarea
              value={aiChatInput}
              onChange={(event) => setAiChatInput(event.target.value)}
              rows={3}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Ask a question or request guidance. Mention source history, IMSLP, Wikipedia, or citations to use external lookup."
            />
            <button
              type="button"
              onClick={handleAiChatSend}
              disabled={aiBusy}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiBusy ? 'Working...' : 'Send Message'}
            </button>
          </div>
        )}
      </div>
      {aiError && <div className="text-xs text-red-600">{aiError}</div>}
    </div>
  );
}
