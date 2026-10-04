'use client';

import React, { useState } from 'react';
import { Button } from '../../../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/Tooltip';
import { CommandFormFields, useFormValues } from '../../CommandFormFields';
import { COMMAND_FORMS, type CommandForm } from '../../commandForms';
import {
  announceUnavailable,
  ControlTip,
  DISABLED_LOOK,
  type StripControlContext,
} from './ControlButton';
import type { StripForm } from './toolbarLayout';

/** The fields and the submit button; mounted only while the popover is open, so each opening starts from the defaults. */
function FormBody({
  form,
  onSubmit,
  onCancel,
}: {
  form: CommandForm;
  onSubmit: (args: unknown) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useFormValues(form);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form.toArgs(values));
      }}
    >
      <div className="mb-2 text-sm font-semibold text-slate-900">{form.title}</div>
      <CommandFormFields form={form} values={values} setValues={setValues} />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" data-testid={form.submitTestId}>
          {form.submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * A command that needs arguments (tempo, insert measures, a custom time signature): a button that opens a
 * popover with the command's form (`commandForms.ts`, the same fields and ids the dialog uses) and runs the
 * command with the entered values.
 */
export function FormButton({
  control,
  context,
}: {
  control: StripForm;
  context: StripControlContext;
}) {
  const { tools, activeKey, setActiveKey } = context;
  const Icon = control.icon;
  const form = COMMAND_FORMS[control.commandId];
  const [open, setOpen] = useState(false);
  const enabled = tools.enabled(control.commandId);
  const reason = enabled ? undefined : tools.reason(control.commandId);
  if (!form) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // A control that cannot run does not open; it says why.
        if (next && !enabled) {
          announceUnavailable(control.label, reason);
          return;
        }
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              data-testid={control.testId}
              data-strip-control={control.testId}
              variant="outline"
              size="xs"
              className={`h-8 w-8 px-0 ${enabled ? '' : DISABLED_LOOK}`}
              aria-label={control.label}
              aria-disabled={enabled ? undefined : true}
              tabIndex={activeKey === control.testId ? 0 : -1}
              onFocus={() => setActiveKey(control.testId)}
            >
              <Icon size={16} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <ControlTip
            label={control.label}
            shortcut={tools.shortcut(control.commandId)}
            reason={reason}
          />
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-56" data-testid={`${control.testId}-form`}>
        <FormBody
          form={form}
          onCancel={() => setOpen(false)}
          onSubmit={(args) => {
            setOpen(false);
            tools.run(control.commandId, args)();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
