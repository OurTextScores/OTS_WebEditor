
// The main entry point inside a Web Worker

import WebMscore from './index.js'

const SVG_UTF8_RESULT_KEY = '__webmscoreSvgUtf8'

/** @type {WebMscore} */
let score

/**
 * @typedef {{ id: number; method: Exclude<keyof import('./index').default, 'scoreptr' | 'excerptId'> | 'load' | 'ready' | 'setLogLevel'; params: any[]; }} RPCReq
 * @typedef {{ id: number; result?: any; error?: any; }} RPCRes
 * @param {number} id 
 * @param {any} result 
 * @param {Transferable[]} transfer
 */
const rpcRes = (id, result, transfer = undefined) => {
    /** @type {RPCRes} */
    const res = {
        id,
        result,
    }
    self.postMessage(res, transfer)
}

/**
 * @param {number} id 
 * @param {Error} err 
 */
const rpcErr = (id, err) => {
    /** @type {RPCRes} */
    const res = {
        id,
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack,
        },
    }
    self.postMessage(res)
}

/**
 * @typedef {import('../schemas').SynthRes | Uint8Array | undefined} Res
 * @param {Res | Res[]} obj 
 * @returns {Transferable[] | undefined}
 */
const getTransferable = (obj) => {
    if (!obj) return
    if (Array.isArray(obj)) {
        return obj.reduce((p, c) => p.concat(getTransferable(c)), []).filter(Boolean)
    } else if (obj instanceof Uint8Array) {
        return [obj.buffer]
    } else if (obj.chunk instanceof Uint8Array) {
        return [obj.chunk.buffer]
    }
}

self.onmessage = async (e) => {
    /** @type {RPCReq} */
    const req = e.data  // JSON-RPC
    const { id, method, params } = req

    try {
        switch (method) {
            case 'ready':
                await WebMscore.ready
                rpcRes(id, 'done')
                break

            case 'load':
                await WebMscore.ready
                score = await WebMscore.load.apply(undefined, params)
                rpcRes(id, 'done')
                break;

            case 'setLogLevel':
                await WebMscore.setLogLevel.apply(undefined, params)
                rpcRes(id, 'done')
                break

            default:
                if (!score) { rpcErr(id, new Error('Score not loaded')) }
                if (method === 'saveSvg' || method === 'savePng') {
                    console.info(`[webmscore-worker] ${method}:start`, { id, params })
                }
                if (method === 'saveSvg' && typeof score.saveSvgRaw === 'function') {
                    const svgBytes = await score.saveSvgRaw.apply(score, params)
                    if (method === 'saveSvg' || method === 'savePng') {
                        console.info(`[webmscore-worker] ${method}:done`, {
                            id,
                            resultType: typeof svgBytes,
                            resultLength: svgBytes?.length ?? null,
                        })
                    }
                    rpcRes(id, { [SVG_UTF8_RESULT_KEY]: svgBytes }, [svgBytes.buffer])
                    break
                }
                const result = await score[method].apply(score, params)
                if (method === 'saveSvg' || method === 'savePng') {
                    console.info(`[webmscore-worker] ${method}:done`, {
                        id,
                        resultType: typeof result,
                        resultLength: typeof result === 'string' ? result.length : (result?.length ?? null),
                    })
                }
                if (method === 'saveSvg' && typeof result === 'string') {
                    // Transfer UTF-8 bytes instead of a giant JS string payload.
                    // This reduces structured-clone overhead for large pages.
                    const encoded = new TextEncoder().encode(result)
                    rpcRes(id, { [SVG_UTF8_RESULT_KEY]: encoded }, [encoded.buffer])
                } else {
                    rpcRes(id, result, getTransferable(result))
                }
        }
    } catch (err) {
        rpcErr(id, err)
    }
}
