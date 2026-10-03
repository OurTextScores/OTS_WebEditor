export type SelectionBox = {
  index: number | null;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  centerX: number;
  centerY: number;
  classes?: string;
  isMeasureBbox?: boolean;
};

export type SelectionGeometryBox = {
  index?: number | null;
  page?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
  classes?: string;
};

export type SelectionFallback = {
  index: number | null;
  point: { page: number; x: number; y: number };
} | null;

export type NoteInputCursorRect = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  voice: number;
};
