// Layout oracle (DECISIONS.md item 9): the bridge lays out only what endCmd/undo mark as changed, as desktop does.
// With MS47_LAYOUT_ORACLE=1 every loaded score is wrapped: after each call that moves the undo index (every command,
// undo and redo), all pages are drawn, the score is fully relaid out, and drawn again. Any difference means the
// incremental layout left something stale; it is recorded against the call that caused it.

const MAX_PAGES = 6;
const MAX_EXCERPTS = 8;
// Calls that cannot change layout; everything else is checked (MS47_LAYOUT_ORACLE=all), or only calls that move the
// undo index (MS47_LAYOUT_ORACLE=1)
const READ_ONLY = /^(get|save|is|has|list|load|measure|segment|staff|npages|playback|synth|process|selection|layoutUntil|version|relayout|metadata|measureLineBreaks|setLogLevel|setSoundFont|addFont|generateExcerpts|setExcerptId|title|subtitle|composer|poet|lyricist)/;

export function installLayoutOracle(WebMscore) {
  const findings = new Map();   // method -> { calls, stale, examples }
  const load = WebMscore.load.bind(WebMscore);
  // Every linked score: the full score (-1) and each generated part, so an edit that leaves a part stale is caught
  const pages = async score => {
    const current = score.excerptId, out = [];
    try {
      for (let excerpt = -1; excerpt < MAX_EXCERPTS; excerpt++) {
        await score.setExcerptId(excerpt);
        let count;
        try { count = Math.min(await score.npages(), MAX_PAGES); } catch { break; }   // no such excerpt
        for (let page = 0; page < count; page++) out.push(await score.saveSvg(page));
      }
    } finally { await score.setExcerptId(current); }
    return out;
  };
  WebMscore.load = async (...args) => {
    const score = await load(...args);
    return new Proxy(score, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function' || typeof prop !== 'string' || prop === 'getUndoInfo' || prop === 'destroy') return value;
        return async (...callArgs) => {
          const before = (await target.getUndoInfo().catch(() => null))?.index;
          const result = await value.apply(target, callArgs);
          const after = (await target.getUndoInfo().catch(() => null))?.index;
          const moved = before !== undefined && after !== undefined && before !== after;
          if (moved || (process.env.MS47_LAYOUT_ORACLE === 'all' && !READ_ONLY.test(prop))) {
            const entry = findings.get(prop) ?? { calls: 0, stale: 0, examples: [] };
            findings.set(prop, entry);
            entry.calls++;
            const incremental = await pages(target);
            {   // full layout of every linked score (relayout from the full score lays out all of them)
              const current = target.excerptId;
              await target.setExcerptId(-1);
              await target.relayout();
              await target.setExcerptId(current);
            }
            const full = await pages(target);
            const differs = full.length !== incremental.length || full.some((svg, i) => svg !== incremental[i]);
            if (differs) {
              entry.stale++;
              if (entry.examples.length < 3) entry.examples.push({ args: JSON.stringify(callArgs).slice(0, 120), pages: [incremental.length, full.length] });
            }
          }
          return result;
        };
      },
    });
  };
  return {
    report() {
      const rows = [...findings.entries()].sort((a, b) => b[1].stale - a[1].stale || a[0].localeCompare(b[0]));
      const stale = rows.filter(([, e]) => e.stale > 0);
      console.log(`layout oracle: ${rows.reduce((n, [, e]) => n + e.calls, 0)} checked calls over ${rows.length} methods; ${stale.length} methods left stale layout`);
      for (const [name, e] of stale) console.log(`  STALE ${name}: ${e.stale}/${e.calls} ${JSON.stringify(e.examples)}`);
      return Object.fromEntries(rows.map(([name, e]) => [name, { calls: e.calls, stale: e.stale }]));
    },
  };
}
