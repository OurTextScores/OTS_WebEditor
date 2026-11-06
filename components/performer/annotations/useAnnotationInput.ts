import { useRef, useState } from 'react';
import { newAnnotationId, type Annotation } from './annotationModel';
import { INK, type AnnotationTool } from './annotationTools';
import { drawnOnPage, hits } from './annotationPlacement';
import { anchorAt, toSpaces, type PageGeometry } from './pageGeometry';

type Point = { x: number; y: number; pressure: number };

export interface AnnotationInputOptions {
  readonly geometry: PageGeometry | null;
  readonly page: number;
  /** The Play-through view's playing order (bar i is written bar [i]), or null in the written view. */
  readonly playedBars: readonly number[] | null;
  readonly annotations: readonly Annotation[];
  readonly tool: AnnotationTool;
  readonly stamp: string;
  readonly color: string;
  readonly drawWithFinger: boolean;
  readonly scoreKey: string;
  readonly scorePart: number;
  readonly add: (annotation: Annotation) => unknown;
  readonly remove: (annotation: Annotation) => unknown;
  /** Asks for a text annotation's words at a screen point; `place` adds it with them. */
  readonly askText: (
    at: { clientX: number; clientY: number },
    place: (text: string) => void,
  ) => void;
}

/** A pointer that draws: the Pencil and a mouse always, a finger only with "draw with finger". */
const draws = (event: React.PointerEvent, drawWithFinger: boolean) =>
  event.pointerType === 'pen' || event.pointerType === 'mouse' || drawWithFinger;

/**
 * Pointer input in annotate mode: a stroke with the pen or highlighter, the eraser over marks, a tap that places a
 * stamp or text. Marks are anchored where they start (Play-through: to the written bar of that occurrence).
 */
export function useAnnotationInput(options: AnnotationInputOptions) {
  const stroke = useRef<Point[] | null>(null);
  const [live, setLive] = useState<{
    path: string;
    color: string;
    width: number;
    opacity: number;
  } | null>(null);

  /** A pointer position in page units, through the annotation overlay's own transform (its viewBox is the page). */
  const toPage = (event: React.PointerEvent): Point | null => {
    const overlay = (event.currentTarget as HTMLElement).querySelector<SVGSVGElement>(
      '[data-testid="annotation-layer"]',
    );
    const matrix = overlay?.getScreenCTM();
    if (!overlay || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y, pressure: event.pressure || 0.5 };
  };

  const spaceGuess = () => {
    const band = options.geometry?.bands.find((candidate) => candidate.page === options.page);
    return band ? band.height / 4 : 10;
  };

  const erase = (point: Point) => {
    if (!options.geometry) return;
    const target = drawnOnPage(
      options.annotations,
      options.geometry,
      options.page,
      options.playedBars,
    ).find((drawn) => hits(drawn, point.x, point.y));
    if (target) void options.remove(target.annotation);
  };

  /** The anchor for a mark starting at `point`: in Play-through, the written bar of that occurrence. */
  const anchorFor = (point: Point, withTick: boolean) => {
    const found = options.geometry
      ? anchorAt(options.geometry, options.page, point.x, point.y, withTick)
      : null;
    if (!found) return null;
    const bar = options.playedBars ? options.playedBars[found.anchor.bar] : found.anchor.bar;
    if (bar === undefined) return null;
    return { anchor: { ...found.anchor, bar }, placement: found.placement };
  };

  const base = (kind: Annotation['kind']) => ({
    id: newAnnotationId(),
    scoreKey: options.scoreKey,
    scorePart: options.scorePart,
    kind,
    createdAt: Date.now(),
  });

  const onPointerDown = (event: React.PointerEvent) => {
    if (!draws(event, options.drawWithFinger)) return;
    const point = toPage(event);
    if (!point) return;
    if (options.tool === 'text') {
      // The text box opens here: keep the tap from moving focus to the page (it would close the box at once)
      event.preventDefault();
    } else {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (options.tool === 'eraser') {
      stroke.current = [point];
      erase(point);
      return;
    }
    if (options.tool === 'stamp' || options.tool === 'text') {
      const found = anchorFor(point, true);
      if (!found) return;
      const [dx, dy] = toSpaces(found.placement, point.x, point.y);
      const kind = options.tool;
      const place = (content: string) =>
        void options.add({
          ...base(kind),
          anchor: found.anchor,
          points: [[dx, dy, 1]],
          style: { color: options.color, width: 0, opacity: 1 },
          content,
        });
      if (kind === 'stamp') place(options.stamp);
      else options.askText({ clientX: event.clientX, clientY: event.clientY }, place);
      return;
    }
    stroke.current = [point];
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!stroke.current || !draws(event, options.drawWithFinger)) return;
    const native = event.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    const samples = native.getCoalescedEvents?.().length ? native.getCoalescedEvents() : [native];
    for (const sample of samples) {
      const point = toPage({
        ...event,
        clientX: sample.clientX,
        clientY: sample.clientY,
        pressure: sample.pressure,
      } as React.PointerEvent);
      if (!point) continue;
      if (options.tool === 'eraser') erase(point);
      else stroke.current.push(point);
    }
    if (options.tool === 'pen' || options.tool === 'highlighter') {
      const ink = INK[options.tool];
      setLive({
        path: stroke.current
          .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' '),
        color: options.color,
        width: ink.width * spaceGuess(),
        opacity: ink.opacity,
      });
    }
  };

  const onPointerUp = () => {
    const points = stroke.current;
    stroke.current = null;
    setLive(null);
    if (!points || (options.tool !== 'pen' && options.tool !== 'highlighter')) return;
    const found = anchorFor(points[0], false);
    if (!found) return;
    const ink = INK[options.tool];
    void options.add({
      ...base('ink'),
      anchor: found.anchor,
      points: points.map((p) => {
        const [dx, dy] = toSpaces(found.placement, p.x, p.y);
        return [
          Number(dx.toFixed(3)),
          Number(dy.toFixed(3)),
          Number(p.pressure.toFixed(2)),
        ] as const;
      }),
      style: { color: options.color, width: ink.width, opacity: ink.opacity },
    });
  };

  return { onPointerDown, onPointerMove, onPointerUp, live };
}
