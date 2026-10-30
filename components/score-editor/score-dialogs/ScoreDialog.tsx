'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { RotateCcw } from 'lucide-react';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Dialog, DialogContent } from '../../ui/Dialog';
import {
  DIALOG_SPECS,
  type DialogEngine,
  type DialogField,
  type FieldValue,
  type LoadedDialog,
  type ScoreDialogKind,
} from './dialogSpecs';
import {
  closeScoreDialog,
  getOpenScoreDialog,
  subscribeToScoreDialog,
  type OpenScoreDialog,
} from './scoreDialogStore';

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm';

const GAP_LABELS = ['beamed', 'new beam', 'new 16th sub-beam', 'new 32nd sub-beam'];
const GAP_MARKS = ['⁀', '|', '¦', '┊'];

/** A row of MuseScore's beam-group editor: a note per digit, and a toggle in each gap between two notes. */
function BeamGroupRow({
  field,
  value,
  onChange,
  testId,
}: {
  field: Extract<DialogField, { kind: 'beamGroups' }>;
  value: string;
  onChange: (value: FieldValue) => void;
  testId: string;
}) {
  const digits = value.split('').map((d) => Math.min(Number(d) || 0, field.maxState));
  const toggle = (index: number) => {
    const next = [...digits];
    next[index] = (next[index] + 1) % (field.maxState + 1);
    onChange(next.join(''));
  };
  return (
    <div className="flex flex-col gap-1 text-sm text-slate-700" data-testid={testId}>
      <span>{field.label}</span>
      <div className="flex flex-wrap items-center gap-0.5">
        {digits.map((state, index) => (
          <React.Fragment key={index}>
            {index > 0 ? (
              <Button
                type="button"
                variant={state ? 'neutral' : 'quiet'}
                size="bar"
                data-testid={`${testId}-${index}`}
                data-state={state}
                aria-label={`Between notes ${index} and ${index + 1}: ${GAP_LABELS[state]}`}
                title={GAP_LABELS[state]}
                onClick={() => toggle(index)}
              >
                {GAP_MARKS[state]}
              </Button>
            ) : null}
            <span aria-hidden className="w-3 text-center">
              ♪
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/** Reset to the default, shown while the value differs from it (MuseScore's per-setting reset buttons). */
function ResetButton({
  field,
  value,
  defaultValue,
  onChange,
}: {
  field: DialogField;
  value: FieldValue | undefined;
  defaultValue: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
}) {
  if (defaultValue === undefined) return null;
  const differs =
    typeof defaultValue === 'number'
      ? Math.abs(Number(value) - defaultValue) > 1e-9
      : String(value) !== String(defaultValue);
  return (
    <IconButton
      label={`Reset ${field.label} to default`}
      data-testid={`score-dialog-${field.key}-reset`}
      className={differs ? '' : 'invisible'}
      onClick={() => onChange(field.kind === 'select' ? String(defaultValue) : defaultValue)}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
    </IconButton>
  );
}

function Field({
  field,
  value,
  defaultValue,
  onChange,
}: {
  field: DialogField;
  value: FieldValue | undefined;
  defaultValue?: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  const testId = `score-dialog-${field.key}`;
  const reset = (
    <ResetButton field={field} value={value} defaultValue={defaultValue} onChange={onChange} />
  );
  if (field.kind === 'page') return null;
  if (field.kind === 'heading') {
    return (
      <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {field.label}
      </h3>
    );
  }
  if (field.kind === 'beamGroups') {
    return (
      <BeamGroupRow field={field} value={String(value ?? '')} onChange={onChange} testId={testId} />
    );
  }
  if (field.kind === 'boolean') {
    return (
      <span className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            data-testid={testId}
            checked={Boolean(value)}
            onChange={(e) => onChange(e.currentTarget.checked)}
          />
          {field.label}
        </label>
        {reset}
      </span>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
      <span>{field.label}</span>
      <span className="flex items-center gap-1">
        {field.kind === 'text' ? (
          <input
            type="text"
            data-testid={testId}
            className={`${inputClass} w-48`}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.currentTarget.value)}
          />
        ) : field.kind === 'number' ? (
          <input
            type="number"
            data-testid={testId}
            className={`${inputClass} w-24`}
            min={field.min}
            max={field.max}
            step={field.step}
            value={value === undefined ? '' : Number(value)}
            onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
          />
        ) : field.kind === 'select' ? (
          <select
            data-testid={testId}
            className={inputClass}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.currentTarget.value)}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        {field.kind === 'number' && field.unit ? (
          <span className="w-6 text-xs text-slate-500">{field.unit}</span>
        ) : null}
        {reset}
      </span>
    </label>
  );
}

function DialogBody({
  open,
  engine,
  onApply,
}: {
  open: OpenScoreDialog;
  engine: DialogEngine;
  onApply: (kind: ScoreDialogKind, apply: () => Promise<boolean>) => Promise<unknown>;
}) {
  const spec = DIALOG_SPECS[open.kind];
  const [loaded, setLoaded] = useState<LoadedDialog | null>(null);
  const [pageKey, setPageKey] = useState<string | null>(null);
  // A dialog with pages (MuseScore's Style dialog): the page list, and the fields of the page shown.
  const pages = useMemo(() => {
    const result: { key: string; label: string; fields: DialogField[] }[] = [];
    for (const field of loaded?.fields ?? []) {
      if (field.kind === 'page') result.push({ key: field.key, label: field.label, fields: [] });
      else result.at(-1)?.fields.push(field);
    }
    return result;
  }, [loaded]);
  const page = pages.find((p) => p.key === pageKey) ?? pages[0];
  const shownFields = pages.length ? (page?.fields ?? []) : (loaded?.fields ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    spec.load(engine, open.context).then(
      (result) => !cancelled && setLoaded(result),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [engine, open, spec]);

  return (
    <form
      // The specs clamp and convert values themselves; native step checks would refuse a loaded 14.99 mm margin.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!loaded) return;
        const values = loaded.values;
        closeScoreDialog();
        void onApply(open.kind, () => spec.apply(engine, values, open.context));
      }}
    >
      <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
        {spec.title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description
        className={spec.description ? 'mt-1 text-sm text-slate-600' : 'sr-only'}
      >
        {spec.description ?? `Edit ${spec.title}.`}
      </DialogPrimitive.Description>
      <div className="mt-3 flex gap-3">
        {pages.length ? (
          <nav
            aria-label={`${spec.title} pages`}
            className="flex max-h-[60vh] w-48 shrink-0 flex-col overflow-y-auto border-r border-slate-200 pr-2"
          >
            {pages.map((p) => (
              <Button
                key={p.key}
                type="button"
                variant={p === page ? 'neutral' : 'quiet'}
                size="sm"
                className="justify-start text-left"
                aria-current={p === page ? 'page' : undefined}
                data-testid={`score-dialog-page-${p.key}`}
                onClick={() => setPageKey(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </nav>
        ) : null}
        <div className="flex max-h-[60vh] min-w-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {error ? (
            <p className="text-sm text-red-700" data-testid="score-dialog-error">
              {error}
            </p>
          ) : null}
          {loaded
            ? shownFields.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={loaded.values[field.key]}
                  defaultValue={loaded.defaults?.[field.key]}
                  onChange={(value) =>
                    setLoaded((prev) =>
                      prev ? { ...prev, values: { ...prev.values, [field.key]: value } } : prev,
                    )
                  }
                />
              ))
            : null}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="md" onClick={closeScoreDialog}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="md"
          variant="primary"
          disabled={!loaded}
          data-testid="score-dialog-submit"
        >
          {spec.submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * The open score dialog (Page Settings, Style, Measure Properties, Select ▸ More…, Realize Chord Symbols). The
 * editor supplies the engine and how an apply runs (`onApply`: a mutation, or a selection change and redraw).
 */
export function ScoreDialog({
  engine,
  onApply,
}: {
  engine: DialogEngine | null;
  onApply: (kind: ScoreDialogKind, apply: () => Promise<boolean>) => Promise<unknown>;
}) {
  const open = useSyncExternalStore(subscribeToScoreDialog, getOpenScoreDialog, getOpenScoreDialog);
  return (
    <Dialog open={Boolean(open && engine)} onOpenChange={(next) => !next && closeScoreDialog()}>
      {open && engine ? (
        <DialogContent
          className={open.kind === 'style' ? 'max-w-3xl' : 'max-w-md'}
          data-testid="score-dialog"
        >
          <DialogBody key={`${open.kind}`} open={open} engine={engine} onApply={onApply} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
