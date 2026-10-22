import { useId } from 'react';
import { Button } from '../../ui/Button';
import type { BooleanPropertyDefinition, BooleanPropertyValue } from './boolean-property';

export function BooleanPropertyControl({
  definition,
  state,
  disabled,
  onChange,
}: {
  definition: BooleanPropertyDefinition;
  state: BooleanPropertyValue;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{definition.label}</span>
        <input
          type="checkbox"
          aria-describedby={descriptionId}
          checked={!state.mixed && state.value === true}
          ref={(node) => {
            if (node) node.indeterminate = state.mixed;
          }}
          disabled={disabled || state.applicableCount === 0}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
      <p id={descriptionId} className="text-xs text-slate-500">
        {state.mixed ? 'Mixed. ' : ''}
        {definition.description}
      </p>
      <Button
        size="xs"
        variant="neutral"
        disabled={
          disabled ||
          state.applicableCount === 0 ||
          (!state.mixed && state.value === definition.defaultValue)
        }
        onClick={() => onChange(definition.defaultValue)}
      >
        {definition.resetLabel}
      </Button>
    </div>
  );
}
