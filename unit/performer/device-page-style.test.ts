import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAFF_SPACE_PX,
  devicePageStyle,
  orientationOf,
  stepStaffScale,
} from '../../components/performer/session/devicePageStyle';

describe('layout for the device (performer mode)', () => {
  it('gives the page the screen shape, at 96 CSS pixels to the inch', () => {
    const style = devicePageStyle({ width: 1180, height: 820 }, 1)!;
    expect(style.pageWidth).toBeCloseTo(1180 / 96);
    expect(style.pageHeight).toBeCloseTo(820 / 96);
    // The printable width leaves the side margins
    expect(style.pagePrintableWidth).toBeCloseTo((1180 - 48) / 96);
    expect(style.pageTwosided).toBe(false);
  });

  it('sets the staff space in the engine units (1/1200 inch) from the chosen scale', () => {
    const plain = devicePageStyle({ width: 820, height: 1180 }, 1)!;
    expect(plain.spatium).toBeCloseTo((DEFAULT_STAFF_SPACE_PX * 1200) / 96);
    const larger = devicePageStyle({ width: 820, height: 1180 }, 1.4)!;
    expect(Number(larger.spatium) / Number(plain.spatium)).toBeCloseTo(1.4);
    // A nonsense scale is the default
    expect(devicePageStyle({ width: 820, height: 1180 }, Number.NaN)!.spatium).toBeCloseTo(
      Number(plain.spatium),
    );
  });

  it('keeps the score layout for a viewport too small to lay out for', () => {
    expect(devicePageStyle({ width: 120, height: 900 }, 1)).toBeNull();
    expect(devicePageStyle({ width: 0, height: 0 }, 1)).toBeNull();
  });

  it('steps the staff scale and stays at either end; tells the orientation', () => {
    expect(stepStaffScale(1, 1)).toBe(1.1);
    expect(stepStaffScale(1, -1)).toBe(0.9);
    expect(stepStaffScale(2, 1)).toBe(2);
    expect(stepStaffScale(0.7, -1)).toBe(0.7);
    expect(orientationOf({ width: 1180, height: 820 })).toBe('landscape');
    expect(orientationOf({ width: 820, height: 1180 })).toBe('portrait');
  });
});
