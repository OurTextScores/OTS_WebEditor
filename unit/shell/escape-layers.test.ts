import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ESCAPE_PRIORITY,
  closeTopEscapeLayer,
  hasEscapeLayer,
  pushEscapeLayer,
  resetEscapeLayersForTests,
} from '../../components/shell/keyboard/escapeLayers';

afterEach(resetEscapeLayersForTests);

describe('escape layers', () => {
  it('has nothing to close when no layer is open', () => {
    expect(hasEscapeLayer()).toBe(false);
    expect(closeTopEscapeLayer()).toBe(false);
  });

  it('closes the innermost layer first, in the written order', () => {
    const order: string[] = [];
    // Escape closes a layer but the layer's owner removes it, as it does when its state changes.
    // Pushed in an order that is not the priority order, so priority has to decide.
    for (const [name, priority] of Object.entries(ESCAPE_PRIORITY).reverse()) {
      const remove = pushEscapeLayer(priority, () => {
        order.push(name);
        remove();
      });
    }
    while (closeTopEscapeLayer());
    expect(order).toEqual(['gesture', 'gripEdit', 'palettes', 'noteInput']);
  });

  it('closes the newest of equal priority first', () => {
    const order: string[] = [];
    const first = pushEscapeLayer(10, () => {
      order.push('first');
      first();
    });
    const second = pushEscapeLayer(10, () => {
      order.push('second');
      second();
    });
    closeTopEscapeLayer();
    closeTopEscapeLayer();
    expect(order).toEqual(['second', 'first']);
  });

  it('forgets a layer that was removed', () => {
    const handler = vi.fn();
    const remove = pushEscapeLayer(10, handler);
    remove();
    expect(closeTopEscapeLayer()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
