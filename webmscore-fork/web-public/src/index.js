
// @ts-check

import {
    Module,
    RuntimeInitialized,
    getStrPtr,
    getTypedArrayPtr,
    WasmRes,
    freePtr,
} from './helper.js'


/** @see WebMscore.hasSoundfont */
let _hasSoundfont = false
/**
 * Don't turn off logs if already set log level before `WebMscore.load(...)` is called
 * @see WebMscore.setLogLevel
 */
let _hasLogLevelSet = false

class WebMscore {

    /**
     * This promise is resolved when the runtime is fully initialized
     * @returns {Promise<void>}
     */
    static get ready() {
        return RuntimeInitialized
    }

    /**
     * The maximum MSCZ/MSCX file format version supported by webmscore 
     * @returns {Promise<number>} e.g. `301`
     */
    static async version() {
        await WebMscore.ready
        return Module.ccall('version', 'number')
    }

    /**
     * Set log level
     * @param {0 | 1 | 2} level - See https://github.com/LibreScore/webmscore/blob/v1.0.0/src/framework/global/thirdparty/haw_logger/logger/log_base.h#L30-L33
     *  - 0: Off
     *  - 1: Normal (`ERRR` or `WARN` or `INFO`)
     *  - 2: Debug  (`DEBG`)
     * @returns {Promise<void>}
     */
    static async setLogLevel(level) {
        _hasLogLevelSet = true
        await WebMscore.ready
        return Module.ccall('setLogLevel', null, ['number'], [level])
    }

    /**
     * Set custom stdout instead of `console.log`  
     * Available before `WebMscore.ready`
     * @private Node.js exclusive
     * @param {(byte: number) => any} write
     */
    static set stdout(write) {
        Module.stdout = write
    }
    /** @private */
    static get stdout() {
        return Module.stdout
    }

    /**
     * Set custom stderr instead of `console.warn`  
     * Available before `WebMscore.ready`
     * @private Node.js exclusive
     * @param {(byte: number) => any} write
     * @example
     * ```js
     * WebMscore['stderr'] = function (byte) {
     *     process.stderr.write(new Uint8Array([byte]))
     * }
     * await WebMscore.ready
     * ```
     */
    static set stderr(write) {
        Module.stderr = write
    }
    /** @private */
    static get stderr() {
        return Module.stderr
    }

    /**
     * Load score data
     * @param {import('../schemas').InputFileFormat} format 
     * @param {Uint8Array} data 
     * @param {Uint8Array[] | Promise<Uint8Array[]>} fonts load extra font files (CJK characters support)
     * @param {boolean} doLayout set to false if you only need the score metadata or the midi file (Super Fast, 3x faster than the musescore software)
     * @returns {Promise<WebMscore>}
     */
    static async load(format, data, fonts = [], doLayout = true) {
        const [_fonts] = await Promise.all([
            fonts,
            WebMscore.ready
        ])

        for (const f of _fonts) {
            await WebMscore.addFont(f)
        }

        const fileformatptr = getStrPtr(format)
        const dataptr = getTypedArrayPtr(data)

        // get the pointer to the MasterScore class instance in C
        const resptr = Module.ccall('load',  // name of C function
            'number',  // return type
            ['number', 'number', 'number', 'boolean'],  // argument types
            [fileformatptr, dataptr, data.byteLength, doLayout]  // arguments
        )
        freePtr(fileformatptr)
        freePtr(dataptr)
        const scoreptr = WasmRes.readNum(resptr)

        if (!_hasLogLevelSet) {
            // turn off logs by default
            await WebMscore.setLogLevel(0);
        }

        const mscore = new WebMscore(scoreptr)
        return mscore
    }

    /**
     * Load (CJK) fonts on demand
     * @private
     * @param {string | Uint8Array} font
     *        * path to the font file in the virtual file system, or
     *        * the font file data
     * @returns {Promise<boolean>} success
     */
    static async addFont(font) {
        if (typeof font !== 'string') {
            const name = '' + Math.random()  // a random name
            // save the font data to the virtual file system
            Module['FS_createDataFile']('/fonts/', name, font, true, true)
            font = '/fonts/' + name
        }

        const fontpathptr = getStrPtr(font)
        const success = Module.ccall('addFont', 'number', ['number'], [fontpathptr])
        freePtr(fontpathptr)
        return !!success
    }

