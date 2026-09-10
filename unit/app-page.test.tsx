import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: new URLSearchParams(),
  dynamicIndex: 0,
}));

vi.mock('next/dynamic', () => ({
  default: (_importer: unknown, options: { loading?: () => React.ReactNode }) => {
    // Call loading renderer so it's covered by tests.
    options?.loading?.();

    const index = mocks.dynamicIndex++;
    const Mock = () => (
      <div data-testid={index === 0 ? 'dynamic-score-editor' : 'dynamic-score-player'} />
    );
    return Mock;
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.search,
}));

import Home from '../app/page';

describe('Home page', () => {
  it('renders the editor shell', () => {
    mocks.search = new URLSearchParams();
    render(<Home />);
    expect(screen.getByTestId('dynamic-score-editor')).toBeInTheDocument();
  });

  it('routes the canonical player mode and compatibility alias to the player', () => {
    for (const embed of ['player', '1']) {
      mocks.search = new URLSearchParams({ score: '/bach.mscz', embed });
      const view = render(<Home />);
      expect(screen.getByTestId('dynamic-score-player')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('keeps plain score launches and embed flags without a score in the editor', () => {
    const searches = [
      new URLSearchParams({ score: '/bach.mscz' }),
      new URLSearchParams({ embed: '1' }),
    ];
    for (const search of searches) {
      mocks.search = search;
      const view = render(<Home />);
      expect(screen.getByTestId('dynamic-score-editor')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('keeps compare and review modes ahead of player routing', () => {
    const searches = [
      new URLSearchParams({
        score: '/bach.mscz',
        embed: 'player',
        compareLeft: '/a',
        compareRight: '/b',
      }),
      new URLSearchParams({ score: '/bach.mscz', embed: 'player', reviewScore: '/review' }),
    ];
    for (const search of searches) {
      mocks.search = search;
      const view = render(<Home />);
      expect(screen.getByTestId('dynamic-score-editor')).toBeInTheDocument();
      view.unmount();
    }
  });
});
