'use client';

import React from 'react';
import { PanelRightClose } from 'lucide-react';
import type {
  FretDiagramData,
  InspectorPropertyName,
  SelectedElementProperties,
} from '../lib/webmscore-loader';
import { FretboardEditor } from './FretboardEditor';

interface InspectorPanelProps {
  data: SelectedElementProperties | null;
  loading?: boolean;
  disabled?: boolean;
  onChange: (property: InspectorPropertyName, value: boolean | number | string) => void;
  fretDiagram?: FretDiagramData | null;
  onFretDiagramChange?: (data: FretDiagramData) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Content only, for the v2 shell's dock tab, which supplies the chrome and the toggle. */
  embedded?: boolean;
}

const selectOptions: Partial<
  Record<InspectorPropertyName, Array<{ label: string; value: string }>>
> = {
  placement: [
    { label: 'Above', value: 'above' },
    { label: 'Below', value: 'below' },
  ],
  stemDirection: [
    { label: 'Automatic', value: 'auto' },
    { label: 'Up', value: 'up' },
    { label: 'Down', value: 'down' },
  ],
  lineStyle: [
    { label: 'Solid', value: 'solid' },
    { label: 'Dashed', value: 'dashed' },
    { label: 'Dotted', value: 'dotted' },
  ],
};

const labels: Record<InspectorPropertyName, string> = {
  visible: 'Visible',
  color: 'Color',
  placement: 'Placement',
  offsetX: 'Horizontal offset',
  offsetY: 'Vertical offset',
  small: 'Small',
  stemDirection: 'Stem direction',
  lineStyle: 'Line style',
};

const propertyOrder: InspectorPropertyName[] = [
  'visible',
  'color',
  'placement',
  'offsetX',
  'offsetY',
  'small',
  'stemDirection',
  'lineStyle',
];

export function InspectorPanel({
  data,
  loading = false,
  disabled = false,
  onChange,
  fretDiagram,
  onFretDiagramChange,
  collapsed = false,
  onToggleCollapsed,
  embedded = false,
}: InspectorPanelProps) {
  const Wrapper = embedded ? 'div' : 'aside';
  const properties = data?.properties ?? {};
  const available = propertyOrder.filter((name) => properties[name]);

  // When collapsed, the panel renders nothing; its tab lives in the shared
  // collapsed-panel strip (see ScoreEditor) so all rails share one column.
  if (collapsed && !embedded) {
    return null;
  }

  return (
    <Wrapper
      data-testid="inspector-panel"
      className={
        embedded
          ? 'min-h-0 flex-1 overflow-y-auto bg-white'
          : 'w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white'
      }
    >
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Inspector
          </div>
          {!embedded && (
            <button
              type="button"
              data-testid="inspector-toggle"
              onClick={onToggleCollapsed}
              title="Collapse Inspector"
              aria-label="Collapse Inspector"
              aria-expanded
              className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <PanelRightClose size={16} />
            </button>
          )}
        </div>
        <div
          data-testid="inspector-selection-type"
          className="mt-1 truncate text-xs text-slate-500"
        >
          {loading
            ? 'Loading…'
            : data?.selectionCount
              ? `${data.elementType} · ${data.selectionCount} selected`
              : 'Select an element'}
        </div>
      </div>
      {!loading && available.length === 0 && (
        <div className="px-4 py-6 text-sm text-slate-500">
          No editable properties for the current selection.
        </div>
      )}
      <div className="space-y-4 p-4">
        {available.map((name) => {
          const property = properties[name];
          if (!property) return null;
          const mixedLabel = property.mixed ? 'Mixed' : undefined;
          if (name === 'visible' || name === 'small') {
            return (
              <label
                key={name}
                className="flex items-center justify-between gap-3 text-sm text-slate-700"
              >
                <span>{labels[name]}</span>
                <input
                  data-testid={`inspector-${name}`}
                  type="checkbox"
                  checked={!property.mixed && Boolean(property.value)}
                  ref={(element) => {
                    if (element) element.indeterminate = property.mixed;
                  }}
                  disabled={disabled}
                  onChange={(event) => onChange(name, event.target.checked)}
                />
              </label>
            );
          }
          if (name === 'color') {
            return (
              <label key={name} className="block text-sm text-slate-700">
                <span className="mb-1 block">{labels[name]}</span>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="inspector-color"
                    type="color"
                    value={
                      property.mixed || typeof property.value !== 'string'
                        ? '#000000'
                        : property.value.slice(0, 7)
                    }
                    disabled={disabled}
                    onChange={(event) => onChange(name, event.target.value)}
                  />
                  <span className="text-xs text-slate-500">
                    {mixedLabel ?? String(property.value)}
                  </span>
                </div>
              </label>
            );
          }
          if (name === 'offsetX' || name === 'offsetY') {
            return (
              <label key={name} className="block text-sm text-slate-700">
                <span className="mb-1 block">{labels[name]} (sp)</span>
                <input
                  key={`${name}-${String(property.value)}-${property.mixed}`}
                  data-testid={`inspector-${name}`}
                  type="number"
                  min="-20"
                  max="20"
                  step="0.1"
                  defaultValue={property.mixed ? '' : Number(property.value).toFixed(2)}
                  placeholder={mixedLabel}
                  disabled={disabled}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  onBlur={(event) => {
                    if (event.target.value === '') return;
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) onChange(name, value);
                  }}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            );
          }
          const options = selectOptions[name];
          return (
            <label key={name} className="block text-sm text-slate-700">
              <span className="mb-1 block">{labels[name]}</span>
              <select
                data-testid={`inspector-${name}`}
                value={property.mixed ? '' : String(property.value)}
                disabled={disabled}
                onChange={(event) => onChange(name, event.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                {property.mixed && <option value="">Mixed</option>}
                {options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {fretDiagram && onFretDiagramChange && (
        <FretboardEditor data={fretDiagram} disabled={disabled} onChange={onFretDiagramChange} />
      )}
    </Wrapper>
  );
}
