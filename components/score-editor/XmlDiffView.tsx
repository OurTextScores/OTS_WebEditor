'use client';

import { useMemo, useState } from 'react';
import { diffLines } from 'diff';

const CONTEXT_LINES = 3;

type DiffRow =
  { kind: 'added' | 'removed' | 'context'; text: string } | { kind: 'collapsed'; count: number };

function buildDiffRows(
  leftXml: string,
  rightXml: string,
): { rows: DiffRow[]; added: number; removed: number } {
  const parts = diffLines(leftXml, rightXml);
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  parts.forEach((part, partIndex) => {
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    if (part.added) {
      added += lines.length;
      for (const text of lines) rows.push({ kind: 'added', text });
      return;
    }
    if (part.removed) {
      removed += lines.length;
      for (const text of lines) rows.push({ kind: 'removed', text });
      return;
    }
    const isFirst = partIndex === 0;
    const isLast = partIndex === parts.length - 1;
    const leading = isFirst ? 0 : CONTEXT_LINES;
    const trailing = isLast ? 0 : CONTEXT_LINES;
    if (lines.length <= leading + trailing + 1) {
      for (const text of lines) rows.push({ kind: 'context', text });
      return;
    }
    for (const text of lines.slice(0, leading)) rows.push({ kind: 'context', text });
    rows.push({ kind: 'collapsed', count: lines.length - leading - trailing });
    for (const text of lines.slice(lines.length - trailing)) rows.push({ kind: 'context', text });
  });
  return { rows, added, removed };
}

function XmlDiffBody({ leftXml, rightXml }: { leftXml: string; rightXml: string }) {
  const { rows, added, removed } = useMemo(
    () => buildDiffRows(leftXml, rightXml),
    [leftXml, rightXml],
  );
  if (added === 0 && removed === 0) {
    return (
      <div className="mt-2 rounded border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        The two scores have identical MusicXML.
      </div>
    );
  }
  return (
    <div className="mt-2 flex min-h-0 flex-col gap-2">
      <div className="text-[11px] text-slate-500">
        <span className="text-emerald-700">+{added}</span>
        {' / '}
        <span className="text-rose-700">-{removed}</span>
        {' lines'}
      </div>
      <div
        data-testid="xml-diff-view"
        className="max-h-[60vh] overflow-auto rounded border border-slate-200 bg-white font-mono text-[11px] leading-4"
      >
        {rows.map((row, index) =>
          row.kind === 'collapsed' ? (
            <div
              key={`diff-row-${index}`}
              className="border-y border-slate-100 bg-slate-50 px-2 py-0.5 text-center text-slate-400"
            >
              … {row.count} unchanged line{row.count === 1 ? '' : 's'} …
            </div>
          ) : (
            <div
              key={`diff-row-${index}`}
              className={`whitespace-pre px-2 ${
                row.kind === 'added'
                  ? 'bg-emerald-50 text-emerald-800'
                  : row.kind === 'removed'
                    ? 'bg-rose-50 text-rose-800'
                    : 'text-slate-600'
              }`}
            >
              {`${row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' '} ${row.text}`}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function XmlDiffView({
  leftLabel,
  rightLabel,
  leftXml,
  rightXml,
}: {
  leftLabel: string;
  rightLabel: string;
  leftXml: string;
  rightXml: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded border border-slate-200 bg-slate-50 px-3 py-2"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
        MusicXML Diff ({leftLabel} → {rightLabel})
      </summary>
      {open && <XmlDiffBody leftXml={leftXml} rightXml={rightXml} />}
    </details>
  );
}
