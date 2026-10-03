export const parseSvgNumeric = (value: string | null) => {
  if (!value || value.includes('%')) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getSvgNaturalSize = (svg: SVGSVGElement, zoomValue: number) => {
  const widthAttr = parseSvgNumeric(svg.getAttribute('width'));
  const heightAttr = parseSvgNumeric(svg.getAttribute('height'));
  let width = widthAttr ?? null;
  let height = heightAttr ?? null;
  if ((!width || !height) && svg.getAttribute('viewBox')) {
    const parts = svg
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value));
    if (parts && parts.length === 4) {
      width = width ?? (Number.isFinite(parts[2]) ? parts[2] : null);
      height = height ?? (Number.isFinite(parts[3]) ? parts[3] : null);
    }
  }
  if (!width || !height) {
    const rect = svg.getBoundingClientRect();
    if (zoomValue > 0) {
      width = width ?? rect.width / zoomValue;
      height = height ?? rect.height / zoomValue;
    }
  }
  if (!width || !height) {
    return null;
  }
  return { width, height };
};
