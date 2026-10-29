'use client';

import React from 'react';
import type { ElementPropertyState } from '../../../lib/webmscore-loader';
import { IconButton } from '../../ui/IconButton';
import { INTERVAL_STEPS, INTERVAL_TYPES, splitInterval, type NotationPropertyDescriptor } from './notationProperties';
import type { NotationPropertiesModel } from './useNotationProperties';

const selectClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm';

function Control({
  property,
  state,
  disabled,
  set,
}: {
  property: NotationPropertyDescriptor;
  state: ElementPropertyState;
  disabled: boolean;
  set: (token: string) => void;
}) {
  const testId = `notation-${property.name}`;
  if (property.kind === 'boolean') {
    return (
      <input
        type="checkbox"
        data-testid={testId}
        checked={!state.mixed && state.value === 'true'}
        ref={(element) => {
          if (element) element.indeterminate = state.mixed;
        }}
        disabled={disabled}
        onChange={(event) => set(event.target.checked ? 'true' : 'false')}
      />
    );
  }
  if (property.kind === 'select') {
    return (
      <select data-testid={testId} className={selectClass} disabled={disabled} value={state.mixed ? '' : (state.value ?? '')} onChange={(e) => set(e.target.value)}>
        {state.mixed ? <option value="">Mixed</option> : null}
        {property.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  const { step, type } = splitInterval(state.value);
  return (
    <span className="flex gap-1">
      <select data-testid={`${testId}-step`} className={selectClass} disabled={disabled} value={step} onChange={(e) => set(`${e.target.value},${type}`)}>
        {INTERVAL_STEPS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select data-testid={`${testId}-type`} className={selectClass} disabled={disabled} value={type} onChange={(e) => set(`${step},${e.target.value}`)}>
        {INTERVAL_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </span>
  );
}

/** The Properties panel's notation section: the selection's ornament, dynamic or hairpin properties, each resettable. */
export function NotationPropertiesSection({ model, disabled }: { model: NotationPropertiesModel; disabled: boolean }) {
  const { group, values, set } = model;
  const shown = group?.properties.filter((property) => values[property.name]) ?? [];
  if (!group || shown.length === 0) return null;
  return (
    <section className="space-y-3 border-t border-slate-200 p-4" data-testid="notation-properties">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
      {shown.map((property) => {
        const state = values[property.name];
        const isDefault = !state.mixed && state.value === state.default;
        return (
          <div key={property.name} className="flex items-center justify-between gap-2 text-sm text-slate-700">
            <span>{property.label}</span>
            <span className="flex items-center gap-1">
              <Control property={property} state={state} disabled={disabled} set={(token) => void set(property.name, token)} />
              <IconButton
                data-testid={`notation-${property.name}-reset`}
                label={`Reset ${property.label} to the style default`}
                disabled={disabled || isDefault}
                onClick={() => void set(property.name, null)}
              >
                ↺
              </IconButton>
            </span>
          </div>
        );
      })}
    </section>
  );
}
