'use client';

import React from 'react';
import type { ElementPropertyState } from '../../../lib/webmscore-loader';
import { IconButton } from '../../ui/IconButton';
import { TextPropertyControl } from './TextPropertyControl';
import { isTextControl } from './textControls';
import {
  INTERVAL_STEPS,
  INTERVAL_TYPES,
  splitInterval,
  type NotationPropertyDescriptor,
} from './notationProperties';
import type { NotationPropertiesModel } from './useNotationProperties';

const selectClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm';

function Control({
  property,
  state,
  disabled,
  set,
  textStyles,
}: {
  property: NotationPropertyDescriptor;
  state: ElementPropertyState;
  disabled: boolean;
  set: (token: string) => void;
  textStyles: readonly { value: string; label: string }[];
}) {
  const testId = `notation-${property.name}`;
  if (isTextControl(property)) {
    return (
      <TextPropertyControl
        property={property}
        state={state}
        disabled={disabled}
        set={set}
        textStyles={textStyles}
        testId={testId}
      />
    );
  }
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
      <select
        data-testid={testId}
        className={selectClass}
        disabled={disabled}
        value={state.mixed ? '' : (state.value ?? '')}
        onChange={(e) => set(e.target.value)}
      >
        {state.mixed ? <option value="">Mixed</option> : null}
        {property.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (property.kind === 'number') {
    return (
      <span className="flex items-center gap-1">
        <input
          // Remount on a new engine value: the field is uncontrolled while typing, and commits on Enter or blur.
          key={`${state.value}-${state.mixed}`}
          type="number"
          data-testid={testId}
          className={`${selectClass} w-20`}
          min={property.min}
          max={property.max}
          step={property.step}
          defaultValue={state.mixed ? '' : Number(state.value)}
          placeholder={state.mixed ? 'Mixed' : undefined}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (!Number.isFinite(value)) return;
            const clamped = Math.min(property.max, Math.max(property.min, value));
            if (String(clamped) !== state.value) set(String(clamped));
          }}
        />
        {property.unit ? <span className="text-xs text-slate-500">{property.unit}</span> : null}
      </span>
    );
  }
  const { step, type } = splitInterval(state.value);
  return (
    <span className="flex gap-1">
      <select
        data-testid={`${testId}-step`}
        className={selectClass}
        disabled={disabled}
        value={step}
        onChange={(e) => set(`${e.target.value},${type}`)}
      >
        {INTERVAL_STEPS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        data-testid={`${testId}-type`}
        className={selectClass}
        disabled={disabled}
        value={type}
        onChange={(e) => set(`${step},${e.target.value}`)}
      >
        {INTERVAL_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </span>
  );
}

function PropertyGroupSection({
  group,
  model,
  disabled,
  testId,
}: {
  group: NonNullable<NotationPropertiesModel['group']>;
  model: NotationPropertiesModel;
  disabled: boolean;
  testId: string;
}) {
  const { values, set } = model;
  const shown = group.properties.filter((property) => {
    const hidden = property.hiddenWhen && values[property.hiddenWhen.name];
    return (
      values[property.name] &&
      !(hidden && !hidden.mixed && hidden.value === property.hiddenWhen?.value)
    );
  });
  if (shown.length === 0) return null;
  return (
    <section className="space-y-3 border-t border-slate-200 p-4" data-testid={testId}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {group.title}
      </h3>
      {shown.map((property) => {
        const state = values[property.name];
        const isDefault = !state.mixed && state.value === state.default;
        return (
          <div
            key={property.name}
            className="flex items-center justify-between gap-2 text-sm text-slate-700"
          >
            <span>{property.label}</span>
            <span className="flex items-center gap-1">
              <Control
                property={property}
                state={state}
                disabled={disabled}
                set={(token) => void set(property.name, token)}
                textStyles={model.textStyles ?? []}
              />
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

/**
 * The Properties panel's notation sections: the selection's own properties (ornament, dynamic, hairpin…), then its
 * text properties, each resettable to its style, then score and part synchronization (roadmap E18).
 */
export function NotationPropertiesSection({
  model,
  disabled,
}: {
  model: NotationPropertiesModel;
  disabled: boolean;
}) {
  return (
    <>
      {model.group ? (
        <PropertyGroupSection
          group={model.group}
          model={model}
          disabled={disabled}
          testId="notation-properties"
        />
      ) : null}
      {model.text ? (
        <PropertyGroupSection
          group={model.text}
          model={model}
          disabled={disabled}
          testId="text-properties"
        />
      ) : null}
      {model.sync ? (
        <PropertyGroupSection
          group={model.sync}
          model={model}
          disabled={disabled}
          testId="part-sync-properties"
        />
      ) : null}
    </>
  );
}
