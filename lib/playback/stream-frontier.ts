/** Watches the audio clock, which may stop advancing while a tab/context is suspended. */
export function watchStreamFrontier(
  context: AudioContext,
  frontier: number,
  isCurrent: () => boolean,
  onStarved: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const check = () => {
    if (!isCurrent() || context.state === 'closed') return;
    const remainingMs = (frontier - context.currentTime) * 1000;
    if (context.state !== 'suspended' && remainingMs <= 1) {
      onStarved();
      return;
    }
    timer = setTimeout(check, Math.max(10, Math.min(100, remainingMs)));
  };
  timer = setTimeout(check, Math.max(0, Math.min(100, (frontier - context.currentTime) * 1000)));
  return () => clearTimeout(timer);
}
