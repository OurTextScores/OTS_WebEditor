/**
 * Bounded cache of sanitized page SVGs for one score snapshot. An entry is valid only for the score object, page
 * and decoration/layout snapshot it was rendered from: any other render of the score (an edit, a selection
 * repaint, a font or layout change) clears the cache, because the caller cannot prove a cached page still matches.
 * Limits are by entry count and by total characters, so a long score cannot retain unbounded markup.
 */
export const PAGE_CACHE_MAX_ENTRIES = 3;
export const PAGE_CACHE_MAX_CHARS = 6 * 1024 * 1024;

type Entry = { page: number; svg: string };

export class PageSvgCache {
  private owner: object | null = null;
  private entries: Entry[] = [];
  private chars = 0;

  constructor(
    private readonly maxEntries = PAGE_CACHE_MAX_ENTRIES,
    private readonly maxChars = PAGE_CACHE_MAX_CHARS,
  ) {}

  get(owner: object, page: number): string | null {
    if (owner !== this.owner) return null;
    const at = this.entries.findIndex((entry) => entry.page === page);
    if (at < 0) return null;
    // Most recently used last.
    const [entry] = this.entries.splice(at, 1);
    this.entries.push(entry);
    return entry.svg;
  }

  has(owner: object, page: number): boolean {
    return owner === this.owner && this.entries.some((entry) => entry.page === page);
  }

  set(owner: object, page: number, svg: string): void {
    if (svg.length > this.maxChars) return;
    if (owner !== this.owner) this.clear(owner);
    this.drop(page);
    this.entries.push({ page, svg });
    this.chars += svg.length;
    while (this.entries.length > this.maxEntries || this.chars > this.maxChars) {
      this.chars -= this.entries.shift()!.svg.length;
    }
  }

  clear(owner: object | null = null): void {
    this.owner = owner;
    this.entries = [];
    this.chars = 0;
  }

  stats() {
    return {
      entries: this.entries.length,
      chars: this.chars,
      pages: this.entries.map((e) => e.page),
    };
  }

  private drop(page: number) {
    const at = this.entries.findIndex((entry) => entry.page === page);
    if (at >= 0) this.chars -= this.entries.splice(at, 1)[0].svg.length;
  }
}
