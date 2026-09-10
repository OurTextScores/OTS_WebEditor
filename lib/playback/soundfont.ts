/** Ordered default soundfont candidates for both the editor and embedded player. */
export function buildSoundFontCandidates(options?: {
  cdnUrl?: string;
  embedBuild?: boolean;
}): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  const cdnRaw = (options?.cdnUrl ?? process.env.NEXT_PUBLIC_SOUNDFONT_CDN_URL ?? '').trim();
  if (cdnRaw) {
    const cdn = cdnRaw.replace(/\/+$/, '');
    const lower = cdn.toLowerCase();
    if (lower.endsWith('.sf3')) {
      add(cdn);
      add(`${cdn.slice(0, -4)}.sf2`);
    } else if (lower.endsWith('.sf2')) {
      // Prefer the compressed sibling even when a legacy deployment still
      // configures the much larger SF2 file directly.
      add(`${cdn.slice(0, -4)}.sf3`);
      add(cdn);
    } else {
      add(`${cdn}.sf3`);
      add(`${cdn}.sf2`);
      add(`${cdn}/MuseScore_General.sf3`);
      add(`${cdn}/MuseScore_General.sf2`);
      add(`${cdn}/default.sf3`);
      add(`${cdn}/default.sf2`);
    }
  }

  const embedBuild = options?.embedBuild ?? process.env.NEXT_PUBLIC_BUILD_MODE === 'embed';
  const basePath = embedBuild ? '/score-editor' : '';
  for (const prefix of basePath ? [basePath, ''] : ['']) {
    add(`${prefix}/soundfonts/MuseScore_General.sf3`);
    add(`${prefix}/soundfonts/MuseScore_General.sf2`);
    add(`${prefix}/soundfonts/default.sf3`);
    add(`${prefix}/soundfonts/default.sf2`);
  }

  return urls;
}

export async function fetchDefaultSoundFont(
  signal?: AbortSignal,
): Promise<{ url: string; bytes: Uint8Array } | null> {
  for (const url of buildSoundFontCandidates()) {
    try {
      const response = await fetch(url, signal ? { signal } : undefined);
      if (!response.ok) continue;
      return { url, bytes: new Uint8Array(await response.arrayBuffer()) };
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return null;
}
