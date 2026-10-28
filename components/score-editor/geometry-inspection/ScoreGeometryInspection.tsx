import { useSyncExternalStore, type MutableRefObject, type RefObject } from 'react';
import type { Score } from '@/lib/webmscore-loader';
import { svgScreenMapping } from '@/lib/svg-screen-matrix';
import { useScoreGeometryInspection } from './useScoreGeometryInspection';

type Props = {
  score: Score | null;
  page: number;
  containerRef: RefObject<HTMLDivElement | null>;
  installGenerationRef: MutableRefObject<number>;
  scoreWrapperRef: RefObject<HTMLDivElement | null>;
};

/** Opt-in developer diagnostic; the box and status never intercept canvas input. */
const subscribe = () => () => {};
const enabledInBrowser = () => new URLSearchParams(window.location.search).get('inspectGeometry') === '1';
const disabledOnServer = () => false;

export function ScoreGeometryInspection(props: Props) {
  const enabled = useSyncExternalStore(subscribe, enabledInBrowser, disabledOnServer);
  return enabled ? <ActiveScoreGeometryInspection {...props} /> : null;
}

function ActiveScoreGeometryInspection(props: Props) {
  const inspection = useScoreGeometryInspection(props);
  const hit = inspection.status === 'result' ? inspection.hit : null;
  const geometry = hit?.status === 'ok' && hit.geometry?.page === props.page ? hit.geometry : null;
  const svg = props.containerRef.current?.querySelector('svg');
  const wrapper = props.scoreWrapperRef.current;
  const mapping = svg ? svgScreenMapping(svg) : null;
  const wrapperRect = wrapper?.getBoundingClientRect();
  const scale = wrapper && wrapperRect && wrapper.offsetWidth ? wrapperRect.width / wrapper.offsetWidth : 0;
  const toOverlay = (x: number, y: number) => {
    if (!mapping || !wrapperRect || !scale) return null;
    const point = mapping.toClient(x, y);
    return { x: (point.x - wrapperRect.left) / scale, y: (point.y - wrapperRect.top) / scale };
  };
  const start = geometry && toOverlay(geometry.x, geometry.y);
  const end = geometry && toOverlay(geometry.x + geometry.width, geometry.y + geometry.height);
  const message = hit?.status === 'ok'
    ? `${hit.kind} · page ${props.page + 1} · measure index ${hit.location.measureIndex ?? '?'} · staff index ${hit.location.staffIndex ?? '?'} · voice index ${hit.location.voiceIndex} · v${hit.schemaVersion} snapshot`
    : hit ? hit.status : inspection.status;
  return (
    <>
      {start && end && (
        <div data-testid="geometry-inspection-box" className="pointer-events-none absolute z-40 border-2 border-fuchsia-600 bg-fuchsia-500/15"
          style={{ left: start.x, top: start.y, width: end.x - start.x, height: end.y - start.y }} />
      )}
      <div data-testid="geometry-inspection-status" data-status={hit?.status ?? inspection.status}
        className="pointer-events-none absolute left-0 top-0 z-40 bg-slate-950/90 px-2 py-1 text-xs text-white">
        Geometry inspection: {message} (Alt+Shift + hover)
      </div>
    </>
  );
}
