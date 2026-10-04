'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { Button } from '../ui/Button';
import { Dialog, DialogContent } from '../ui/Dialog';
import { COMMAND_FORMS, type CommandForm } from './commandForms';
import { CommandFormFields, useFormValues } from './CommandFormFields';
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
  const [values, setValues] = useFormValues(form);

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
      <div className="mt-3">
        <CommandFormFields form={form} values={values} setValues={setValues} />
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
