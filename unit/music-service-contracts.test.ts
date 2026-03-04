import { describe, expect, it } from 'vitest';
import {
  MUSIC_CONTEXT_TOOL_CONTRACT,
  MUSIC_CONVERT_TOOL_CONTRACT,
  MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT,
  MUSIC_GENERATE_TOOL_CONTRACT,
  MUSIC_PATCH_TOOL_CONTRACT,
  MUSIC_SCOREOPS_TOOL_CONTRACT,
  MUSIC_RENDER_TOOL_CONTRACT,
  MUSIC_MMA_TEMPLATE_TOOL_CONTRACT,
  MUSIC_MMA_RENDER_TOOL_CONTRACT,
  MUSIC_TOOL_CONTRACTS,
} from '../lib/music-services/contracts';

describe('music service tool contracts', () => {
  it('exports a stable set of uniquely named contracts', () => {
    const names = MUSIC_TOOL_CONTRACTS.map((contract) => contract.name);
    expect(names).toEqual([
      'music.context',
      'music.convert',
      'music.diff_feedback',
      'music.generate',
      'music.patch',
      'music.scoreops',
      'music.render',
      'music.mma_template',
      'music.mma_render',
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares required convert contract fields', () => {
    expect(MUSIC_CONVERT_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_CONVERT_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_CONVERT_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required context contract fields', () => {
    expect(MUSIC_CONTEXT_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_CONTEXT_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_CONTEXT_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required generate contract fields', () => {
    expect(MUSIC_GENERATE_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_GENERATE_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_GENERATE_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required diff feedback contract fields', () => {
    expect(MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required patch contract fields', () => {
    expect(MUSIC_PATCH_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_PATCH_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_PATCH_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required scoreops contract fields', () => {
    expect(MUSIC_SCOREOPS_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_SCOREOPS_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_SCOREOPS_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required render contract fields', () => {
    expect(MUSIC_RENDER_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_RENDER_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_RENDER_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required MMA template contract fields', () => {
    expect(MUSIC_MMA_TEMPLATE_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_MMA_TEMPLATE_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_MMA_TEMPLATE_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });

  it('declares required MMA render contract fields', () => {
    expect(MUSIC_MMA_RENDER_TOOL_CONTRACT.description.length).toBeGreaterThan(0);
    expect(MUSIC_MMA_RENDER_TOOL_CONTRACT.inputSchema).toMatchObject({
      type: 'object',
    });
    expect(MUSIC_MMA_RENDER_TOOL_CONTRACT.outputSchema).toMatchObject({
      oneOf: expect.any(Array),
    });
  });
});
