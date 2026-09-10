import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--mock-geist-sans' }),
  Geist_Mono: () => ({ variable: '--mock-geist-mono' }),
}));

import RootLayout from '../app/layout';

describe('RootLayout', () => {
  it('renders children', () => {
    const child = <div>child</div>;
    const tree = RootLayout({ children: child });
    const treeProps = tree.props as {
      lang: string;
      suppressHydrationWarning: boolean;
      children: React.ReactNode;
    };

    expect(tree.type).toBe('html');
    expect(treeProps.lang).toBe('en');
    expect(treeProps.suppressHydrationWarning).toBe(true);

    const children = React.Children.toArray(treeProps.children);
    const body = children.find(
      (candidate): candidate is React.ReactElement<{ children: React.ReactNode }> =>
        React.isValidElement<{ children: React.ReactNode }>(candidate) && candidate.type === 'body',
    );
    expect(body).toBeDefined();
    expect(body?.props.children).toBe(child);
  });
});
