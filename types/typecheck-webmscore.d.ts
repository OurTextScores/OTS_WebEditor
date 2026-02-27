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