    /**
     * A soundfont file is loaded  
     * @private
     * @type {boolean}
     * @see setSoundFont and saveAudio
     */
    static get hasSoundfont() {
        return _hasSoundfont
    }
    /** @private */
    static set hasSoundfont(value) {
        _hasSoundfont = value
    }

    /**
     * Set the soundfont (sf2/sf3) data  
     * (Audio needs soundfonts)
     * @private
     * @param {Uint8Array} data 
     * @returns {Promise<void>}
     */
    static async setSoundFont(data) {
        if (WebMscore.hasSoundfont) {
            // remove the old soundfont file
            Module['FS_unlink']('/MuseScore_General.sf3')
        }

        // put the soundfont file into the virtual file system
        // side effects: the soundfont is shared across all instances
        Module['FS_createDataFile']('/', 'MuseScore_General.sf3', data, true, true)

        WebMscore.hasSoundfont = true
    }

    /**
     * @hideconstructor use `WebMscore.load`
     * @param {number} scoreptr the pointer to the MasterScore class instance in C++
     */
    constructor(scoreptr) {
        /** @private */
        this.scoreptr = scoreptr

        /** @private */
        this.excerptId = -1
    }

    /**
     * Only save this excerpt (linked parts) of the score  
     * 
     * if no excerpts, generate excerpts from existing instrument parts
     * 
     * @param {number} id  `-1` means the full score 
     */
    async setExcerptId(id) {
        this.excerptId = id
    }

    async getExcerptId() {
        return this.excerptId
    }

    /**
     * Generate excerpts from Parts (only parts that are visible) if no existing excerpts
     * @returns {Promise<void>}
     */
    async generateExcerpts() {
        return Module.ccall('generateExcerpts', null, ['number'], [this.scoreptr])
    }

    /**
     * Get the score title
     * @returns {Promise<string>}
     */
    async title() {
        const dataptr = Module.ccall('title', 'number', ['number'], [this.scoreptr])
        return WasmRes.readText(dataptr)
    }

    /**
     * Get the score subtitle
     * @returns {Promise<string>}
     */
    async subtitle() {
        const dataptr = Module.ccall('subtitle', 'number', ['number'], [this.scoreptr])
        return WasmRes.readText(dataptr)
    }

