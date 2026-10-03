export const summarizeScoreId = (id: string) => {
  if (id.startsWith('url:')) {
    const url = id.slice(4);
    const name = url.split('/').pop() || url;
    return { title: name, detail: url, type: 'url' as const };
  }
  if (id.startsWith('file:')) {
    const parts = id.slice(5).split(':');
    const name = parts[0] || 'File import';
    return { title: name, detail: 'File import', type: 'file' as const };
  }
  if (id.startsWith('new:')) {
    return { title: 'New score', detail: id.slice(4), type: 'new' as const };
  }
  if (id === 'legacy') {
    return {
      title: 'Legacy checkpoints',
      detail: 'Unscoped checkpoints',
      type: 'legacy' as const,
    };
  }
  if (id.startsWith('ots:')) {
    const [, workId = '', sourceId = ''] = id.split(':');
    return {
      title: sourceId ? `OTS source ${sourceId}` : 'OurTextScores source',
      detail: workId ? `Work ${workId}` : 'OurTextScores source',
      type: 'other' as const,
    };
  }
  return { title: id, detail: '', type: 'other' as const };
};
