export const errorMessage = (err: unknown) => {
  if (typeof err === 'string') {
    return err.trim();
  }
  if (err instanceof Error) {
    const message = typeof err.message === 'string' ? err.message.trim() : '';
    if (message) {
      return message;
    }
    const name = typeof err.name === 'string' ? err.name.trim() : '';
    return name;
  }
  if (err && typeof err === 'object') {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage.trim();
    }
    const maybeName = (err as { name?: unknown }).name;
    if (typeof maybeName === 'string') {
      return maybeName.trim();
    }
  }
  return '';
};

export const scoreLoadErrorMessage = (err: unknown) => {
  const message = errorMessage(err);
  if (message.includes('newer MuseScore format')) {
    return message.replace(/^WebMscore Err(?:\[2007\]\s*)?/, '').trim();
  }
  return 'Failed to load score. See console for details.';
};