    /**
     * Get the score title (filename safe, replaced some characters)
     */
    async titleFilenameSafe() {
        const title = await this.title()
        return title.replace(/[\s<>:{}"/\\|?*~.\0\cA-\cZ]+/g, '_')
    }

    /**
     * Set the score title in the first title frame (VBox)
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async setTitleText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('setTitleText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Set the score subtitle in the first title frame (VBox)
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async setSubtitleText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('setSubtitleText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Set the score composer in the first title frame (VBox)
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async setComposerText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('setComposerText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Set the lyricist text in the title frame
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async setLyricistText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('setLyricistText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Append a new part using an instrument template id
     * @param {string} instrumentId
     * @returns {Promise<boolean>}
     */
    async appendPart(instrumentId) {
        const strptr = getStrPtr(instrumentId == null ? '' : String(instrumentId))
        try {
            return Module.ccall('appendPart', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Append a new part using a MusicXML instrument id
     * @param {string} instrumentMusicXmlId
     * @returns {Promise<boolean>}
     */
    async appendPartByMusicXmlId(instrumentMusicXmlId) {
        const strptr = getStrPtr(instrumentMusicXmlId == null ? '' : String(instrumentMusicXmlId))
        try {
            return Module.ccall('appendPartByMusicXmlId', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Remove a part by index
     * @param {number} partIndex
     * @returns {Promise<boolean>}
     */
    async removePart(partIndex) {
        return Module.ccall('removePart', 'boolean', ['number', 'number', 'number'], [this.scoreptr, partIndex, this.excerptId])
    }

    /**
     * Toggle part visibility by index
     * @param {number} partIndex
     * @param {boolean} visible
     * @returns {Promise<boolean>}
     */
    async setPartVisible(partIndex, visible) {
        return Module.ccall('setPartVisible', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, partIndex, visible ? 1 : 0, this.excerptId])
    }

    /**
     * List available instrument templates
     * @returns {Promise<Array<{ id: string, name: string, groupId?: string, groupName?: string, familyId?: string, familyName?: string, staffCount?: number, isExtended?: boolean, instruments?: any[] }>>}
     */
    async listInstrumentTemplates() {
        const dataptr = Module.ccall('listInstrumentTemplates', 'number', ['number'], [this.scoreptr])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    /**
     * Get the number of pages in the score (or the excerpt if `excerptId` is set)
     * @returns {Promise<number>}
     */
    async npages() {
        const dataptr = Module.ccall('npages', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return WasmRes.readNum(dataptr)
    }

    /**
     * Get score metadata
     * @returns {Promise<import('../schemas').ScoreMetadata>}
     */
    async metadata() {
        return JSON.parse(await this.saveMetadata())
    }

    /**
     * Get the positions of measures
     * @returns {Promise<import('../schemas').Positions>}
     */
    async measurePositions() {
        return JSON.parse(await this.savePositions(false))
    }

    /**
     * Get the positions of segments
     * @returns {Promise<import('../schemas').Positions>}
     */
    async segmentPositions() {
        return JSON.parse(await this.savePositions(true))
    }

    /**
     * Export score as MusicXML file
     * @returns {Promise<string>} contents of the MusicXML file (plain text)
     */
    async saveXml() {
        const dataptr = Module.ccall('saveXml', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return WasmRes.readText(dataptr)
    }

    /**
     * Export score as compressed MusicXML file
     * @returns {Promise<Uint8Array>}
     */
    async saveMxl() {
        const dataptr = Module.ccall('saveMxl', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return WasmRes.readData(dataptr)
    }

    /**
     * Save part score as MSCZ/MSCX file
     * @param {'mscz' | 'mscx'} format 
     * @returns {Promise<Uint8Array>}
     */
    async saveMsc(format = 'mscz') {
        const dataptr = Module.ccall('saveMsc', 'number', ['number', 'boolean', 'number'], [this.scoreptr, format == 'mscz', this.excerptId])
        return WasmRes.readData(dataptr)
    }

    /**
     * Export score as the SVG file of one page
     * @param {number} pageNumber integer
     * @param {boolean} drawPageBackground 
     * @returns {Promise<string>} contents of the SVG file (plain text)
     */
    async saveSvg(pageNumber = 0, drawPageBackground = false) {
        const dataptr = Module.ccall('saveSvg',
            'number',
            ['number', 'number', 'boolean', 'number'],
            [this.scoreptr, pageNumber, drawPageBackground, this.excerptId]
        )
        return WasmRes.readText(dataptr)
    }

    /**
     * Export score as the PNG file of one page
     * @param {number} pageNumber integer
     * @param {boolean} drawPageBackground 
     * @param {boolean} transparent
     * @returns {Promise<Uint8Array>}
     */
    async savePng(pageNumber = 0, drawPageBackground = false, transparent = true) {
        const dataptr = Module.ccall('savePng',
            'number',
            ['number', 'number', 'boolean', 'boolean', 'number'],
            [this.scoreptr, pageNumber, drawPageBackground, transparent, this.excerptId]
        )
        return WasmRes.readData(dataptr)
    }

    /**
     * Export score as PDF file
     * @returns {Promise<Uint8Array>}
     */
    async savePdf() {
        const dataptr = Module.ccall('savePdf', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return WasmRes.readData(dataptr)
    }

    /**
     * Export score as MIDI file
     * @param {boolean} midiExpandRepeats 
     * @param {boolean} exportRPNs 
     * @returns {Promise<Uint8Array>}
     */
    async saveMidi(midiExpandRepeats = true, exportRPNs = true) {
        const dataptr = Module.ccall('saveMidi',
            'number',
            ['number', 'boolean', 'boolean', 'number'],
            [this.scoreptr, midiExpandRepeats, exportRPNs, this.excerptId]
        )
        return WasmRes.readData(dataptr)
    }

    /**
     * Set the soundfont (sf2/sf3) data
     * @param {Uint8Array} data 
     */
    async setSoundFont(data) {
        return WebMscore.setSoundFont(data)
    }

    /**
     * Export score as audio file (wav/ogg/flac/mp3)
     * @param {'wav' | 'ogg' | 'flac' | 'mp3'} format 
     */
    async saveAudio(format) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const fileformatptr = getStrPtr(format)
        const dataptr = Module.ccall('saveAudio',
            'number',
            ['number', 'number', 'number'],
            [this.scoreptr, fileformatptr, this.excerptId]
        )
        freePtr(fileformatptr)
        return WasmRes.readData(dataptr)
    }

    /**
     * Synthesize audio frames
     * 
     * `synthAudio` is single instance, i.e. you can't have multiple iterators. If you call `synthAudio` multiple times, it will reset the time offset of all iterators the function returned.
     * 
     * @param {number} starttime The start time offset in seconds
     * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes>>} The iterator function, see `processSynth`
     */
    async synthAudio(starttime) {
        const fn = await this._synthAudio(starttime)
        return (cancel) => {
            return this.processSynth(fn, cancel)
        }
    }

    /**
     * Synthesize audio frames in bulk
     * @param {number} starttime - The start time offset in seconds
     * @param {number} batchSize - max number of result SynthRes' (n * 512 frames)
     * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
     */
    async synthAudioBatch(starttime, batchSize) {
        const fn = await this._synthAudio(starttime)
        return (cancel) => {
            return this.processSynthBatch(fn, batchSize, cancel)
        }
    }

    /**
     * Synthesize audio frames
     * @private
     * @todo GC this iterator function
     * @param {number} starttime The start time offset in seconds
     * @returns {Promise<number>} Pointer to the iterator function
     */
    async _synthAudio(starttime = 0) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const iteratorFnPtr = Module.ccall('synthAudio',
            'number',
            ['number', 'number', 'number'],
            [this.scoreptr, starttime, this.excerptId]
        )

        const success = iteratorFnPtr !== 0
        if (!success) {
            throw new Error('synthAudio: Internal Error.')
        }

        return iteratorFnPtr
    }

    /**
     * Parse struct SynthRes, then free its memory
     * @private
     * @param {number} resptr - pointer to the SynthRes data
     * @returns {import('../schemas').SynthRes}
     */
    _parseSynthRes(resptr) {
        // struct SynthRes in synthres.h
        const done = Module.getValue(resptr + 0, 'i8')
        const startTime = +Module.getValue(resptr + 4, 'float')  // in seconds
        const endTime = +Module.getValue(resptr + 8, 'float')  // in seconds
        const chunkSize = Module.getValue(resptr + 12, 'i32')
        const chunkPtr = resptr + 16

        const chunk = new Uint8Array(  // make a copy
            Module.HEAPU8.subarray(chunkPtr, chunkPtr + chunkSize)
        )

        freePtr(resptr)

        return {
            done: !!done,
            startTime, // The chunk's start time in seconds
            endTime,   // The current play time in seconds (the chunk's end time)
            chunk,     // The data chunk of audio frames, non-interleaved float32 PCM, 512 frames, 44100 Hz (44.1 kHz), 0.0116 s (512/44100)
        }
    }

    /**
     * @private
     * @param {number} fnptr - pointer to the iterator function
     * @param {boolean} cancel - cancel the audio synthesis worklet 
     * @returns {Promise<import('../schemas').SynthRes>}
     */
    async processSynth(fnptr, cancel = false) {
        const resptr = Module.ccall('processSynth',
            'number',
            ['number', 'boolean'],
            [fnptr, cancel]
        )
        return this._parseSynthRes(resptr)
    }

    /**
     * @private
     * @param {number} fnptr - pointer to the iterator function
     * @param {number} batchSize - see `synthAudioBatch`
     * @param {boolean} cancel - cancel the audio synthesis worklet 
     */
    async processSynthBatch(fnptr, batchSize, cancel = false) {
        const resArrPtr = Module.ccall('processSynthBatch',
            'number',
            ['number', 'number', 'boolean'],
            [fnptr, batchSize, cancel]
        )

        /** @type {import('../schemas').SynthRes[]} */
        const arr = []
        for (let i = 0; i < batchSize; i++) {
            // visit the array of pointers to SynthRes data
            const resptr = Module.getValue(resArrPtr + 4 * i, '*') // 32bit WASM, so one pointer is 4 bytes long
            const r = this._parseSynthRes(resptr)
            arr.push(r)
        }

        freePtr(resArrPtr)
        return arr
    }

    /**
     * Export positions of measures or segments (if `ofSegments` == true) as JSON
     * @param {boolean} ofSegments
     * @also `score.measurePositions()` and `score.segmentPositions()`
     * @returns {Promise<string>}
     */
    async savePositions(ofSegments) {
        const dataptr = Module.ccall('savePositions',
            'number',
            ['number', 'boolean', 'number'],
            [this.scoreptr, ofSegments, this.excerptId]
        )
        return WasmRes.readText(dataptr)
    }

    /**
     * Export score metadata as JSON text
     * @also `score.metadata()`
     * @returns {Promise<string>} contents of the JSON file
     */
    async saveMetadata() {
        const dataptr = Module.ccall('saveMetadata', 'number', ['number'], [this.scoreptr])
        return WasmRes.readText(dataptr)
    }

    /**
     * Select the topmost selectable element near a page-relative point
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @returns {Promise<boolean>}
     */
    async selectElementAtPoint(pageNumber, x, y) {
        return Module.ccall('selectElementAtPoint',
            'boolean',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, this.excerptId]
        )
    }

    /**
     * Clear current selection
     * @returns {Promise<boolean>}
     */
    async clearSelection() {
        return Module.ccall('clearSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Get the selection MIME type for copy/paste.
     * @returns {Promise<string>}
     */
    async selectionMimeType() {
        const dataptr = Module.ccall('selectionMimeType', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return WasmRes.readText(dataptr)
    }

    /**
     * Get the selection MIME data for copy/paste.
     * @returns {Promise<Uint8Array>}
     */
    async selectionMimeData() {
        const dataptr = Module.ccall('selectionMimeData', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return WasmRes.readData(dataptr)
    }

    /**
     * Paste selection data at the current selection.
     * @param {string} mimeType
     * @param {Uint8Array} data
     * @returns {Promise<boolean>}
     */
    async pasteSelection(mimeType, data) {
        const mimePtr = getStrPtr(mimeType)
        const dataPtr = getTypedArrayPtr(data)
        const result = Module.ccall('pasteSelection', 'boolean',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, mimePtr, dataPtr, data.byteLength, this.excerptId]
        )
        freePtr(mimePtr)
        freePtr(dataPtr)
        return result
    }

    /**
     * Select the topmost selectable element near a page-relative point with mode
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @param {0|1|2} mode 0=replace, 1=add, 2=toggle
     * @returns {Promise<boolean>}
     */
    async selectElementAtPointWithMode(pageNumber, x, y, mode) {
        return Module.ccall('selectElementAtPointWithMode',
            'boolean',
            ['number', 'number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, mode, this.excerptId]
        )
    }

    /**
     * Delete the current selection
     * @returns {Promise<boolean>}
     */
    async deleteSelection() {
        return Module.ccall('deleteSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Raise pitch for the current selection
     */
    async pitchUp() {
        return Module.ccall('pitchUp', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Lower pitch for the current selection
     */
    async pitchDown() {
        return Module.ccall('pitchDown', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Transpose the current selection by semitone delta.
     * If there is no selection, this transposes the whole score.
     * @param {number} semitones
     * @returns {Promise<boolean>}
     */
    async transpose(semitones) {
        return Module.ccall('transpose', 'boolean', ['number', 'number', 'number'], [this.scoreptr, semitones, this.excerptId])
    }

    /**
     * Set accidental for the current selection.
     * @param {number} accidentalType see engraving::AccidentalType enum
     * @returns {Promise<boolean>}
     */
    async setAccidental(accidentalType) {
        return Module.ccall('setAccidental', 'boolean', ['number', 'number', 'number'], [this.scoreptr, accidentalType, this.excerptId])
    }

    /**
     * Double the duration of the current selection
     */
    async doubleDuration() {
        return Module.ccall('doubleDuration', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Halve the duration of the current selection
     */
    async halfDuration() {
        return Module.ccall('halfDuration', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Toggle dotted duration on the current selection
     */
    async toggleDot() {
        return Module.ccall('toggleDot', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Toggle double-dotted duration on the current selection
     */
    async toggleDoubleDot() {
        return Module.ccall('toggleDoubleDot', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Toggle a line break on the selected measure
     */
    async toggleLineBreak() {
        return Module.ccall('toggleLineBreak', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Toggle a page break on the selected measure
     */
    async togglePageBreak() {
        return Module.ccall('togglePageBreak', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Set voice index (0-3) for input/selection
     * @param {number} voiceIndex
     * @returns {Promise<boolean>}
     */
    async setVoice(voiceIndex) {
        return Module.ccall('setVoice', 'boolean', ['number', 'number', 'number'], [this.scoreptr, voiceIndex, this.excerptId])
    }

    /**
     * Undo the last command
     */
    async undo() {
        return Module.ccall('undo', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Redo the last undone command
     */
    async redo() {
        return Module.ccall('redo', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Force a relayout and update of the current score
     */
    async relayout() {
        return Module.ccall('relayout', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Add a dynamic marking at the current selection
     * @param {number} dynamicType see engraving::DynamicType enum
     * @returns {Promise<boolean>}
     */
    async addDynamic(dynamicType) {
        return Module.ccall('addDynamic', 'boolean', ['number', 'number', 'number'], [this.scoreptr, dynamicType, this.excerptId])
    }

    /**
     * Add a rehearsal mark at the current selection
     * @returns {Promise<boolean>}
     */
    async addRehearsalMark() {
        return Module.ccall('addRehearsalMark', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Add tempo text at the current selection
     * @param {number} bpm
     * @returns {Promise<boolean>}
     */
    async addTempoText(bpm) {
        return Module.ccall('addTempoText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, bpm, this.excerptId])
    }

    /**
     * Add staff text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addStaffText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addStaffText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add system text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addSystemText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addSystemText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add expression text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addExpressionText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addExpressionText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add lyric text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addLyricText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addLyricText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add harmony text at the current selection
     * @param {number} variant 0=standard, 1=roman, 2=nashville
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addHarmonyText(variant, text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addHarmonyText', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, variant, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add fingering text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addFingeringText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addFingeringText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add left-hand guitar fingering text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addLeftHandGuitarFingeringText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall(
                'addLeftHandGuitarFingeringText',
                'boolean',
                ['number', 'number', 'number'],
                [this.scoreptr, strptr, this.excerptId],
            )
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add right-hand guitar fingering text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addRightHandGuitarFingeringText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall(
                'addRightHandGuitarFingeringText',
                'boolean',
                ['number', 'number', 'number'],
                [this.scoreptr, strptr, this.excerptId],
            )
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add string number text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addStringNumberText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addStringNumberText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add instrument change text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addInstrumentChangeText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addInstrumentChangeText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add sticking text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addStickingText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addStickingText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add or remove an articulation on the selected notes/chords.
     * @param {string} articulationSymbolName e.g. "articStaccatoAbove"
     * @returns {Promise<boolean>}
     */
    async addArticulation(articulationSymbolName) {
        const strptr = getStrPtr(articulationSymbolName)
        try {
            return Module.ccall('addArticulation', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    /**
     * Add a slur spanning the current selection.
     * - With a single selected note, this slurs to the next chord/rest.
     * - With multi-selection, this slurs from the first selected chord/rest to the last.
     * @returns {Promise<boolean>}
     */
    async addSlur() {
        return Module.ccall('addSlur', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Add a tie from the selected note(s) to the next matching pitch.
     * @returns {Promise<boolean>}
     */
    async addTie() {
        return Module.ccall('addTie', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Add a grace note of the specified type to the selected note(s).
     * @param {number} graceType
     * @returns {Promise<boolean>}
     */
    async addGraceNote(graceType) {
        return Module.ccall('addGraceNote', 'boolean', ['number', 'number', 'number'], [this.scoreptr, graceType, this.excerptId])
    }

    /**
     * Add a simple tuplet (e.g. 3, 5, 7) at the current selection.
     * @param {number} tupletCount
     * @returns {Promise<boolean>}
     */
    async addTuplet(tupletCount) {
        return Module.ccall('addTuplet', 'boolean', ['number', 'number', 'number'], [this.scoreptr, tupletCount, this.excerptId])
    }

    /**
     * Convert a selected rest into a note
     * @returns {Promise<boolean>}
     */
    async addNoteFromRest() {
        return Module.ccall('addNoteFromRest', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Toggle a repeat start on the selected measure
     */
    async toggleRepeatStart() {
        return Module.ccall('toggleRepeatStart', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Toggle a repeat end on the selected measure
     */
    async toggleRepeatEnd() {
        return Module.ccall('toggleRepeatEnd', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Set the repeat count on the selected measure
     * @param {number} count
     */
    async setRepeatCount(count) {
        return Module.ccall('setRepeatCount', 'boolean', ['number', 'number', 'number'], [this.scoreptr, count, this.excerptId])
    }

    /**
     * Set the end barline type on the selected measure
     * @param {number} barLineType
     */
    async setBarLineType(barLineType) {
        return Module.ccall('setBarLineType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, barLineType, this.excerptId])
    }

    /**
     * Add a volta ending at the selected measure or range
     * @param {number} endingNumber
     */
    async addVolta(endingNumber) {
        return Module.ccall('addVolta', 'boolean', ['number', 'number', 'number'], [this.scoreptr, endingNumber, this.excerptId])
    }

    /**
     * Set the time signature (global) at the start of the score
     * @param {number} numerator
     * @param {number} denominator
     * @returns {Promise<boolean>}
     */
    async setTimeSignature(numerator, denominator) {
        return Module.ccall('setTimeSignature', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, numerator, denominator, this.excerptId])
    }

    /**
     * Set the key signature (global) at the start of the score.
     * @param {number} fifths -7..+7 (Cb..C#)
     * @returns {Promise<boolean>}
     */
    async setKeySignature(fifths) {
        return Module.ccall('setKeySignature', 'boolean', ['number', 'number', 'number'], [this.scoreptr, fifths, this.excerptId])
    }

    /**
     * Get the key signature (global) at the start of the score.
     * @returns {Promise<number>} fifths -7..+7 (Cb..C#)
     */
    async getKeySignature() {
        return Module.ccall('getKeySignature', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Insert a clef at the current selection/input position
     * @param {number} clefType see engraving::ClefType enum
     * @returns {Promise<boolean>}
     */
    async setClef(clefType) {
        return Module.ccall('setClef', 'boolean', ['number', 'number', 'number'], [this.scoreptr, clefType, this.excerptId])
    }

    /**
     * @param {boolean=} soft (default `true`)
     *                 * `true`  destroy the score instance only, or
     *                 * `false` destroy the whole WebMscore context 
     * @returns {void}
     */
    destroy(soft = true) {
        if (!soft) {
            throw new Error('unimplemented')
        }

        Module.ccall('destroy', 'void', ['number'], [this.scoreptr])
        freePtr(this.scoreptr)
    }

}

export default WebMscore
