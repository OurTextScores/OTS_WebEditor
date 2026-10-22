import { Button } from '../../ui/Button';
import { BooleanPropertyControl } from '../properties';
import { systemLockProperty } from './system-lock-property';
import type { useSystemLocks } from './useSystemLocks';

export function SystemLocksPanel({
  model,
  disabled,
}: {
  model: ReturnType<typeof useSystemLocks>;
  disabled: boolean;
}) {
  if (!model.supported) return null;
  const state = model.state;
  const blocked = disabled || model.busy;
  return (
    <section aria-label="System layout" className="space-y-3 border-t border-slate-200 p-4">
      <h3 className="text-sm font-semibold">System layout</h3>
      {!state && !model.error && (
        <p role="status" className="text-xs">
          Loading system layout…
        </p>
      )}
      {model.error && (
        <p role="alert" className="text-sm text-red-600">
          {model.error}
        </p>
      )}
      {state && (
        <>
          {state.selection ? (
            <>
              <p className="text-xs text-slate-500">
                Selected measure positions: {state.selection.startMeasure + 1}–
                {state.selection.endMeasure + 1}
              </p>
              <BooleanPropertyControl
                definition={systemLockProperty}
                state={state.locked}
                disabled={blocked || (!state.canLock && !state.canUnlock)}
                onChange={(value) => {
                  void model.mutate(value);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="xs"
                  variant="neutral"
                  disabled={blocked || !state.canMovePrevious}
                  title="Move this measure and preceding measures to the previous system"
                  onClick={() => {
                    void model.mutate('previous');
                  }}
                >
                  Move to previous system
                </Button>
                <Button
                  size="xs"
                  variant="neutral"
                  disabled={blocked || !state.canMoveNext}
                  title="Move this measure and following measures to the next system"
                  onClick={() => {
                    void model.mutate('next');
                  }}
                >
                  Move to next system
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Select notes or measures to change their system layout.
            </p>
          )}
          <p className="text-xs text-slate-500">Measure positions include pickup measures.</p>
          <ul aria-label="Locked measure spans" className="text-xs text-slate-600">
            {state.locks.map((lock) => (
              <li key={`${lock.startMeasure}-${lock.endMeasure}`}>
                Locked measure positions {lock.startMeasure + 1}–{lock.endMeasure + 1}
              </li>
            ))}
          </ul>
          {state.locks.length === 0 && (
            <p className="text-xs text-slate-500">No system locks in this score or part.</p>
          )}
        </>
      )}
    </section>
  );
}
