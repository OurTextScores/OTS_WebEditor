// Browser-side RPC diagnostics. These describe transport latency (including time
// queued in the worker), not native execution time. Never retain arguments or results.
const MAX_RECENT = 200
const SLOW_MS = 15_000
const SVG_UTF8_RESULT_KEY = '__webmscoreSvgUtf8'
const svgTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null
const pendingByWorker = new WeakMap()

class WorkerError extends Error {
    constructor(err) {
        super(err.message)
        this.name = err.name
        this.originalStack = err.stack
    }
}

function diagnosticStore() {
    if (typeof window === 'undefined') return null
    return window.__webmscoreRpcDiagnostics ||= { pending: {}, recent: [] }
}

/** Send one request, recording end-to-end timing and rejecting on worker failures. */
export function sendWorkerRpc(worker, method, params = [], transfer = []) {
    const id = Math.random()
    const store = diagnosticStore()
    const record = { id, method, startedAt: Date.now(), endedAt: null, elapsedMs: null, status: 'pending' }
    if (store) store.pending[id] = record
    const timer = setTimeout(() => {
        console.warn('[webmscore-rpc] operation still pending', { id, method, elapsedMs: Date.now() - record.startedAt })
    }, SLOW_MS)

    return new Promise((resolve, reject) => {
        const cleanup = (status, error) => {
            clearTimeout(timer)
            const pending = pendingByWorker.get(worker)
            pending?.delete(cancel)
            if (pending?.size === 0) pendingByWorker.delete(worker)
            worker.removeEventListener('message', onMessage)
            worker.removeEventListener('error', onError)
            worker.removeEventListener('messageerror', onMessageError)
            record.endedAt = Date.now()
            record.elapsedMs = record.endedAt - record.startedAt
            record.status = status
            if (error) record.errorName = error.name || 'Error'
            if (store) {
                delete store.pending[id]
                store.recent.push(record)
                if (store.recent.length > MAX_RECENT) store.recent.splice(0, store.recent.length - MAX_RECENT)
            }
        }
        const onMessage = (event) => {
            const data = event.data
            if (!data || data.id !== id) return
            if (data.error) {
                const error = new WorkerError(data.error)
                cleanup('error', error)
                reject(error)
                return
            }
            let result = data.result
            if (method === 'saveSvg' && result && typeof result === 'object') {
                const encoded = result[SVG_UTF8_RESULT_KEY]
                if (encoded instanceof Uint8Array && svgTextDecoder) result = svgTextDecoder.decode(encoded)
            }
            cleanup('success')
            resolve(result)
        }
        const onError = (event) => {
            const error = new Error(`WebMscore worker failed during ${method}: ${event.message || 'unknown worker error'}`)
            cleanup('worker-error', error)
            reject(error)
        }
        const onMessageError = () => {
            const error = new Error(`WebMscore worker message could not be decoded during ${method}`)
            cleanup('message-error', error)
            reject(error)
        }
        const cancel = () => {
            const error = new Error(`WebMscore worker terminated during ${method}`)
            cleanup('terminated', error)
            reject(error)
        }
        let pending = pendingByWorker.get(worker)
        if (!pending) { pending = new Set(); pendingByWorker.set(worker, pending) }
        pending.add(cancel)
        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', onError)
        worker.addEventListener('messageerror', onMessageError)
        try {
            worker.postMessage({ id, method, params }, transfer)
        } catch (error) {
            cleanup('send-error', error)
            reject(error)
        }
    })
}

/** Reject pending calls before deliberately terminating a worker. */
export function cancelWorkerRpcs(worker) {
    for (const cancel of pendingByWorker.get(worker) || []) cancel()
}
