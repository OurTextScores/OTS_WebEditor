// Lets `node` run the app's TypeScript modules directly (scripts/eval-read-marks.mts): an import without an extension
// that does not resolve is retried as `.ts`, then `.tsx`. Use with: node --import ./scripts/ts-resolve-hook.mjs …
import { register } from 'node:module';

register(
  `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (!/^\\.{1,2}\\//.test(specifier) || /\\.[cm]?[jt]sx?$/.test(specifier)) throw error;
    for (const extension of ['.ts', '.tsx']) {
      try {
        return await next(specifier + extension, context);
      } catch {}
    }
    throw error;
  }
}`)}`,
  import.meta.url,
);
