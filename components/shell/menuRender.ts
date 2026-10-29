import type * as Menubar from '@radix-ui/react-menubar';
import type { CommandRegistry } from '../../lib/commands/registry';
import type { CommandContext } from '../../lib/commands/types';

/**
 * The parts of a Radix menu a command tree renders into. Menubar and DropdownMenu share them,
 * so the menu bar and the score's context menu draw the same tree the same way.
 */
export interface MenuPrimitives {
  readonly Item: typeof Menubar.Item;
  readonly CheckboxItem: typeof Menubar.CheckboxItem;
  readonly ItemIndicator: typeof Menubar.ItemIndicator;
  readonly Separator: typeof Menubar.Separator;
  readonly Sub: typeof Menubar.Sub;
  readonly SubTrigger: typeof Menubar.SubTrigger;
  readonly SubContent: typeof Menubar.SubContent;
  readonly Portal: typeof Menubar.Portal;
}

export interface MenuRenderContext {
  readonly registry: CommandRegistry;
  readonly ctx: CommandContext;
  readonly primitives: MenuPrimitives;
  /** Classes of a submenu's popup; the menu's own popup is the caller's. */
  readonly contentClass: string;
  /** `menu` gives `menu-item-<id>` / `menu-sub-<label>`. */
  readonly testIdPrefix: string;
  /**
   * Add a relabelled item's label to its test id. The context menu names one command more than
   * once (Insert Measures ▸ After / Before …); the menu bar never does and keeps its ids.
   */
  readonly labelledTestIds?: boolean;
}

export const menuItemClass =
  'flex cursor-pointer select-none items-center justify-between gap-6 rounded px-3 py-1 outline-none data-[highlighted]:bg-accent-soft data-[disabled]:pointer-events-none data-[disabled]:text-slate-400';

export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
