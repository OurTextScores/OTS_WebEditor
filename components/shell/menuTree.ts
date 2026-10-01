import type { CommandRegistry } from '../../lib/commands/registry';
import type { MenuNode } from './menus';

/**
 * Drops what the registry cannot run, so a menu never shows an entry for a command that is
 * not registered in the current mode: items and families without a registration, submenus
 * left empty, and separators that would then lead, trail or double up.
 *
 * The tree is data and the registry is the authority (§5.3). Entries for commands that
 * arrive in later phases (Instruments, Status Bar) are simply absent until then.
 */
export function pruneMenuNodes(nodes: readonly MenuNode[], registry: CommandRegistry): MenuNode[] {
  const kept: MenuNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'item' || node.kind === 'family') {
      if (registry.has(node.id)) kept.push(node);
    } else if (node.kind === 'recentScores') {
      if (registry.has('file.openRecent')) kept.push(node);
    } else if (node.kind === 'submenu') {
      const children = pruneMenuNodes(node.children, registry);
      if (children.length > 0) kept.push({ ...node, children });
    } else {
      kept.push(node);
    }
  }
  // Collapse separators: none first, none last, never two in a row.
  const result: MenuNode[] = [];
  for (const node of kept) {
    if (node.kind === 'separator') {
      if (result.length === 0 || result[result.length - 1].kind === 'separator') continue;
    }
    result.push(node);
  }
  while (result.length > 0 && result[result.length - 1].kind === 'separator') result.pop();
  return result;
}
