import {
  BINDINGS,
  comboMatches,
  eventToCombo,
  parseKeys,
  type Binding,
  type KeyContext,
} from '../../../lib/commands/bindings';
import type { CommandRegistry } from '../../../lib/commands/registry';
import { invokeCommand } from '../invokeCommand';

type KeyEventLike = Pick<
  KeyboardEvent,
  | 'key'
  | 'ctrlKey'
  | 'metaKey'
  | 'shiftKey'
  | 'altKey'
  | 'defaultPrevented'
  | 'isComposing'
  | 'target'
  | 'preventDefault'
  | 'getModifierState'
>;

const isTextField = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
};

/** A control that already means something for Space or Enter: a focused button is not the canvas. */
const isActivatable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  Boolean(
    target.closest('button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"]'),
  );

/** A dialog or menu owns the keyboard while it is open; only the palette key gets through. */
const overlayOpen = (): boolean =>
  typeof document !== 'undefined' &&
  Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'));

/** Contexts to try, most specific first, for the editor's current state. */
export function activeContexts(mode: string, noteInput: boolean): KeyContext[] {
  // A compare pane's editing keys are the compare policy's (see compare-keyboard-policy.ts).
  if (mode === 'compare') return ['global'];
  return [noteInput ? 'noteInput' : 'normal', 'edit', 'global'];
}

const PARSED = new WeakMap<Binding, ReturnType<typeof parseKeys>>();
const combo = (binding: Binding) => {
  let parsed = PARSED.get(binding);
  if (!parsed) {
    parsed = parseKeys(binding.keys);
    PARSED.set(binding, parsed);
  }
  return parsed;
};

/**
 * The one place a keydown becomes a command. Returns whether the key was taken.
 *
 * A binding runs its command only if the command is registered and enabled; a disabled
 * command leaves the key to the browser, unless the binding says to swallow it (Ctrl+S,
 * Ctrl+Z, ...: the browser's own action is never what the user meant).
 */
export function routeKeydown(
  event: KeyEventLike,
  registry: CommandRegistry,
  bindings: readonly Binding[] = BINDINGS,
): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  // On Windows AltGr arrives as Ctrl+Alt; those are typed characters, not shortcuts.
  if (event.getModifierState?.('AltGraph')) return false;

  const pressed = eventToCombo(event);
  const context = registry.getContext();
  const contexts = activeContexts(context.mode, context.noteInput);
  const inField = isTextField(event.target) || overlayOpen();
  const plainActivation = (pressed.key === 'Space' || pressed.key === 'Enter') && !pressed.mod;

  for (const active of contexts) {
    for (const binding of bindings) {
      if (binding.context !== active || !comboMatches(combo(binding), pressed)) continue;
      if (inField && !binding.inTextFields) continue;
      if (plainActivation && isActivatable(event.target)) continue;

      if (binding.swallow) {
        event.preventDefault();
        return true;
      }
      const id = binding.commandId;
      if (!id || !registry.has(id)) continue;
      if (!registry.isEnabled(id, context)) {
        if (binding.swallowWhenDisabled) {
          event.preventDefault();
          return true;
        }
        continue;
      }
      event.preventDefault();
      void invokeCommand(id, binding.arg, registry);
      return true;
    }
  }
  return false;
}
