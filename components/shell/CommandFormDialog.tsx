'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useState, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { Button } from '../ui/Button';
import { Dialog, DialogContent } from '../ui/Dialog';
import { COMMAND_FORMS, type CommandForm } from './commandForms';
import { invokeCommand } from './invokeCommand';
import { closeCommandForm, getShellUiState, subscribeToShellUi } from './shellStore';

function FormBody({
  commandId,
  form,
  registry,
}: {
  commandId: string;
  form: CommandForm;
  registry: CommandRegistry;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.name, String(field.defaultValue)])),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        closeCommandForm();
        void invokeCommand(commandId, form.toArgs(values), registry);
      }}
    >
      <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
        {form.title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Enter the values for {form.title}.
      </DialogPrimitive.Description>
      <div className="mt-3 flex flex-col gap-3">
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
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="md" onClick={closeCommandForm}>
          Cancel
        </Button>
        <Button type="submit" size="md" variant="primary" data-testid={form.submitTestId}>
          {form.submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Asks for the arguments of a command that needs them (Insert Measures, Tempo, …). */
export function CommandFormDialog({
  registry = defaultCommandRegistry,
}: {
  registry?: CommandRegistry;
}) {
  const commandId = useSyncExternalStore(
    subscribeToShellUi,
    () => getShellUiState().form,
    () => getShellUiState().form,
  );
  const form = commandId ? COMMAND_FORMS[commandId] : undefined;

  return (
    <Dialog open={Boolean(commandId && form)} onOpenChange={(open) => !open && closeCommandForm()}>
      {commandId && form && (
        <DialogContent className="max-w-sm" data-testid="command-form">
          <FormBody key={commandId} commandId={commandId} form={form} registry={registry} />
        </DialogContent>
      )}
    </Dialog>
  );
}
