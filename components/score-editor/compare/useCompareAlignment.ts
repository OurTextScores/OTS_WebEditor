import { type CompareViewState, type PartAlignment } from './compare-types';
import React, { useEffect } from 'react';
import { type Score } from '../../../lib/webmscore-loader';
import { type PartSummary } from '../editor-types';
import { extractMeasureSignaturesFromXml, getScoreMscxText } from '../musicxml';
import { fetchMeasureSignatures } from '../score-measures';
import { buildLcsAlignment, buildIndexAlignment } from '../alignment';

export type CompareAlignmentContext = {
  compareView: CompareViewState | null;
  isSuppliedRegionsMode: boolean;
  setCompareAlignments: React.Dispatch<React.SetStateAction<PartAlignment[]>>;
  setCompareAlignmentLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCompareSignatures: React.Dispatch<
    React.SetStateAction<{ left: string[][]; right: string[][] } | null>
  >;
  compareLeftXml: string;
  compareRightXml: string;
  compareLeftScore: Score | null;
  compareRightScoreDisplay: Score | null;
  compareLeftParts: PartSummary[];
  compareRightPartsDisplay: PartSummary[];
  compareAlignmentRevision: number;
};

/** Aligns the two compare panes' parts measure by measure whenever either side changes, unless the caller supplied the differences itself. */
export function useCompareAlignment(ctx: CompareAlignmentContext) {
  const {
    compareView,
    isSuppliedRegionsMode,
    setCompareAlignments,
    setCompareAlignmentLoading,
    setCompareSignatures,
    compareLeftXml,
    compareRightXml,
    compareLeftScore,
    compareRightScoreDisplay,
    compareLeftParts,
    compareRightPartsDisplay,
    compareAlignmentRevision,
  } = ctx;

  useEffect(() => {
    // When a caller supplies the differences, the client diff is not merely
    // redundant — it is wrong here, and running it anyway would leave a
    // second, disagreeing answer available to anything that reads it.
    if (!compareView || isSuppliedRegionsMode) {
      setCompareAlignments([]);
      setCompareAlignmentLoading(false);
      setCompareSignatures(null);
      return;
    }

    let canceled = false;
    const loadAlignments = async () => {
      setCompareAlignmentLoading(true);
      try {
        let leftSignatures: string[][] = [];
        let rightSignatures: string[][] = [];
        let usedXml = false;
        try {
          if (compareLeftXml && compareRightXml) {
            leftSignatures = extractMeasureSignaturesFromXml(compareLeftXml);
            rightSignatures = extractMeasureSignaturesFromXml(compareRightXml);
            usedXml = true;
          } else if (compareLeftScore && compareRightScoreDisplay) {
            const [leftMscx, rightMscx] = await Promise.all([
              getScoreMscxText(compareLeftScore),
              getScoreMscxText(compareRightScoreDisplay),
            ]);
            if (leftMscx && rightMscx) {
              leftSignatures = extractMeasureSignaturesFromXml(leftMscx);
              rightSignatures = extractMeasureSignaturesFromXml(rightMscx);
              usedXml = true;
            }
          }
        } catch (err) {
          console.warn(
            'Failed to parse MusicXML for compare signatures; falling back to WASM.',
            err,
          );
        }

        if (!usedXml) {
          if (!compareLeftScore || !compareRightScoreDisplay) {
            setCompareAlignments([]);
            setCompareSignatures(null);
            return;
          }
          const partCount = Math.max(compareLeftParts.length, compareRightPartsDisplay.length, 1);
          leftSignatures = await Promise.all(
            Array.from({ length: partCount }, (_, index) =>
              fetchMeasureSignatures(compareLeftScore, index),
            ),
          );
          rightSignatures = await Promise.all(
            Array.from({ length: partCount }, (_, index) =>
              fetchMeasureSignatures(compareRightScoreDisplay, index),
            ),
          );
        }

        if (canceled) {
          return;
        }

        const partCount = Math.max(leftSignatures.length, rightSignatures.length, 1);
        const alignments: PartAlignment[] = Array.from({ length: partCount }, (_, index) => {
          const left = leftSignatures[index] ?? [];
          const right = rightSignatures[index] ?? [];
          if (left.length === 0 && right.length === 0) {
            return {
              partIndex: index,
              rows: [],
              strategy: 'index',
              lcsRatio: 0,
              leftCount: 0,
              rightCount: 0,
            };
          }

          const { rows, lcsRatio } = buildLcsAlignment(left, right);
          const strategy = rows.some((row) => row.match) ? 'lcs' : 'index';
          const alignedRows = strategy === 'lcs' ? rows : buildIndexAlignment(left, right);

          return {
            partIndex: index,
            rows: alignedRows,
            strategy,
            lcsRatio,
            leftCount: left.length,
            rightCount: right.length,
          };
        });

        setCompareAlignments(alignments);
        setCompareSignatures({ left: leftSignatures, right: rightSignatures });
      } catch (err) {
        console.error('Failed to compute compare alignment', err);
        if (!canceled) {
          setCompareAlignments([]);
          setCompareSignatures(null);
        }
      } finally {
        if (!canceled) {
          setCompareAlignmentLoading(false);
        }
      }
    };

    loadAlignments();
    return () => {
      canceled = true;
    };
  }, [
    compareView,
    isSuppliedRegionsMode,
    compareAlignmentRevision,
    compareLeftXml,
    compareRightXml,
    compareLeftParts.length,
    compareRightPartsDisplay.length,
    compareLeftScore,
    compareRightScoreDisplay,

    setCompareAlignmentLoading,
    setCompareAlignments,
    setCompareSignatures,
  ]);
}
