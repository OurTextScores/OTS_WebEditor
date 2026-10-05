import { describe, expect, it } from 'vitest';
import {
  parsePlayerCommand,
  resolveParentOrigin,
  resolvePlayerId,
} from '@/lib/playback/player-message-api';

describe('player message API', () => {
  it('accepts exact web origins and rejects wildcard or URL-shaped variants', () => {
    expect(resolveParentOrigin(null, 'https://scores.example')).toBe('https://scores.example');
    expect(resolveParentOrigin('https://host.example', 'https://scores.example')).toBe(
      'https://host.example',
    );
    expect(resolveParentOrigin('*', 'https://scores.example')).toBeNull();
    expect(resolveParentOrigin('https://host.example/path', 'https://scores.example')).toBeNull();
    expect(resolveParentOrigin('https://user@host.example', 'https://scores.example')).toBeNull();
    expect(resolveParentOrigin('javascript:alert(1)', 'https://scores.example')).toBeNull();
  });

  it('bounds player identifiers and falls back for invalid input', () => {
    expect(resolvePlayerId('score-player_1', 'generated')).toBe('score-player_1');
    expect(resolvePlayerId('not allowed', 'generated')).toBe('generated');
    expect(resolvePlayerId('x'.repeat(65), 'generated')).toBe('generated');
  });

  it('validates command version, target and value ranges', () => {
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'seek',
          value: 4_000,
        },
        'p1',
        10_000,
      ),
    ).toMatchObject({ command: 'seek', value: 4_000 });
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'seek',
          value: 10_001,
        },
        'p1',
        10_000,
      ),
    ).toBeNull();
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 2,
          playerId: 'p1',
          command: 'play',
        },
        'p1',
        10_000,
      ),
    ).toBeNull();
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'other',
          command: 'play',
        },
        'p1',
        10_000,
      ),
    ).toBeNull();
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'set-volume',
          value: 1.1,
        },
        'p1',
        10_000,
      ),
    ).toBeNull();
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'set-follow',
          value: false,
        },
        'p1',
        10_000,
      ),
    ).toMatchObject({ command: 'set-follow', value: false });
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'set-highlight',
          value: 'note',
        },
        'p1',
        10_000,
      ),
    ).toMatchObject({ command: 'set-highlight', value: 'note' });
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'set-highlight',
          value: 'measure',
        },
        'p1',
        10_000,
      ),
    ).toMatchObject({ command: 'set-highlight', value: 'measure' });
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'set-highlight',
          value: 'chord',
        },
        'p1',
        10_000,
      ),
    ).toBeNull();
    expect(
      parsePlayerCommand(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: 'p1',
          command: 'set-highlight',
        },
        'p1',
        10_000,
      ),
    ).toBeNull();
  });
});
