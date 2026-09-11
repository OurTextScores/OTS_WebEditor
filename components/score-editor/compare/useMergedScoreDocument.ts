'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeScoreXml, loadWebMscore, type Score } from '@/lib/webmscore-loader';

/**
 * The scanner's view of a page's merged score.
 *
 * Mirrors the backend's `mergedScoreState`, which travels inside the compare
 * regions document because this embed reaches the scanner only through the
 * host's proxy and cannot construct scanner URLs of its own.
 */
export type MergedScoreState = {
  present: boolean;
  sourceEngineId?: string;
  revision: number;
  edited: boolean;
  /** The readings a save must be made against. */
  basisSignature: string;
  recordedBasisSignature?: string;
  /** The readings moved underneath this merge; the reviewer has to decide. */
  stale: boolean;
  /**
   * What has been decided so far, in order.
   *
   * The gutter needs it to know what the merged score currently reads: a
   * control offering to take a bar it already reads that way does nothing,
   * and a control that does nothing is worse than none — a reviewer cannot
   * tell it from one that is merely unavailable.
   */
  decisions?: Array<{
    blockIndex?: number;
    stablePartKey?: string;
    engineId?: string;
    markingsOnly?: 'dynamics' | 'lyrics';
    flagged?: boolean;
    measureIndexes?: number[];
  }>;
  editedMeasures?: Array<{
    measureIndex: number;
    stablePartKey?: string;
    /** Absent means `comparison`, the meaning every record had before findings. */
    source?: 'comparison' | 'finding';
  }>;
  /**
   * Where each merged bar came from, by position.
   *
   * `map[mergedPosition] = sourceMeasureIndex`. A take that inserts or
   * removes bars renumbers everything after it, so any position computed from
   * the engine reading has to be followed through this to stay on the bar it
   * meant.
   */
  measureMap?: Array<number | null>;
  measureMaps?: Record<string, Array<number | null>>;
  url: string;
  musicXmlUrl: string;
};

/**
 * How long to wait for the reviewer to stop before writing the document.
 *
 * Long enough that a run of edits is one save, short enough that stepping away
 * from the keyboard has already kept the work.
 */
const AUTOSAVE_QUIET_MS = 900;

/** What the scanner's merged-score route parses; see its controller. */
const MUSICXML_CONTENT_TYPE = 'application/vnd.recordare.musicxml+xml';

/** A bar-level take, as the scanner's decision route describes the result. */
export type MergedTakeOutcome =
  | { ok: true; state: MergedScoreState; repairs: Array<{ code: string; detail: string }> }
  | { ok: false; error: string; refusals?: Array<{ code: string; detail: string }> };

export type MergedSaveOutcome =
  { ok: true; state: MergedScoreState } | { ok: false; error: string; stale?: boolean };

/**
 * Strip the system breaks the row view imposes.
 *
 * The rows are the *scan's* systems, forced onto whatever document is being
 * shown (see `withForcedSystemBreaks`). That is a way of reading the page, not
 * a property of the score: saving it would push the scanned page's line breaks
 * into the work's own engraving, where nothing asked for them.
 *
 * Note this does not restore the engine's original breaks — reflowing already
 * discarded those. The merged score is saved with no imposed breaks at all and
 * laid out by MuseScore, which is the right default for a score assembled from
 * two readings that broke their lines differently in the first place.
 */
