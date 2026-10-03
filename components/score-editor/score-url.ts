export const updateUrlScoreId = (nextScoreId: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('scoreId', nextScoreId);
  url.searchParams.delete('score');
  window.history.replaceState({}, '', url.toString());
};

export const buildOtsScoreId = (workId: string, sourceId: string) => `ots:${workId}:${sourceId}`;
