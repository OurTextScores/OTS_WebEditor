import React from 'react';

type Bar = {
  anchorId: string;
  label: string;
  hasThread?: boolean;
  changeType?: 'added' | 'modified' | string;
};

type Props = {
  boxes: Array<{ bar: Bar; left: number; top: number; width: number; height: number }>;
  focusedAnchorId: string | null;
  anchorsWithThreads: { has: (anchorId: string) => boolean };
  canAddThread: boolean;
  setFocusedAnchorId: (anchorId: string | null) => void;
  setNewThreadAnchorId: (anchorId: string | null) => void;
  setNewThreadContent: (content: string) => void;
};

/** One clickable box per bar while a change review is open: coloured by what changed, focused to comment on it. */
export function ChangeReviewBarOverlay({
  boxes,
  focusedAnchorId,
  anchorsWithThreads,
  canAddThread,
  setFocusedAnchorId,
  setNewThreadAnchorId,
  setNewThreadContent,
}: Props) {
  return (
    <>
      {boxes.map(({ bar, left, top, width, height }) => {
        const selected = focusedAnchorId === bar.anchorId;
        const hasThread = bar.hasThread || anchorsWithThreads.has(bar.anchorId);
        const changedClasses = hasThread
          ? 'border-emerald-500 bg-emerald-300/30'
          : bar.changeType === 'added'
            ? 'border-emerald-500 bg-emerald-200/20'
            : bar.changeType === 'modified'
              ? 'border-amber-500 bg-amber-200/20'
              : 'border-transparent bg-transparent hover:border-sky-400 hover:bg-sky-100/20';
        return (
          <button
            key={bar.anchorId}
            type="button"
            aria-label={`Comment on ${bar.label}`}
            aria-pressed={selected}
            className={`absolute z-20 cursor-pointer border-2 transition-colors ${changedClasses} ${selected ? 'ring-2 ring-sky-500 ring-offset-1' : ''}`}
            style={{
              left,
              top,
              width,
              height,
              ...(hasThread
                ? {
                    backgroundColor: 'rgba(16, 185, 129, 0.35)',
                    borderColor: 'rgb(5, 150, 105)',
                  }
                : {}),
            }}
            onClick={(event) => {
              event.stopPropagation();
              const nowFocused = focusedAnchorId !== bar.anchorId;
              setFocusedAnchorId(nowFocused ? bar.anchorId : null);
              if (nowFocused && !hasThread && canAddThread) {
                setNewThreadAnchorId(bar.anchorId);
              } else {
                setNewThreadAnchorId(null);
              }
              setNewThreadContent('');
            }}
          />
        );
      })}
    </>
  );
}
