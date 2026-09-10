/**
 * The new-score dialog.
 *
 * Presentational: it collects title, composer, key, time signature, pickup, measure
 * count and instrument list, and calls back to create. It performs no engine work and
 * knows nothing about how a score is built.
 *
 * The key and time catalogues are static data with no other consumer, so they live
 * here as module constants rather than being rebuilt on every ScoreEditor render.
 */
export const NEW_SCORE_TIME_OPTIONS = [
  { label: '4/4', numerator: 4, denominator: 4 },
  { label: '3/4', numerator: 3, denominator: 4 },
  { label: '2/4', numerator: 2, denominator: 4 },
  { label: '6/8', numerator: 6, denominator: 8 },
  { label: '2/2', numerator: 2, denominator: 2 },
  { label: '5/4', numerator: 5, denominator: 4 },
  { label: '7/8', numerator: 7, denominator: 8 },
  { label: '3/8', numerator: 3, denominator: 8 },
  { label: '9/8', numerator: 9, denominator: 8 },
  { label: '12/8', numerator: 12, denominator: 8 },
];

export const NEW_SCORE_KEY_OPTIONS = [
  { label: 'C', fifths: 0 },
  { label: 'G', fifths: 1 },
  { label: 'D', fifths: 2 },
  { label: 'A', fifths: 3 },
  { label: 'E', fifths: 4 },
  { label: 'B', fifths: 5 },
  { label: 'F#', fifths: 6 },
  { label: 'C#', fifths: 7 },
  { label: 'F', fifths: -1 },
  { label: 'Bb', fifths: -2 },
  { label: 'Eb', fifths: -3 },
  { label: 'Ab', fifths: -4 },
  { label: 'Db', fifths: -5 },
  { label: 'Gb', fifths: -6 },
  { label: 'Cb', fifths: -7 },
];

export type NewScoreInstrumentOption = {
  id: string;
  name: string;
  label: string;
};

/** The grouped catalogue the dialog renders as <optgroup>s. */
export type NewScoreInstrumentGroup = {
  id: string;
  name: string;
  instruments: { id: string; name: string }[];
};

export type NewScoreDialogProps = {
  details: {
    title: string;
    composer: string;
    measures: number;
    setTitle: (value: string) => void;
    setComposer: (value: string) => void;
    setMeasures: (value: number) => void;
  };
  signature: {
    keyFifths: number;
    timeNumerator: number;
    timeDenominator: number;
    withPickup: boolean;
    pickupNumerator: number;
    pickupDenominator: number;
    setKeyFifths: (value: number) => void;
    setTimeNumerator: (value: number) => void;
    setTimeDenominator: (value: number) => void;
    setWithPickup: (value: boolean) => void;
    setPickupNumerator: (value: number) => void;
    setPickupDenominator: (value: number) => void;
  };
  instruments: {
    selectedIds: string[];
    options: NewScoreInstrumentOption[];
    groups: NewScoreInstrumentGroup[];
    /** Catalogue load failures, shown in place of the list. */
    clefMapError: string | null;
    fallbackError: string | null;
    common: { instrument: { id: string; name: string }; label: string }[];
    toAdd: string;
    setToAdd: (value: string) => void;
    add: () => void;
    remove: (index: number) => void;
  };
  actions: {
    create: () => void;
    close: () => void;
  };
};

