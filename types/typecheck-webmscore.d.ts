declare module 'webmscore' {
  const WebMscore: {
    ready: Promise<void>;
    load: (...args: unknown[]) => Promise<unknown>;
  };
  export default WebMscore;
}

declare module '*webmscore-fork/web-public/src/index.js' {
  const inProcessWebMscore: {
    ready: Promise<void>;
    load: (...args: unknown[]) => Promise<unknown>;
  };
  export default inProcessWebMscore;
}

declare module '*webmscore-fork/web-public/webmscore.webpack.mjs' {
  const webMscoreWebpackModule: {
    ready: Promise<void>;
    load: (...args: unknown[]) => Promise<unknown>;
  };
  export default webMscoreWebpackModule;
}

declare module '*webmscore-fork/web-public/src/nodejs.js' {
  const nodejsWebMscore: {
    ready: Promise<void>;
    load: (...args: unknown[]) => Promise<unknown>;
  };
  export default nodejsWebMscore;
}
