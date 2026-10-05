import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerControls from '@/components/score-player/PlayerControls';

const props = (overrides: Partial<React.ComponentProps<typeof PlayerControls>> = {}) => ({
  state: 'idle' as const,
  positionMs: 1_000,
  durationMs: 10_000,
  volume: 1,
  currentPage: 0,
  pageCount: 2,
  follow: true,
  highlightMode: 'measure' as const,
  clickEnabled: false,
  countInEnabled: false,
  onToggleClick: vi.fn(),
  onToggleCountIn: vi.fn(),
  onTogglePlayPause: vi.fn(),
  onStop: vi.fn(),
  onSeek: vi.fn(),
  onVolume: vi.fn(),
  onPreviousPage: vi.fn(),
  onNextPage: vi.fn(),
  onZoomOut: vi.fn(),
  onFitWidth: vi.fn(),
  onZoomIn: vi.fn(),
  onToggleFollow: vi.fn(),
  onToggleHighlight: vi.fn(),
  ...overrides,
});

describe('PlayerControls', () => {
  afterEach(() => vi.useRealTimers());
  it('commits pointer scrubbing once at the final position', () => {
    const values = props();
    render(<PlayerControls {...values} />);
    const seek = screen.getByTestId('player-seek');

    fireEvent.pointerDown(seek);
    fireEvent.change(seek, { target: { value: '4300' } });
    expect(values.onSeek).not.toHaveBeenCalled();
    fireEvent.pointerUp(seek, { target: { value: '4300' } });

    expect(values.onSeek).toHaveBeenCalledOnce();
    expect(values.onSeek).toHaveBeenCalledWith(4_300);
  });

  it('offers retry after an audio failure', () => {
    const values = props({ state: 'unavailable' });
    render(<PlayerControls {...values} />);
    const retry = screen.getByRole('button', { name: 'Retry playback' });

    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(values.onTogglePlayPause).toHaveBeenCalledOnce();
  });

  it('debounces keyboard seeks', () => {
    vi.useFakeTimers();
    const values = props();
    render(<PlayerControls {...values} />);
    const seek = screen.getByTestId('player-seek');

    fireEvent.change(seek, { target: { value: '2000' } });
    fireEvent.change(seek, { target: { value: '3000' } });
    expect(values.onSeek).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180);

    expect(values.onSeek).toHaveBeenCalledOnce();
    expect(values.onSeek).toHaveBeenCalledWith(3_000);
  });

  it('commits a scrub when pointer capture is lost', () => {
    const values = props();
    render(<PlayerControls {...values} />);
    const seek = screen.getByTestId('player-seek');

    fireEvent.pointerDown(seek, { pointerId: 4 });
    fireEvent.change(seek, { target: { value: '5500' } });
    fireEvent.lostPointerCapture(seek, { target: { value: '5500' } });

    expect(values.onSeek).toHaveBeenCalledOnce();
    expect(values.onSeek).toHaveBeenCalledWith(5_500);
  });

  it('disables transport while the document is unavailable', () => {
    render(<PlayerControls {...props({ disabled: true })} />);
    expect(screen.getByTestId('player-play')).toBeDisabled();
    expect(screen.getByTestId('player-seek')).toBeDisabled();
  });

  it('rewinds to the configured start position', () => {
    render(<PlayerControls {...props({ positionMs: 2_000, startPositionMs: 2_000 })} />);
    expect(screen.getByRole('button', { name: 'Stop and rewind' })).toBeDisabled();
  });

  it('toggles between measure and note highlighting', () => {
    const values = props();
    const view = render(<PlayerControls {...values} />);
    const toggle = screen.getAllByRole('button', { name: 'Note highlighting' })[0];

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(values.onToggleHighlight).toHaveBeenCalledOnce();

    view.rerender(<PlayerControls {...values} highlightMode="note" />);
    expect(screen.getAllByRole('button', { name: 'Note highlighting' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('exposes view and volume controls from the mobile More menu', () => {
    const values = props();
    render(<PlayerControls {...values} />);
    const more = screen.getByLabelText('More player controls');
    fireEvent.click(more);
    const menu = more.closest('details');
    expect(menu).toHaveAttribute('open');
    expect(within(menu!).getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
    fireEvent.click(within(menu!).getByRole('button', { name: 'Fit width' }));
    expect(values.onFitWidth).toHaveBeenCalledOnce();
  });

  it('has Click and Count toggles that show their state, and Count needs Click', () => {
    const off = props();
    const { rerender } = render(<PlayerControls {...off} />);
    const click = screen.getAllByRole('button', { name: 'Metronome' })[0];
    const count = screen.getAllByRole('button', { name: 'Count-in' })[0];
    expect(click).toHaveAttribute('aria-pressed', 'false');
    expect(count).toBeDisabled();
    fireEvent.click(click);
    expect(off.onToggleClick).toHaveBeenCalledOnce();

    const on = props({ clickEnabled: true, countInEnabled: true });
    rerender(<PlayerControls {...on} />);
    expect(screen.getAllByRole('button', { name: 'Metronome' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('button', { name: 'Count-in' })[0]).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Count-in' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Count-in' })[0]);
    expect(on.onToggleCountIn).toHaveBeenCalledOnce();
  });
});
