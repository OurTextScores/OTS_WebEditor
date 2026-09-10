const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'app', 'api');
const hiddenApiDir = path.join(root, 'app', '_api_embed_build');

if (fs.existsSync(hiddenApiDir)) {
  if (fs.existsSync(apiDir)) {
    throw new Error(`Cannot prepare embed build: both ${apiDir} and ${hiddenApiDir} exist`);
  }
  fs.renameSync(hiddenApiDir, apiDir);
}

if (!fs.existsSync(apiDir)) {
  throw new Error(`Cannot prepare embed build: ${apiDir} does not exist`);
}

/**
 * Build from scratch, every time.
 *
 * Tailwind's stylesheet is generated from a scan of the source, and an
 * incremental Next build can reuse a cached one that predates the components it
 * is shipped with. That is not a slow build, it is a wrong one: the embed went
 * out with `bg-cyan-600` and `cursor-crosshair` simply absent, so the merge
 * editor's selected engine button rendered white text on a white background.
 * A missing class fails silently and looks like a design choice, which is
 * exactly the kind of bug worth paying a minute of build time to make
 * impossible.
 */
fs.rmSync(path.join(root, '.next'), { recursive: true, force: true });

let result;
try {
  // Static embeds call APIs through NEXT_PUBLIC_SCORE_EDITOR_API_BASE; they must
  // not export the server-only route handlers bundled with a normal deployment.
  fs.renameSync(apiDir, hiddenApiDir);
  result = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: {
      ...process.env,
      NEXT_PUBLIC_BUILD_MODE: 'embed',
      BUILD_MODE: 'embed',
      NEXT_PUBLIC_SCORE_EDITOR_API_BASE: '/api/score-editor',
      // Default CDN soundfont; override by setting NEXT_PUBLIC_SOUNDFONT_CDN_URL in the environment.
      NEXT_PUBLIC_SOUNDFONT_CDN_URL:
        process.env.NEXT_PUBLIC_SOUNDFONT_CDN_URL ||
        'https://cdn.ourtextscores.com/soundfonts/default.sf3',
    },
    stdio: 'inherit',
  });
} finally {
  if (fs.existsSync(hiddenApiDir)) {
    fs.renameSync(hiddenApiDir, apiDir);
  }
}

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
