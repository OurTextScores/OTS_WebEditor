type ColorEffect = { color: string; priority: number };
type NodeState = {
  fill: string | null;
  stroke: string | null;
  effects: Map<string, ColorEffect>;
};

/** View-local SVG colors. Owners compose by priority, then lexicographic owner name. */
export class NoteColorEffects {
  private readonly nodes = new Map<SVGElement, NodeState>();
  private readonly owners = new Map<string, Set<SVGElement>>();

  set(owner: string, targets: Iterable<SVGElement>, effect: ColorEffect): void {
    const next = new Set(targets);
    const previous = this.owners.get(owner) ?? new Set<SVGElement>();
    const touched = new Set([...previous, ...next]);
    for (const node of touched) {
      let state = this.nodes.get(node);
      if (next.has(node)) {
        if (!state) {
          state = {
            fill: node.getAttribute('fill'),
            stroke: node.getAttribute('stroke'),
            effects: new Map(),
          };
          this.nodes.set(node, state);
        }
        state.effects.set(owner, effect);
      } else {
        state?.effects.delete(owner);
      }
      if (state) this.paint(node, state);
    }
    if (next.size) this.owners.set(owner, next);
    else this.owners.delete(owner);
  }

  clear(owner: string): void {
    this.set(owner, [], { color: '', priority: 0 });
  }

  dispose(): void {
    for (const owner of [...this.owners.keys()]) this.clear(owner);
  }

  private paint(node: SVGElement, state: NodeState): void {
    const winner = [...state.effects].sort(
      ([a, x], [b, y]) => y.priority - x.priority || (a < b ? -1 : a > b ? 1 : 0),
    )[0];
    if (winner) {
      node.setAttribute('fill', winner[1].color);
      node.setAttribute('stroke', winner[1].color);
      return;
    }
    for (const [name, value] of [
      ['fill', state.fill],
      ['stroke', state.stroke],
    ] as const) {
      if (value === null) node.removeAttribute(name);
      else node.setAttribute(name, value);
    }
    this.nodes.delete(node);
  }
}
