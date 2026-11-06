/**
 * The perform page's address with a query: `/perform?…` in the server build, `/score-editor/perform.html?…` in the
 * embed build (a static export under basePath /score-editor whose host serves the .html file; plain links and
 * window.location are not basePath-prefixed by Next, only <Link> and the router are). Same rule as the help link.
 */
export function performHref(
  query: Record<string, string | number | true> = {},
  embed = isEmbedBuild(),
): string {
  const search = Object.entries(query)
    .map(([key, value]) => (value === true ? key : `${key}=${encodeURIComponent(String(value))}`))
    .join('&');
  const path = embed ? '/score-editor/perform.html' : '/perform';
  return search ? `${path}?${search}` : path;
}

export const isEmbedBuild = () => process.env.NEXT_PUBLIC_BUILD_MODE === 'embed';
