'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/Popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/Tabs';
import {
  loadSmuflCodes,
  loadSpecialCharacters,
  symbolLabel,
  type SpecialCharacter,
  type SpecialCharacters,
} from './specialCharacters';

/** A Unicode range longer than this is shown in part: the CJK blocks run to tens of thousands. */
const MAX_UNICODE = 1024;
const MAX_SEARCH = 240;

const selectClass = 'rounded border border-slate-300 bg-white px-1 py-0.5 text-xs';

function Cell({
  item,
  codes,
  onInsert,
}: {
  item: SpecialCharacter;
  codes: Readonly<Record<string, number>>;
  onInsert: (item: SpecialCharacter) => void;
}) {
  const code = item.s !== undefined ? codes[item.s] : item.c;
  const label =
    item.s !== undefined
      ? symbolLabel(item.s)
      : `U+${item.c.toString(16).toUpperCase().padStart(4, '0')}`;
  return (
    <Button
      type="button"
      variant="quiet"
      size="bar"
      title={label}
      aria-label={label}
      data-testid={item.s !== undefined ? `special-sym-${item.s}` : `special-char-${item.c}`}
      className="h-8 w-8 justify-center text-lg"
      // Keep the focus (and the caret) in the text being edited.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onInsert(item)}
    >
      <span
        // SMuFL glyphs draw small at text sizes: larger, on a tight line.
        style={
          item.s !== undefined
            ? { fontFamily: "'BravuraFallback'", fontSize: '1.75rem', lineHeight: 1 }
            : undefined
        }
      >
        {code ? String.fromCodePoint(code) : item.s}
      </span>
    </Button>
  );
}

function Grid({
  items,
  codes,
  onInsert,
}: {
  items: SpecialCharacter[];
  codes: Readonly<Record<string, number>>;
  onInsert: (item: SpecialCharacter) => void;
}) {
  return (
    <div className="grid max-h-64 grid-cols-10 gap-0.5 overflow-y-auto" role="group">
      {items.map((item) => (
        <Cell key={item.s ?? item.c} item={item} codes={codes} onInsert={onInsert} />
      ))}
    </div>
  );
}

/**
 * MuseScore's Special Characters for the text editor (roadmap E17): common symbols and characters, every music symbol
 * by SMuFL category (with a search by name), and Unicode by range. A music symbol goes in as a symbol, a character as
 * text, at the editor's caret.
 */
export function SpecialCharactersPicker({
  onOpen,
  onInsert,
}: {
  onOpen: () => void;
  onInsert: (item: SpecialCharacter, codes: Readonly<Record<string, number>>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{
    characters: SpecialCharacters;
    codes: Readonly<Record<string, number>>;
  } | null>(null);
  const [category, setCategory] = useState(0);
  const [range, setRange] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    void Promise.all([loadSpecialCharacters(), loadSmuflCodes()]).then(([characters, codes]) => {
      if (!cancelled) setData({ characters, codes });
    });
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  const smuflItems = useMemo<SpecialCharacter[]>(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase().replace(/\s+/g, '');
    if (term) {
      return Object.keys(data.codes)
        .filter((name) => name.toLowerCase().includes(term))
        .slice(0, MAX_SEARCH)
        .map((s) => ({ s }));
    }
    return (data.characters.smufl[category]?.glyphs ?? []).map((s) => ({ s }));
  }, [data, category, query]);

  const unicodeItems = useMemo<SpecialCharacter[]>(() => {
    const r = data?.characters.unicode[range];
    if (!r) return [];
    const last = Math.min(r.last, r.first + MAX_UNICODE - 1);
    return Array.from({ length: last - r.first + 1 }, (_, i) => ({ c: r.first + i }));
  }, [data, range]);

  const insert = (item: SpecialCharacter) => {
    if (data) onInsert(item, data.codes);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="quiet"
          size="bar"
          title="Special characters"
          aria-label="Special characters"
          data-testid="rich-text-special"
          onMouseDown={() => onOpen()}
        >
          Ω
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96"
        data-testid="special-characters"
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Stays open while the text is edited, as MuseScore's dialog does: inserting puts the focus back in the editor,
        // and a click there moves the caret. A click anywhere else closes it.
        onFocusOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if ((event.target as Element | null)?.closest?.('[data-testid="inline-text-editor"]'))
            event.preventDefault();
        }}
      >
        {!data ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : (
          <Tabs defaultValue="common">
            <TabsList>
              <TabsTrigger value="common">Common</TabsTrigger>
              <TabsTrigger value="smufl">Musical symbols</TabsTrigger>
              <TabsTrigger value="unicode">Unicode</TabsTrigger>
            </TabsList>
            <TabsContent value="common" className="pt-2">
              <Grid items={data.characters.common} codes={data.codes} onInsert={insert} />
            </TabsContent>
            <TabsContent value="smufl" className="space-y-2 pt-2">
              <div className="flex gap-1">
                <select
                  aria-label="Category"
                  data-testid="special-smufl-category"
                  className={`${selectClass} min-w-0 flex-1`}
                  value={category}
                  disabled={Boolean(query.trim())}
                  onChange={(event) => setCategory(Number(event.currentTarget.value))}
                >
                  {data.characters.smufl.map((c, i) => (
                    <option key={c.label} value={i}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="search"
                  aria-label="Search symbols"
                  placeholder="Search…"
                  data-testid="special-smufl-search"
                  className={`${selectClass} w-28`}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </div>
              <Grid items={smuflItems} codes={data.codes} onInsert={insert} />
            </TabsContent>
            <TabsContent value="unicode" className="space-y-2 pt-2">
              <select
                aria-label="Range"
                data-testid="special-unicode-range"
                className={`${selectClass} w-full`}
                value={range}
                onChange={(event) => setRange(Number(event.currentTarget.value))}
              >
                {data.characters.unicode.map((r, i) => (
                  <option key={r.label} value={i}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Grid items={unicodeItems} codes={data.codes} onInsert={insert} />
            </TabsContent>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}
