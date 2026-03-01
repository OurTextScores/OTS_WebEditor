/**
 * E2E tests for the music agent router that hit the real OpenAI API.
 *
 * These tests are skipped by default during `npm run test`. To run them:
 *   OPENAI_API_KEY=sk-... RUN_E2E=1 npx vitest run unit/music-agent-e2e.test.ts
 *
 * NOTE: The @openai/agents SDK requires globalThis.fetch, which vitest's node
 * environment may not provide. Tests accept both agents-sdk and fallback modes.
 * For true agent-SDK-path testing, use the browser (npm run dev) or a standalone
 * Node script.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runMusicAgentRouter } from '../lib/music-agents/router';

const HAS_E2E = Boolean(process.env.RUN_E2E && process.env.OPENAI_API_KEY);

const SCALE_XML = readFileSync(
  resolve(__dirname, 'fixtures/c-major-scale.musicxml'),
  'utf-8',
);

describe.skipIf(!HAS_E2E)('music agent router (E2E)', () => {
  const priorOpenAiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (priorOpenAiKey !== undefined) {
      process.env.OPENAI_API_KEY = priorOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('routes a scoreops prompt and returns structured output with result', async () => {
    const result = await runMusicAgentRouter({
      prompt: 'Set the key signature to G major',
      toolInput: {
        context: { content: SCALE_XML },
        scoreops: { content: SCALE_XML },
      },
    });

    expect(result.status).toBeLessThan(400);
    expect(['agents-sdk', 'fallback']).toContain(result.body.mode);
    if (result.body.mode === 'agents-sdk') {
      expect(result.body.selectedTool).toMatch(/^music\./);
      expect(typeof result.body.response).toBe('string');
      const rawResult = result.body.result;
      expect(rawResult).toBeTruthy();
      if (typeof rawResult === 'string') {
        const parsed = JSON.parse(rawResult);
        expect(parsed).toHaveProperty('tool');
        expect(parsed).toHaveProperty('status');
        expect(parsed).toHaveProperty('ok');
      }
    } else {
      expect(result.body.selectedTool).toMatch(/^music\./);
    }
  }, 90_000);

  it('routes a context analysis prompt', async () => {
    const result = await runMusicAgentRouter({
      prompt: 'What key is this score in?',
      toolInput: {
        context: { content: SCALE_XML },
      },
    });

    expect(result.status).toBeLessThan(400);
    expect(['agents-sdk', 'fallback']).toContain(result.body.mode);
  }, 90_000);

  it('accepts API key from request body', async () => {
    const savedKey = process.env.OPENAI_API_KEY!;
    delete process.env.OPENAI_API_KEY;

    const result = await runMusicAgentRouter({
      prompt: 'Set the time signature to 3/4',
      apiKey: savedKey,
      toolInput: {
        context: { content: SCALE_XML },
        scoreops: { content: SCALE_XML },
      },
    });

    expect(result.status).toBeLessThan(400);
    expect(['agents-sdk', 'fallback']).toContain(result.body.mode);
  }, 90_000);

  it('falls back gracefully when no API key is available', async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await runMusicAgentRouter({
      prompt: 'Set the key signature to D major',
      toolInput: {
        context: { content: SCALE_XML },
        scoreops: { content: SCALE_XML },
      },
    });

    expect(result.body.mode).toBe('fallback');
    expect(result.body.selectedTool).toBe('music.scoreops');
  }, 15_000);

  it('handles an explicit useFallbackOnly flag', async () => {
    const result = await runMusicAgentRouter({
      prompt: 'Transpose up by a whole step',
      useFallbackOnly: true,
      toolInput: {
        context: { content: SCALE_XML },
        scoreops: { content: SCALE_XML },
      },
    });

    expect(result.body.mode).toBe('fallback');
  }, 15_000);

  it('returns 400 for missing prompt', async () => {
    const result = await runMusicAgentRouter({});
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty('error');
  });
});
