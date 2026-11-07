'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useSearchParams } from 'next/navigation';
import React, { useSyncExternalStore } from 'react';
import { defaultCommandRegistry } from '../../../lib/commands/registry';
import { describeMark } from '../../performer/annotations/annotationHistory';
import { Button } from '../../ui/Button';
import { Dialog, DialogContent } from '../../ui/Dialog';
import type { EditorCore } from '../core';
import { isMarksReviewOpen, setMarksReviewOpen, subscribeToMarksReview } from './marksReviewStore';
import type { ReviewDecision } from './reviewItems';
import { useMarksReview } from './useMarksReview';

const CHOICES: { value: ReviewDecision; label: string }[] = [
  { value: 'engrave', label: 'Engrave' },
  { value: 'keep', label: 'Keep as mark' },
  { value: 'delete', label: 'Delete' },
];

const partName = (part: number) => (part < 0 ? 'Full score' : `Part ${part + 1}`);

/**
 * Rehearsal marks to review (performer mode, Phase 7a): the marks made in performer mode on this device for the score
 * open here. Stamps engrave by rule (Engrave, the default where a rule applies); anything can be kept as a mark or
 * deleted. Engraving is one edit (Undo engraving puts everything back). A notice offers the review when marks wait.
 */
export function MarksReview({
  core,
}: {
  core: Pick<EditorCore, 'score' | 'performMutation' | 'runSerializedScoreOperation'>;
}) {
  const scoreKey = useSearchParams().get('score');
  const open = useSyncExternalStore(subscribeToMarksReview, isMarksReviewOpen, () => false);
  const review = useMarksReview(core, scoreKey);
  const { items, decisions, outcome } = review;
  const toEngrave = items.filter((item) => decisions.get(item.annotation.id) === 'engrave').length;
  const toDelete = items.filter((item) => decisions.get(item.annotation.id) === 'delete').length;

  return (
    <>
      {items.length > 0 && !open && (
        <Button
          type="button"
          size="sm"
          data-testid="marks-review-notice"
          className="fixed bottom-12 left-4 z-30 shadow-md"
          onClick={() => setMarksReviewOpen(true)}
        >
          {items.length} rehearsal mark{items.length === 1 ? '' : 's'} to review
        </Button>
      )}
      <Dialog open={open} onOpenChange={setMarksReviewOpen}>
        <DialogContent className="max-w-2xl" data-testid="marks-review">
          <DialogPrimitive.Title className="text-lg font-semibold text-slate-900">
            Rehearsal marks
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-slate-600">
            Marks made in performer mode on this device. Engraved marks become notation, and
            performer mode then shows the notation instead of the mark.
          </DialogPrimitive.Description>
          <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto" data-testid="marks-review-items">
            {items.map(({ annotation, proposal }) => (
              <li
                key={annotation.id}
                data-testid="marks-review-item"
                className="flex items-center gap-3 rounded border border-slate-200 p-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">
                    {describeMark(annotation)} · {partName(annotation.scorePart)}
                  </span>
                  <span className="block text-xs text-slate-500">{proposal.label}</span>
                </span>
                <span
                  role="radiogroup"
                  aria-label={`Decision for ${describeMark(annotation)}`}
                  className="flex gap-1"
                >
                  {CHOICES.map((choice) => (
                    <Button
                      key={choice.value}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={decisions.get(annotation.id) === choice.value}
                      variant={
                        decisions.get(annotation.id) === choice.value ? 'primary' : 'outline'
                      }
                      disabled={choice.value === 'engrave' && !proposal.engrave}
                      onClick={() => review.decide(annotation.id, choice.value)}
                    >
                      {choice.label}
                    </Button>
                  ))}
                </span>
              </li>
            ))}
            {!items.length && <li className="text-sm text-slate-500">No marks waiting.</li>}
          </ul>
          {outcome && (
            <div
              role="status"
              data-testid="marks-review-outcome"
              className="mt-3 space-y-1 text-sm text-slate-700"
            >
              <p>
                Engraved {outcome.engraved.length}
                {outcome.deleted.length ? `, deleted ${outcome.deleted.length}` : ''}.
              </p>
              {outcome.declined.map(({ annotation, reason }) => (
                <p key={annotation.id} className="text-xs text-amber-700">
                  {describeMark(annotation)}: {reason} (kept as a mark)
                </p>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            {outcome && (
              <Button
                type="button"
                size="sm"
                data-testid="marks-review-undo"
                onClick={() => void review.undo(() => defaultCommandRegistry.run('edit.undo'))}
              >
                Undo engraving
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="primary"
              data-testid="marks-review-engrave"
              disabled={review.busy || (!toEngrave && !toDelete)}
              onClick={() => void review.engrave()}
            >
              {toEngrave ? `Engrave ${toEngrave}` : 'Apply'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