export function withoutSystemBreaks(xml: string): string {
  if (typeof DOMParser === 'undefined') return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return xml;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    for (const measure of Array.from(part.children)) {
      if (measure.tagName !== 'measure') continue;
      for (const print of Array.from(measure.getElementsByTagName('print'))) {
        if (print.parentElement !== measure) continue;
        print.removeAttribute('new-system');
        print.removeAttribute('new-page');
        // A <print> that said nothing but "break here" has nothing left
        // to say; one carrying layout is left alone.
        if (print.attributes.length === 0 && print.children.length === 0) {
          measure.removeChild(print);
        }
      }
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Drop the DTD reference MuseScore writes at the top of an exported score.
 *
 * The scanner refuses any document containing a `<!DOCTYPE`, and that guard is
 * shared with the code that validates what an OMR provider returned — it is an
 * XXE control, not a formatting preference, so it does not get relaxed for our
 * own client. Nothing is lost by dropping it: MusicXML's DOCTYPE is a pointer
 * to a DTD on musicxml.org and carries no content of its own, and the server
 * still refuses anything that arrives with one.
 */
export function withoutDoctype(xml: string): string {
  return xml.replace(/<!DOCTYPE[^>[]*(\[[^\]]*\])?\s*>\s*/i, '');
}

/** Count a part's measures, so an insert or delete can be noticed. */
export function measureCount(xml: string): number {
  if (typeof DOMParser === 'undefined') return 0;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return 0;
  const part = doc.getElementsByTagName('part')[0];
  if (!part) return 0;
  return Array.from(part.children).filter((child) => child.tagName === 'measure').length;
}

type LoadInput = {
  /** Reflowed onto the scan's systems, ready to render as rows. */
  xml: string;
  /** Measure count before reflowing, so a later insert can be detected. */
  baselineMeasures: number;
};

/**
 * Own the merged score as a live, mutable, persistable document.
 *
 * This is the difference S3.5 makes: until now the merged pane was a *view* of
 * whichever engine the reviewer picked, so there was nothing to edit and
 * nothing to keep. Here it is a real webmscore instance with its own identity —
 * mutations run against it, and what is saved is the page's own artifact.
 */
export function useMergedScoreDocument({
  state,
  resolveUrl,
  prepare,
  sourceEngineId,
  finding,
}: {
  state: MergedScoreState | null;
  resolveUrl: (relative: string) => string;
  /**
   * Turn the raw document into one ready to render as rows — in practice,
   * reflowing it onto the scan's systems. Called with the persisted merged
   * score when there is one, and with null when the reviewer is starting
   * from an engine, because both need the same treatment.
   */
  prepare: (persistedXml: string | null, state: MergedScoreState | null) => LoadInput | null;
  sourceEngineId: string;
  /**
   * Set when the editor was opened to answer a cross-staff finding.
   *
   * Every bar edited in this session is then attributed to that finding rather than to
   * a disagreement between engines. One engine flagged its own reading and a human
   * agreed; no second reading was consulted, and on a single-engine job none exists.
   */
  finding?: { kind: string; part?: string } | null;
}) {
  const [score, setScore] = useState<Score | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<MergedScoreState | null>(state);
  const [revision, setRevision] = useState(0);
  const [baselineMeasures, setBaselineMeasures] = useState(0);
  const scoreRef = useRef<Score | null>(null);
  const resolveUrlRef = useRef(resolveUrl);
  resolveUrlRef.current = resolveUrl;
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const [editedMeasures, setEditedMeasures] = useState(state?.editedMeasures || []);
  const editedMeasuresRef = useRef(state?.editedMeasures || []);

  const current = saved ?? state;
  const currentRef = useRef(current);
  currentRef.current = current;

  const acceptEditedMeasures = useCallback(
    (entries: Array<{ measureIndex: number; stablePartKey?: string }>) => {
      editedMeasuresRef.current = entries;
      setEditedMeasures(entries);
    },
    [],
  );

  // The regions document commonly arrives after this hook's first render.
  // Keep persisted exact-bar provenance in step with it unless the reviewer
  // currently has unsaved local additions.
  useEffect(() => {
    if (!dirty) acceptEditedMeasures(current?.editedMeasures || []);
  }, [acceptEditedMeasures, current?.editedMeasures, current?.revision, dirty]);

  const destroy = useCallback(() => {
    const existing = scoreRef.current;
    scoreRef.current = null;
    try {
      existing?.destroy?.();
    } catch {
      // A score that will not close is not a reason to lose the view.
    }
  }, []);

  useEffect(() => destroy, [destroy]);

  /**
   * Load the merged document: the persisted one if the reviewer has saved,
   * otherwise a fresh copy of the engine they chose to start from.
   */
  const loadState = useCallback(
    async (target: MergedScoreState | null) => {
      const persisted = target?.present ? target : null;
      setLoading(true);
      setError(null);
      try {
        let persistedXml: string | null = null;
        if (persisted) {
          const response = await fetch(resolveUrlRef.current(persisted.musicXmlUrl), {
            cache: 'no-store',
          });
          if (!response.ok) {
            throw new Error(`The saved merged score could not be read (${response.status})`);
          }
          persistedXml = await response.text();
        }
        const input = prepareRef.current(persistedXml, target);
        if (!input) {
          destroy();
          setScore(null);
          return;
        }
        const WebMscore = await loadWebMscore();
        const loaded = await WebMscore.load('xml', new TextEncoder().encode(input.xml));
        if (!loaded) throw new Error('The merged score could not be laid out.');
        destroy();
        scoreRef.current = loaded;
        setScore(loaded);
        setBaselineMeasures(input.baselineMeasures);
        setDirty(false);
        setRevision((value) => value + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [destroy],
  );

  /**
   * Load whatever revision is current when the caller acts.
   *
   * Keeping `current` in this callback's dependency list made the row view's
   * initial-load effect run again after every Take: `setSaved(next)` changed
   * the callback identity, the effect fetched the merged document again, and
   * a slower prior load could overwrite the revision the Take had just
   * installed. The ref keeps the operation current without turning a state
   * transition into another initial load.
   */
  const load = useCallback(() => loadState(currentRef.current), [loadState]);

  /**
   * Run one edit against the merged score.
   *
   * Serialized through `busy` rather than a queue: libmscore is single
   * threaded behind this binding, and two overlapping mutations produce a
   * layout that matches neither.
   */
  const mutate = useCallback(
    async (
      label: string,
      action: (target: Score) => Promise<unknown> | unknown,
      options?: {
        skipRelayout?: boolean;
        mutates?: boolean;
        stablePartKey?: string;
        measureIndexes?: number[];
      },
    ): Promise<boolean> => {
      const target = scoreRef.current;
      if (!target || busy || saving) return false;
      setBusy(true);
      try {
        const before =
          options?.mutates === false || options?.measureIndexes
            ? null
            : await Promise.resolve(target.selectionMeasureRange?.()).catch(() => null);
        await action(target);
        if (!options?.skipRelayout && target.relayout) {
          await target.relayout();
        }
        if (options?.mutates !== false) {
          const after = await Promise.resolve(target.selectionMeasureRange?.()).catch(() => null);
          const indexes = new Set(options?.measureIndexes || []);
          for (const range of options?.measureIndexes ? [] : [before, after]) {
            if (!range) continue;
            for (let index = range.startMeasureIndex; index <= range.endMeasureIndex; index += 1) {
              indexes.add(index);
            }
          }
          const next = new Map(
            editedMeasuresRef.current.map((entry) => [
              `${entry.stablePartKey || ''}:${entry.measureIndex}`,
              entry,
            ]),
          );
          for (const measureIndex of indexes) {
            if (!Number.isInteger(measureIndex) || measureIndex < 0) continue;
            const entry = { measureIndex, stablePartKey: options?.stablePartKey };
            next.set(`${entry.stablePartKey || ''}:${measureIndex}`, entry);
          }
          acceptEditedMeasures([...next.values()]);
          setDirty(true);
        }
        setRevision((value) => value + 1);
        return true;
      } catch (err) {
        setError(`Unable to ${label}: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [acceptEditedMeasures, busy, saving],
  );

  /** Export what the reviewer sees, minus the row view's imposed breaks. */
  const exportXml = useCallback(async (): Promise<string | null> => {
    const target = scoreRef.current;
    if (!target?.saveXml) return null;
    return withoutDoctype(withoutSystemBreaks(await decodeScoreXml(await target.saveXml())));
  }, []);

  const save = useCallback(
    async (options?: { acceptStale?: boolean }): Promise<MergedSaveOutcome> => {
      if (!current) return { ok: false, error: 'This page cannot carry a merged score.' };
      setSaving(true);
      setError(null);
      try {
        const musicXml = await exportXml();
        if (!musicXml) throw new Error('The merged score could not be exported.');
        // The score is the body, and everything about the save is in
        // the query string. A JSON envelope escapes a whole document
        // into a string field and exceeds the server's default body
        // limit on an ordinary page, which arrives as a 413 the
        // reviewer can do nothing about.
        const query = new URLSearchParams({
          sourceEngineId,
          basisSignature: current.basisSignature,
          revision: String(current.revision),
          // Hand work is recorded on the artifact because no engine should be
          // credited for a bar a human rewrote, whatever prompted the rewrite.
          // `source` on each entry says which claim it supports: a comparison edit
          // means both engines were wrong there, a finding edit means one engine
          // flagged itself and a human agreed.
          edited: String(dirty || current.edited),
          editedMeasures: JSON.stringify(
            finding
              ? editedMeasuresRef.current.map((entry) => ({ ...entry, source: 'finding' }))
              : editedMeasuresRef.current,
          ),
          acceptStale: String(Boolean(options?.acceptStale)),
          ...(finding ? { findingKind: finding.kind } : {}),
          ...(finding?.part ? { findingPart: finding.part } : {}),
        });
        const response = await fetch(`${resolveUrl(current.url)}?${query}`, {
          method: 'PUT',
          headers: { 'Content-Type': MUSICXML_CONTENT_TYPE },
          body: musicXml,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof body?.message === 'string'
              ? body.message
              : `The merged score could not be saved (${response.status})`;
          setError(message);
          return { ok: false, error: message, stale: response.status === 409 };
        }
        const next = { ...current, ...body } as MergedScoreState;
        setSaved(next);
        acceptEditedMeasures(next.editedMeasures || editedMeasuresRef.current);
        setDirty(false);
        return { ok: true, state: next };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { ok: false, error: message };
      } finally {
        setSaving(false);
      }
    },
    [acceptEditedMeasures, current, dirty, exportXml, resolveUrl, sourceEngineId],
  );

  /**
   * Take one comparison block from one engine into the merged score.
   *
   * The scanner does the splicing: it holds both readings, the alignment and
   * the safety rules, and a decision made anywhere else would be a second
   * implementation of all three. What arrives back is a new revision, so the
   * document is reloaded rather than patched — the merge may have changed
   * length, and guessing how would be the same mistake in a smaller place.
   */
  const take = useCallback(
    async (input: {
      blockIndex: number;
      contentSignature: string;
      engineId: string;
      baseEngineId: string;
      candidateEngineId: string;
      /** Absent takes the bars; present takes only that marking. */
      kind?: 'dynamics' | 'lyrics';
    }): Promise<MergedTakeOutcome> => {
      if (!current) return { ok: false, error: 'This page cannot carry a merged score.' };
      // A decision is applied by the scanner to its persisted document.
      // Flush the live editor first or the response reload below replaces
      // an edit made during the debounce window with the older server
      // revision, silently losing the reviewer's hand work.
      let decisionState = current;
      if (dirty) {
        // Cancel the debounce immediately; otherwise a click at the end
        // of its quiet window can start two saves against one revision.
        setSaving(true);
        const savedEdit = await save();
        if (!savedEdit.ok) {
          return { ok: false, error: savedEdit.error };
        }
        decisionState = savedEdit.state;
      }
      setSaving(true);
      setError(null);
      try {
        const path = input.kind
          ? `${decisionState.url}/decisions/markings`
          : `${decisionState.url}/decisions`;
        const response = await fetch(resolveUrl(path), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockIndex: input.blockIndex,
            contentSignature: input.contentSignature,
            engineId: input.engineId,
            baseEngine: input.baseEngineId,
            candidateEngine: input.candidateEngineId,
            revision: decisionState.revision,
            ...(input.kind ? { kind: input.kind } : {}),
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          // Refusals are the point of that route, not an error to
          // flatten: the reviewer is told what about this passage
          // could not be moved.
          const message =
            typeof body?.message === 'string'
              ? body.message
              : `That passage could not be taken (${response.status})`;
          setError(message);
          return { ok: false, error: message, refusals: body?.refusals };
        }
        const next = { ...decisionState, ...body } as MergedScoreState;
        setSaved(next);
        acceptEditedMeasures(next.editedMeasures || []);
        setDirty(false);
        /*
         * Show what was taken.
         *
         * The decision is applied to the stored document by the server,
         * so the score held here is now a revision behind: without this
         * the take was recorded, the controls swapped over, and the
         * merged pane went on drawing the bar the reviewer had just
         * replaced. Loaded from `next` rather than from state, because
         * the state set above does not reach this closure.
         */
        await loadState(next);
        return { ok: true, state: next, repairs: body?.repairs || [] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { ok: false, error: message };
      } finally {
        setSaving(false);
      }
    },
    [acceptEditedMeasures, current, dirty, loadState, resolveUrl, save],
  );

  /** Apply a page/part bulk choice as ordered block decisions, reloading once. */
  const takeMany = useCallback(
    async (
      inputs: Array<{
        blockIndex: number;
        contentSignature: string;
        engineId: string;
        baseEngineId: string;
        candidateEngineId: string;
      }>,
    ): Promise<MergedTakeOutcome> => {
      if (!current) return { ok: false, error: 'This page cannot carry a merged score.' };
      if (inputs.length === 0) {
        return { ok: true, state: current, repairs: [] };
      }
      let decisionState = current;
      if (dirty) {
        setSaving(true);
        const savedEdit = await save();
        if (!savedEdit.ok) return { ok: false, error: savedEdit.error };
        decisionState = savedEdit.state;
      }
      setSaving(true);
      setError(null);
      const repairs: Array<{ code: string; detail: string }> = [];
      let completed = 0;
      try {
        for (const input of inputs) {
          const response = await fetch(resolveUrl(`${decisionState.url}/decisions`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              blockIndex: input.blockIndex,
              contentSignature: input.contentSignature,
              engineId: input.engineId,
              baseEngine: input.baseEngineId,
              candidateEngine: input.candidateEngineId,
              revision: decisionState.revision,
            }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            const reason =
              typeof body?.message === 'string'
                ? body.message
                : `A bulk take stopped at difference ${input.blockIndex + 1}`;
            const message =
              completed > 0
                ? `${completed} difference${completed === 1 ? '' : 's'} taken; then stopped: ${reason}`
                : reason;
            setError(message);
            setSaved(decisionState);
            acceptEditedMeasures(decisionState.editedMeasures || []);
            await loadState(decisionState);
            return { ok: false, error: message, refusals: body?.refusals };
          }
          decisionState = { ...decisionState, ...body } as MergedScoreState;
          repairs.push(...(body?.repairs || []));
          completed += 1;
        }
        setSaved(decisionState);
        acceptEditedMeasures(decisionState.editedMeasures || []);
        setDirty(false);
        await loadState(decisionState);
        return { ok: true, state: decisionState, repairs };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const message =
          completed > 0
            ? `${completed} difference${completed === 1 ? '' : 's'} taken; then stopped: ${reason}`
            : reason;
        setError(message);
        if (completed > 0) {
          setSaved(decisionState);
          acceptEditedMeasures(decisionState.editedMeasures || []);
          setDirty(false);
          await loadState(decisionState);
        }
        return { ok: false, error: message };
      } finally {
        setSaving(false);
      }
    },
    [acceptEditedMeasures, current, dirty, loadState, resolveUrl, save],
  );

  /** Flag or clear one grounded block without changing its MusicXML. */
  const flag = useCallback(
    async (input: {
      blockIndex: number;
      contentSignature: string;
      baseEngineId: string;
      candidateEngineId: string;
      flagged: boolean;
    }): Promise<MergedTakeOutcome> => {
      if (!current) return { ok: false, error: 'This page cannot carry a merged score.' };
      let decisionState = current;
      if (dirty) {
        setSaving(true);
        const savedEdit = await save();
        if (!savedEdit.ok) return { ok: false, error: savedEdit.error };
        decisionState = savedEdit.state;
      }
      setSaving(true);
      setError(null);
      try {
        const response = await fetch(resolveUrl(`${decisionState.url}/decisions/flag`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockIndex: input.blockIndex,
            contentSignature: input.contentSignature,
            baseEngine: input.baseEngineId,
            candidateEngine: input.candidateEngineId,
            revision: decisionState.revision,
            flagged: input.flagged,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof body?.message === 'string'
              ? body.message
              : `That difference could not be ${input.flagged ? 'flagged' : 'cleared'}`;
          setError(message);
          return { ok: false, error: message };
        }
        const next = { ...decisionState, ...body } as MergedScoreState;
        setSaved(next);
        acceptEditedMeasures(next.editedMeasures || []);
        setDirty(false);
        await loadState(next);
        return { ok: true, state: next, repairs: [] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { ok: false, error: message };
      } finally {
        setSaving(false);
      }
    },
    [acceptEditedMeasures, current, dirty, loadState, resolveUrl, save],
  );

  /** Persist the wholesale starting reading before any edit or block take. */
  const chooseSource = useCallback(
    async (input: {
      engineId: string;
      baseEngineId: string;
      candidateEngineId: string;
    }): Promise<MergedSaveOutcome> => {
      if (!current) return { ok: false, error: 'This page cannot carry a merged score.' };
      if (dirty) {
        return {
          ok: false,
          error: 'Save the current hand edit before changing the starting reading.',
        };
      }
      if (current.present) {
        return {
          ok: false,
          error:
            'This merged score already contains review work; its starting reading cannot be changed.',
        };
      }
      setSaving(true);
      setError(null);
      try {
        const response = await fetch(resolveUrl(`${current.url}/source`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            engineId: input.engineId,
            baseEngine: input.baseEngineId,
            candidateEngine: input.candidateEngineId,
            revision: current.revision,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof body?.message === 'string'
              ? body.message
              : `The starting reading could not be saved (${response.status})`;
          setError(message);
          return { ok: false, error: message };
        }
        const next = { ...current, ...body } as MergedScoreState;
        setSaved(next);
        acceptEditedMeasures(next.editedMeasures || []);
        setDirty(false);
        return { ok: true, state: next };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { ok: false, error: message };
      } finally {
        setSaving(false);
      }
    },
    [acceptEditedMeasures, current, dirty, resolveUrl],
  );

  const discard = useCallback(async (): Promise<MergedSaveOutcome> => {
    if (!current?.present) return { ok: false, error: 'There is no saved merged score.' };
    setSaving(true);
    try {
      const response = await fetch(`${resolveUrl(current.url)}?revision=${current.revision}`, {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof body?.message === 'string'
            ? body.message
            : `The merged score could not be discarded (${response.status})`;
        setError(message);
        return { ok: false, error: message };
      }
      const next = { ...current, ...body } as MergedScoreState;
      setSaved(next);
      acceptEditedMeasures([]);
      setDirty(false);
      return { ok: true, state: next };
    } finally {
      setSaving(false);
    }
  }, [acceptEditedMeasures, current, resolveUrl]);

  /*
   * Every change is kept, without being asked to keep it.
   *
   * A take was already written to the page the moment it was made, so the
   * "save" button only ever governed hand edits — which meant the two halves
   * of the same review were persisted by different rules, and the half that
   * needed a button was the half a reviewer was most likely to lose. There is
   * nothing a reviewer would want to do to this document that they would not
   * want kept.
   *
   * Debounced, because note input produces a mutation per note and each save
   * is a whole document. It waits for a pause rather than saving per
   * keystroke; the window is short enough that a reviewer moving on to the
   * next bar has already had it written.
   *
   * Staleness is not resolved here. When the readings have moved under a
   * merge the server refuses, and it stays refused until the reviewer says
   * which readings they mean — that is a judgement, and the point of saving
   * without being asked is to remove the clerical work, not the judgement.
   */
  useEffect(() => {
    if (!dirty || saving || busy || !current) return;
    const timer = setTimeout(() => {
      void save();
    }, AUTOSAVE_QUIET_MS);
    return () => clearTimeout(timer);
  }, [dirty, saving, busy, current, save]);

  // The debounce removes clerical saves; it must not turn a quick close into
  // silent data loss. Browsers may ignore custom text, but setting returnValue
  // still gives the reviewer the standard unsaved-work guard.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return {
    score,
    state: current,
    loading,
    busy,
    saving,
    dirty,
    editedMeasures,
    error,
    /** Rises on every render-affecting change; row views key off it. */
    revision,
    baselineMeasures,
    load,
    mutate,
    exportXml,
    save,
    chooseSource,
    take,
    takeMany,
    flag,
    discard,
    setError,
  };
}
