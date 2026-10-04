'use client';

import React, { useState } from 'react';
import type { CommandForm } from './commandForms';

/** The values a form starts with: each field's default, as the text a field holds. */
export const initialFormValues = (form: CommandForm): Record<string, string> =>
  Object.fromEntries(form.fields.map((field) => [field.name, String(field.defaultValue)]));

/** The state of a command form's fields. */
export function useFormValues(form: CommandForm) {
  return useState<Record<string, string>>(() => initialFormValues(form));
}

/**
 * The fields of a command form (SHELL_REDESIGN_DESIGN §5, commandForms.ts), shared by the dialog menus and the
 * palette open and by the tool strip's popover. Fields keep the ribbon inputs' test ids.
 */
export function CommandFormFields({
  form,
  values,
  setValues,
}: {
  form: CommandForm;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {form.fields.map((field, index) => (
        <label key={field.name} className="flex flex-col gap-1 text-sm text-slate-700">
          {field.label}
          {field.type === 'number' ? (
            <input
              autoFocus={index === 0}
              type="number"
              min={field.min}
              data-testid={field.testId}
              value={values[field.name]}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setValues((previous) => ({ ...previous, [field.name]: next }));
              }}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          ) : (
            <select
              data-testid={field.testId}
              value={values[field.name]}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setValues((previous) => ({ ...previous, [field.name]: next }));
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
    </div>
  );
}
