'use client';

import React from 'react';
import type { ElementPropertyState } from '../../../lib/webmscore-loader';
import { Button } from '../../ui/Button';
import { ColorTokenInput } from './ColorTokenInput';
import { ALIGN_HORIZONTAL, ALIGN_VERTICAL, FONT_STYLE_FLAGS } from './notationProperties';
import type { TextPropertyDescriptor } from './textControls';

const selectClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm';

/** The Text section's own controls: text style, font, colour, font style flags and alignment. */
export function TextPropertyControl({
  property,
  state,
  disabled,
  set,
  textStyles,
  testId,
}: {
  property: TextPropertyDescriptor;
  state: ElementPropertyState;
  disabled: boolean;
  set: (token: string) => void;
  textStyles: readonly { value: string; label: string }[];
  testId: string;
}) {
  if (property.kind === 'textStyle') {
    // The element's own style is offered even if the score's list lacks it (a custom style).
    const options =
      state.value && !textStyles.some((o) => o.value === state.value)
        ? [...textStyles, { value: state.value, label: state.value }]
        : textStyles;
    return (
      <select
        data-testid={testId}
        className={`${selectClass} max-w-40`}
        disabled={disabled}
        value={state.mixed ? '' : (state.value ?? '')}
        onChange={(e) => set(e.target.value)}
      >
        {state.mixed ? <option value="">Mixed</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (property.kind === 'text') {
    const listId = property.suggestions ? `${testId}-suggestions` : undefined;
    return (
      <>
        <input
          // Remount on a new engine value: uncontrolled while typing, committed on Enter or blur.
          key={`${state.value}-${state.mixed}`}
          type="text"
          data-testid={testId}
          className={`${selectClass} w-36`}
          list={listId}
          defaultValue={state.mixed ? '' : (state.value ?? '')}
          placeholder={state.mixed ? 'Mixed' : undefined}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();
            if (value && value !== state.value) set(value);
          }}
        />
        {listId ? (
          <datalist id={listId}>
            {property.suggestions?.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
      </>
    );
  }
  if (property.kind === 'color') {
    return (
      <ColorTokenInput
        value={state.mixed ? '#000000FF' : (state.value ?? '#000000FF')}
        disabled={disabled}
        testId={testId}
        onCommit={set}
      />
    );
  }
  if (property.kind === 'fontStyle') {
    const flags = state.mixed ? 0 : Number(state.value) || 0;
    return (
      <span className="flex gap-1" role="group" aria-label={property.label}>
        {FONT_STYLE_FLAGS.map((flag) => {
          const on = (flags & flag.bit) !== 0;
          return (
            <Button
              key={flag.bit}
              type="button"
              size="bar"
              variant={on ? 'neutral' : 'quiet'}
              aria-label={flag.label}
              aria-pressed={on}
              title={flag.label}
              data-testid={`${testId}-${flag.label.toLowerCase()}`}
              disabled={disabled}
              onClick={() => set(String(on ? flags & ~flag.bit : flags | flag.bit))}
            >
              <span
                className={
                  flag.bit === 1
                    ? 'font-bold'
                    : flag.bit === 2
                      ? 'italic'
                      : flag.bit === 4
                        ? 'underline'
                        : 'line-through'
                }
              >
                {flag.short}
              </span>
            </Button>
          );
        })}
      </span>
    );
  }
  if (property.kind === 'align') {
    const [horizontal = 'left', vertical = 'top'] = (state.mixed ? '' : (state.value ?? '')).split(
      ',',
    );
    return (
      <span className="flex gap-1">
        <select
          data-testid={`${testId}-horizontal`}
          aria-label={`${property.label}: horizontal`}
          className={selectClass}
          disabled={disabled}
          value={horizontal}
          onChange={(e) => set(`${e.target.value},${vertical}`)}
        >
          {ALIGN_HORIZONTAL.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          data-testid={`${testId}-vertical`}
          aria-label={`${property.label}: vertical`}
          className={selectClass}
          disabled={disabled}
          value={vertical}
          onChange={(e) => set(`${horizontal},${e.target.value}`)}
        >
          {ALIGN_VERTICAL.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    );
  }
  return null;
}
