// Rollup replaces this optional build-time constant. Keep its declaration in source because clean:d-ts
// removes generated declaration files; consumers of the generated SDK never evaluate this constant.
export {};
declare global {
    const MSCORE_RESOURCE_BASEURL: string | undefined;
}