export function NewScoreDialog({ details, signature, instruments, actions }: NewScoreDialogProps) {
  // Single mapping column; the JSX below is the moved block.
  const newScoreTitle = details.title;
  const newScoreComposer = details.composer;
  const newScoreMeasures = details.measures;
  const setNewScoreTitle = details.setTitle;
  const setNewScoreComposer = details.setComposer;
  const setNewScoreMeasures = details.setMeasures;

  const newScoreKeyFifths = signature.keyFifths;
  const newScoreTimeNumerator = signature.timeNumerator;
  const newScoreTimeDenominator = signature.timeDenominator;
  const newScoreWithPickup = signature.withPickup;
  const newScorePickupNumerator = signature.pickupNumerator;
  const newScorePickupDenominator = signature.pickupDenominator;
  const setNewScoreKeyFifths = signature.setKeyFifths;
  const setNewScoreTimeNumerator = signature.setTimeNumerator;
  const setNewScoreTimeDenominator = signature.setTimeDenominator;
  const setNewScoreWithPickup = signature.setWithPickup;
  const setNewScorePickupNumerator = signature.setPickupNumerator;
  const setNewScorePickupDenominator = signature.setPickupDenominator;

  const newScoreInstrumentIds = instruments.selectedIds;
  const newScoreInstrumentOptions = instruments.options;
  const newScoreInstrumentGroups = instruments.groups;
  const instrumentClefMapError = instruments.clefMapError;
  const instrumentFallbackError = instruments.fallbackError;
  const newScoreCommonInstruments = instruments.common;
  const newScoreInstrumentToAdd = instruments.toAdd;
  const setNewScoreInstrumentToAdd = instruments.setToAdd;
  const handleAddNewScoreInstrument = instruments.add;
  const handleRemoveNewScoreInstrument = instruments.remove;

  const handleCreateNewScore = actions.create;

  const newScoreKeyOptions = NEW_SCORE_KEY_OPTIONS;
  const newScoreTimeOptions = NEW_SCORE_TIME_OPTIONS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      data-testid="new-score-modal"
    >
      <div className="w-full max-w-xl rounded bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">New Score</div>
          <button
            type="button"
            onClick={actions.close}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-gray-700">
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Creating a new score will replace the current score and switch to a new checkpoint set.
            Export your score if you want a copy; you can return to the previous URL to access older
            checkpoints.
          </div>
          {instrumentClefMapError && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {instrumentClefMapError}
            </div>
          )}
          {instrumentFallbackError && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {instrumentFallbackError}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Title
            </span>
            <input
              type="text"
              value={newScoreTitle}
              onChange={(event) => setNewScoreTitle(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Untitled score"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Composer
            </span>
            <input
              type="text"
              value={newScoreComposer}
              onChange={(event) => setNewScoreComposer(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Composer"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Instruments
            </span>
            {newScoreInstrumentOptions.length > 0 ? (
              <>
                <div className="flex gap-2">
                  <select
                    value={newScoreInstrumentToAdd}
                    onChange={(event) => setNewScoreInstrumentToAdd(event.target.value)}
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    {newScoreCommonInstruments.length > 0 && (
                      <optgroup label="Common">
                        {newScoreCommonInstruments.map((entry, index) => (
                          <option
                            key={`common-${entry.instrument.id}-${index}`}
                            value={entry.instrument.id}
                          >
                            {entry.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {newScoreInstrumentGroups.length > 0
                      ? newScoreInstrumentGroups.map((group) => (
                          <optgroup key={group.id} label={group.name}>
                            {group.instruments.map((instrument) => (
                              <option key={instrument.id} value={instrument.id}>
                                {instrument.name}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : newScoreInstrumentOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddNewScoreInstrument}
                    disabled={!newScoreInstrumentToAdd}
                    className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-1 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                  {newScoreInstrumentIds.length > 0 ? (
                    newScoreInstrumentIds.map((instrumentId, index) => {
                      const option = newScoreInstrumentOptions.find(
                        (entry) => entry.id === instrumentId,
                      );
                      const label = option?.label || option?.name || instrumentId;
                      return (
                        <div key={`${instrumentId}-${index}`} className="flex items-center gap-2">
                          <span className="flex-1 truncate">{label}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveNewScoreInstrument(index)}
                            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-500">No instruments selected.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500">
                Instrument list unavailable.
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Measures
              </span>
              <input
                type="number"
                min={1}
                value={newScoreMeasures}
                onChange={(event) => setNewScoreMeasures(Number(event.target.value) || 1)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Key Signature
              </span>
              <select
                value={String(newScoreKeyFifths)}
                onChange={(event) => setNewScoreKeyFifths(Number(event.target.value))}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {newScoreKeyOptions.map((option) => (
                  <option key={option.fifths} value={option.fifths}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Time Signature
            </span>
            <select
              value={`${newScoreTimeNumerator}/${newScoreTimeDenominator}`}
              onChange={(event) => {
                const [numerator, denominator] = event.target.value
                  .split('/')
                  .map((value) => Number(value));
                if (Number.isFinite(numerator) && Number.isFinite(denominator)) {
                  setNewScoreTimeNumerator(numerator);
                  setNewScoreTimeDenominator(denominator);
                }
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {newScoreTimeOptions.map((option) => (
                <option key={option.label} value={`${option.numerator}/${option.denominator}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 mt-2">
            <input
              data-testid="new-score-pickup-checkbox"
              type="checkbox"
              checked={newScoreWithPickup}
              onChange={(event) => setNewScoreWithPickup(event.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Include pickup measure</span>
          </label>
          {newScoreWithPickup && (
            <div className="grid gap-3 sm:grid-cols-2 mt-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Pickup Numerator
                </span>
                <input
                  data-testid="new-score-pickup-numerator"
                  type="number"
                  min={1}
                  value={newScorePickupNumerator}
                  onChange={(event) => setNewScorePickupNumerator(Number(event.target.value) || 1)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Pickup Denominator
                </span>
                <select
                  data-testid="new-score-pickup-denominator"
                  value={String(newScorePickupDenominator)}
                  onChange={(event) => setNewScorePickupDenominator(Number(event.target.value))}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="8">8</option>
                  <option value="16">16</option>
                  <option value="32">32</option>
                </select>
              </label>
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleCreateNewScore}
            className="flex-1 rounded border border-gray-300 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create Score
          </button>
          <button
            type="button"
            onClick={actions.close}
            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
