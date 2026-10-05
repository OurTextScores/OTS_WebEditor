
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
const _utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null
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

    async setSelectedText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('setSelectedText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
    }

    async getSelectedElementProperties() {
        const dataptr = Module.ccall('getSelectedElementProperties', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    async setSelectedElementProperty(propertyName, value) {
        const nameptr = getStrPtr(String(propertyName))
        const valueptr = getStrPtr(String(value))
        try {
            return Module.ccall('setSelectedElementProperty', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, nameptr, valueptr, this.excerptId])
        } finally {
            freePtr(nameptr)
            freePtr(valueptr)
        }
    }

    async addFretDiagram(pattern) {
        const patternptr = getStrPtr(String(pattern))
        try {
            return Module.ccall('addFretDiagram', 'boolean', ['number', 'number', 'number'], [this.scoreptr, patternptr, this.excerptId])
        } finally {
            freePtr(patternptr)
        }
    }

    async getSelectedFretDiagram() {
        const dataptr = Module.ccall('getSelectedFretDiagram', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    async setSelectedFretDiagram(diagram) {
        const dataptr = getStrPtr(JSON.stringify(diagram))
        try {
            return Module.ccall('setSelectedFretDiagram', 'boolean', ['number', 'number', 'number'], [this.scoreptr, dataptr, this.excerptId])
        } finally {
            freePtr(dataptr)
        }
    }

    async addAmbitus() {
        return Module.ccall('addAmbitus', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    async explodeSelection() {
        return Module.ccall('explodeSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    async implodeSelection() {
        return Module.ccall('implodeSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    async regroupSelection() {
        return Module.ccall('regroupSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    async resequenceRehearsalMarks() {
        return Module.ccall('resequenceRehearsalMarks', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
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
     * Get the number of measures in a part (measure index basis for signatures).
     * @param {number} partIndex
     * @returns {Promise<number>}
     */
    async measureSignatureCount(partIndex) {
        const dataptr = Module.ccall('measureSignatureCount', 'number', ['number', 'number', 'number'], [this.scoreptr, partIndex, this.excerptId])
        return WasmRes.readNum(dataptr)
    }

    /**
     * Get a compact signature string for a specific part measure.
     * @param {number} partIndex
     * @param {number} measureIndex
     * @returns {Promise<string>}
     */
    async measureSignatureAt(partIndex, measureIndex) {
        const dataptr = Module.ccall(
            'measureSignatureAt',
            'number',
            ['number', 'number', 'number', 'number'],
            [this.scoreptr, partIndex, measureIndex, this.excerptId]
        )
        return WasmRes.readText(dataptr)
    }

    /**
     * Get all measure signatures for a part.
     * @param {number} partIndex
     * @returns {Promise<string[]>}
     */
    async measureSignatures(partIndex) {
        const dataptr = Module.ccall('measureSignatures', 'number', ['number', 'number', 'number'], [this.scoreptr, partIndex, this.excerptId])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    /**
     * Get line break flags for each measure in the score.
     * @returns {Promise<boolean[]>}
     */
    /**
     * Measures whose actual length differs from their time signature.
     *
     * MuseScore marks these with a small plus in the corner; this says what the
     * two lengths are, which the mark alone does not.
     * @returns {Promise<Array<{ index: number; number: string; actual: string; nominal: string; irregular: boolean }>>}
     */
    async irregularMeasures() {
        const dataptr = Module.ccall('irregularMeasures',
            'number',
            ['number', 'number'],
            [this.scoreptr, this.excerptId]
        )
        return JSON.parse(WasmRes.readText(dataptr))
    }

    /**
     * Make one measure as long as its time signature says it is.
     *
     * The same operation as setting the actual duration back to the nominal one
     * in Measure Properties.
     * @param {number} measureIndex
     * @returns {Promise<boolean>}
     */
    async setMeasureLengthToTimeSignature(measureIndex) {
        return !!Module.ccall('setMeasureLengthToTimeSignature',
            'boolean',
            ['number', 'number', 'number'],
            [this.scoreptr, measureIndex, this.excerptId]
        )
    }

    async measureLineBreaks() {
        const dataptr = Module.ccall('measureLineBreaks', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    /**
     * Set line break flags for each measure in the score.
     * @param {boolean[]} breaks
     * @returns {Promise<boolean>}
     */
    async setMeasureLineBreaks(breaks) {
        const payload = JSON.stringify(Array.isArray(breaks) ? breaks : [])
        const payloadPtr = getStrPtr(payload)
        const result = Module.ccall(
            'setMeasureLineBreaks',
            'boolean',
            ['number', 'number', 'number', 'number'],
            [this.scoreptr, payloadPtr, payload.length, this.excerptId]
        )
        freePtr(payloadPtr)
        return result
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
     * Resolve the inclusive measure range rendered on a page.
     * @param {number} pageIndex zero-based page index
     * @returns {Promise<{startMeasureIndex: number, endMeasureIndex: number} | null>}
     */
    async measureRangeForPage(pageIndex) {
        const dataptr = Module.ccall('measureRangeForPage',
            'number',
            ['number', 'number', 'number'],
            [this.scoreptr, pageIndex, this.excerptId]
        )
        const json = WasmRes.readText(dataptr)
        if (!json || json === 'null') {
            return null
        }
        return JSON.parse(json)
    }

    /**
     * Return the repeat-expanded, tempo-aware measure occurrence timeline.
     * @returns {Promise<import('../schemas').PlaybackTimeline | null>}
     */
    async playbackTimeline() {
        const dataptr = Module.ccall('playbackTimeline',
            'number',
            ['number', 'number'],
            [this.scoreptr, this.excerptId]
        )
        const json = WasmRes.readText(dataptr)
        if (!json || json === 'null') {
            return null
        }
        return JSON.parse(json)
    }

    /**
     * Resolve the inclusive measure range covered by the current selection.
     * @returns {Promise<{startMeasureIndex: number, endMeasureIndex: number} | null>}
     */
    async selectionMeasureRange() {
        const dataptr = Module.ccall('selectionMeasureRange',
            'number',
            ['number', 'number'],
            [this.scoreptr, this.excerptId]
        )
        const json = WasmRes.readText(dataptr)
        if (!json || json === 'null') {
            return null
        }
        return JSON.parse(json)
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
     * @param {boolean} highlightSelection - if true, selected elements will be rendered with selection color
     * @returns {Promise<Uint8Array>} UTF-8 SVG bytes
     */
    async saveSvgRaw(pageNumber = 0, drawPageBackground = false, highlightSelection = false) {
        const dataptr = Module.ccall('saveSvg',
            'number',
            ['number', 'number', 'boolean', 'boolean', 'number'],
            [this.scoreptr, pageNumber, drawPageBackground, highlightSelection, this.excerptId]
        )
        return WasmRes.readData(dataptr)
    }

    /**
     * Export score as the SVG file of one page
     * @param {number} pageNumber integer
     * @param {boolean} drawPageBackground
     * @param {boolean} highlightSelection - if true, selected elements will be rendered with selection color
     * @returns {Promise<string>} contents of the SVG file (plain text)
     */
    async saveSvg(pageNumber = 0, drawPageBackground = false, highlightSelection = false) {
        const svgBytes = await this.saveSvgRaw(pageNumber, drawPageBackground, highlightSelection)
        if (_utf8Decoder) {
            return _utf8Decoder.decode(svgBytes)
        }
        // TextDecoder should exist in browser/worker runtimes, but keep a fallback for safety.
        let text = ''
        for (let i = 0; i < svgBytes.length; i += 1) {
            text += String.fromCharCode(svgBytes[i])
        }
        return decodeURIComponent(escape(text))
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
     * Export a measure range as an audio file.
     * @param {'wav'} format
     * @param {number} startMeasureIndex
     * @param {number} endMeasureIndex
     * @returns {Promise<Uint8Array>}
     */
    async saveAudioForMeasureRange(format, startMeasureIndex, endMeasureIndex) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }
        if (format !== 'wav') {
            throw new Error('saveAudioForMeasureRange currently supports wav only')
        }

        const fileformatptr = getStrPtr(format)
        const dataptr = Module.ccall('saveAudioForMeasureRange',
            'number',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, fileformatptr, startMeasureIndex, endMeasureIndex, this.excerptId]
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
     * Synthesize audio frames from the current cursor/selection playback position.
     * @param {number} batchSize - max number of result SynthRes' (n * 512 frames)
     * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
     */
    async synthAudioBatchFromSelection(batchSize) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const iteratorFnPtr = Module.ccall('synthAudioFromSelection',
            'number',
            ['number', 'number'],
            [this.scoreptr, this.excerptId]
        )

        if (!iteratorFnPtr) {
            throw new Error('synthAudioFromSelection: Internal Error.')
        }

        return (cancel) => {
            return this.processSynthBatch(iteratorFnPtr, batchSize, cancel)
        }
    }

    /**
     * Synthesize audio frames for a measure range.
     * @param {number} startMeasureIndex
     * @param {number} endMeasureIndex
     * @param {number} batchSize
     * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
     */
    async synthAudioBatchForMeasureRange(startMeasureIndex, endMeasureIndex, batchSize) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const iteratorFnPtr = Module.ccall('synthAudioForMeasureRange',
            'number',
            ['number', 'number', 'number', 'number'],
            [this.scoreptr, startMeasureIndex, endMeasureIndex, this.excerptId]
        )

        if (!iteratorFnPtr) {
            throw new Error('synthAudioForMeasureRange: Internal Error.')
        }

        return (cancel) => {
            return this.processSynthBatch(iteratorFnPtr, batchSize, cancel)
        }
    }

    /**
     * Synthesize a short isolated preview for the current selection (note/chord).
     * @param {number} batchSize - max number of result SynthRes' (n * 512 frames)
     * @param {number} durationMs - preview duration in milliseconds
     * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
     */
    async synthSelectionPreviewBatch(batchSize, durationMs = 500) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const seconds = Math.max(0.05, Number(durationMs) / 1000)
        const iteratorFnPtr = Module.ccall('synthAudioSelectionPreview',
            'number',
            ['number', 'number', 'number'],
            [this.scoreptr, seconds, this.excerptId]
        )

        if (!iteratorFnPtr) {
            throw new Error('synthAudioSelectionPreview: Internal Error.')
        }

        return (cancel) => {
            return this.processSynthBatch(iteratorFnPtr, batchSize, cancel)
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
     * Synthesize audio frames from the current cursor/selection playback position.
     * @private
     * @returns {Promise<number>} Pointer to the iterator function
     */
    async _synthAudioFromSelection() {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const iteratorFnPtr = Module.ccall('synthAudioFromSelection',
            'number',
            ['number', 'number'],
            [this.scoreptr, this.excerptId]
        )

        const success = iteratorFnPtr !== 0
        if (!success) {
            throw new Error('synthAudioFromSelection: Internal Error.')
        }

        return iteratorFnPtr
    }

    /**
     * Synthesize audio frames for a measure range.
     *
     * The private half of `synthAudioBatchForMeasureRange`, and the layer that
     * was missing. In worker mode `worker-helper.js` never calls the public
     * method — it RPCs the underscore-prefixed one and holds the returned
     * pointer itself, so that the batch iterator can be driven across the
     * thread boundary. Without this, `worker.js` looked up
     * `score['_synthAudioForMeasureRange']`, found nothing, and threw
     * `Cannot read properties of undefined (reading 'apply')` — which reads
     * exactly like a broken WASM build, and is not one: the native export has
     * been there all along.
     *
     * @private
     * @param {number} startMeasureIndex
     * @param {number} endMeasureIndex
     * @returns {Promise<number>} Pointer to the iterator function
     */
    async _synthAudioForMeasureRange(startMeasureIndex, endMeasureIndex) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const iteratorFnPtr = Module.ccall('synthAudioForMeasureRange',
            'number',
            ['number', 'number', 'number', 'number'],
            [this.scoreptr, startMeasureIndex, endMeasureIndex, this.excerptId]
        )

        const success = iteratorFnPtr !== 0
        if (!success) {
            throw new Error('synthAudioForMeasureRange: Internal Error.')
        }

        return iteratorFnPtr
    }

    /**
     * Synthesize a short isolated preview for the current selection (note/chord).
     * @private
     * @param {number} durationMs - preview duration in milliseconds
     * @returns {Promise<number>} Pointer to the iterator function
     */
    async _synthAudioSelectionPreview(durationMs = 500) {
        if (!WebMscore.hasSoundfont) {
            throw new Error('The soundfont is not set.')
        }

        const seconds = Math.max(0.05, Number(durationMs) / 1000)
        const iteratorFnPtr = Module.ccall('synthAudioSelectionPreview',
            'number',
            ['number', 'number', 'number'],
            [this.scoreptr, seconds, this.excerptId]
        )

        const success = iteratorFnPtr !== 0
        if (!success) {
            throw new Error('synthAudioSelectionPreview: Internal Error.')
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
     * Read load-stage timing/profile data for this score.
     * @returns {Promise<Record<string, any>>}
     */
    async loadProfile() {
        const dataptr = Module.ccall('loadProfile', 'number', ['number'], [this.scoreptr])
        return JSON.parse(WasmRes.readText(dataptr))
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
     * Select a measure near a page-relative point.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @returns {Promise<boolean>}
     */
    /**
     * Extend the current range selection to include the bar at a point (Shift+Click)
     * @returns {Promise<boolean>}
     */
    async extendMeasureSelectionAtPoint(pageNumber, x, y) {
        return Module.ccall('extendMeasureSelectionAtPoint',
            'boolean',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, this.excerptId]
        )
    }

    async selectMeasureAtPoint(pageNumber, x, y) {
        return Module.ccall('selectMeasureAtPoint',
            'boolean',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, this.excerptId]
        )
    }

    /**
     * Select a measure by index for a specific part.
     * @param {number} partIndex
     * @param {number} measureIndex
     * @returns {Promise<boolean>}
     */
    async selectPartMeasureByIndex(partIndex, measureIndex) {
        return Module.ccall('selectPartMeasureByIndex',
            'boolean',
            ['number', 'number', 'number', 'number'],
            [this.scoreptr, partIndex, measureIndex, this.excerptId]
        )
    }

    /**
     * Select a text element near a page-relative point.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @returns {Promise<boolean>}
     */
    async selectTextElementAtPoint(pageNumber, x, y) {
        return Module.ccall('selectTextElementAtPoint',
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
     * Move selection to the next chord
     * @returns {Promise<boolean>}
     */
    async selectNextChord() {
        return Module.ccall('selectNextChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Move selection to the previous chord
     * @returns {Promise<boolean>}
     */
    async selectPrevChord() {
        return Module.ccall('selectPrevChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Extend selection to the next chord (for Shift+Right arrow)
     * @returns {Promise<boolean>}
     */
    async extendSelectionNextChord() {
        return Module.ccall('extendSelectionNextChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Extend selection to the previous chord (for Shift+Left arrow)
     * @returns {Promise<boolean>}
     */
    async extendSelectionPrevChord() {
        return Module.ccall('extendSelectionPrevChord', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Whether the engine currently holds a range selection.
     * @returns {Promise<boolean>}
     */
    /**
     * What is on the undo stack: `index` entries applied (0: nothing to undo, `size`: nothing to redo),
     * `size` entries in all, and whether the score is back at its loaded state.
     * @returns {Promise<{index: number, size: number, clean: boolean}>}
     */
    async getUndoInfo() {
        const dataptr = Module.ccall('getUndoInfo', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    /**
     * The undo entries in [from, to), oldest first: the command names each ran, the element types it changed
     * and the tick range of the selection it was made on (-1 when there was none).
     * @param {number} from
     * @param {number} to
     * @returns {Promise<{commands: string[], elements: string[], tickStart: number, tickEnd: number}[]>}
     */
    async getUndoEntries(from, to) {
        const dataptr = Module.ccall('getUndoEntries', 'number', ['number', 'number', 'number', 'number'], [this.scoreptr, from, to, this.excerptId])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    /**
     * Moves the undo cursor to `target` (an `index` as getUndoInfo reports it) by undoing or redoing as needed.
     * @param {number} target
     * @returns {Promise<boolean>} whether it got there
     */
    async undoRedoTo(target) {
        return Module.ccall('undoRedoTo', 'boolean', ['number', 'number', 'number'], [this.scoreptr, target, this.excerptId])
    }

    async isSelectionRange() {
        return Module.ccall('isSelectionRange', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Extend selection to the next measure (for Ctrl+Shift+Right arrow)
     * @returns {Promise<boolean>}
     */
    async extendSelectionNextMeasure() {
        return Module.ccall('extendSelectionNextMeasure', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Extend selection to the previous measure (for Ctrl+Shift+Left arrow)
     * @returns {Promise<boolean>}
     */
    async extendSelectionPrevMeasure() {
        return Module.ccall('extendSelectionPrevMeasure', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Extend selection to the staff above (for Shift+Up arrow)
     * @returns {Promise<boolean>}
     */
    async extendSelectionStaffAbove() {
        return Module.ccall('extendSelectionStaffAbove', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Extend selection to the staff below (for Shift+Down arrow)
     * @returns {Promise<boolean>}
     */
    async extendSelectionStaffBelow() {
        return Module.ccall('extendSelectionStaffBelow', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Get the bounding box of the current selection
     * @returns {Promise<{page: number, x: number, y: number, width: number, height: number} | null>}
     */
    async getSelectionBoundingBox() {
        const dataptr = Module.ccall('getSelectionBoundingBox', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        const json = WasmRes.readText(dataptr)
        if (!json) return null
        try {
            return JSON.parse(json)
        } catch (e) {
            return null
        }
    }

    /**
     * Get the bounding boxes of all selected elements (for range selection)
     * @returns {Promise<Array<{page: number, x: number, y: number, width: number, height: number}>>}
     */
    async getSelectionBoundingBoxes() {
        const dataptr = Module.ccall('getSelectionBoundingBoxes', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        const json = WasmRes.readText(dataptr)
        if (!json) return []
        try {
            return JSON.parse(json)
        } catch (e) {
            return []
        }
    }

    /**
     * Add vertical padding below one staff of one measure, or remove it with a gap <= 0.
     *
     * Compare uses this to re-synchronise the panes: a line break can move a bar to another
     * system, but only a spacer can leave a hole where the other pane has an extra bar.
     * @param {number} measureIndex
     * @param {number} staffIdx
     * @param {number} gapSpatium gap in spatium; <= 0 removes the spacer
     * @returns {Promise<boolean>}
     */
    async setMeasureSpacer(measureIndex, staffIdx, gapSpatium) {
        return Module.ccall('setMeasureSpacer',
            'boolean',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, measureIndex, staffIdx, gapSpatium, this.excerptId]
        )
    }

    /**
     * Vertical band of each part within each laid-out system, in page coordinates.
     *
     * Measure positions carry no staff dimension, so this is what a caller needs to place
     * a highlight over one part's bar instead of over the whole system. Selection-free, so
     * it neither costs a round trip per bar nor disturbs the user's selection.
     * @returns {Promise<Array<{page: number, system: number, partIndex: number, y: number, height: number}>>}
     */
    async staffSystemBands() {
        const dataptr = Module.ccall('staffSystemBands', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        const json = WasmRes.readText(dataptr)
        if (!json) return []
        try {
            return JSON.parse(json)
        } catch (e) {
            return []
        }
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
     * Begin an element drag gesture at a page-relative point.
     * Hit-tests the point; if a draggable element is found, selects it and
     * opens an undoable command wrapping the whole gesture.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @returns {Promise<boolean>} true if a drag gesture started
     */
    async beginElementDrag(pageNumber, x, y) {
        return Module.ccall('beginElementDrag',
            'boolean',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, this.excerptId]
        )
    }

    /**
     * Update the active element drag gesture with a new pointer position.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @param {number} modifiers bitmask: 1=shift, 2=ctrl, 4=alt
     * @param {0|1|2} dragMode 0=both axes, 1=X only, 2=Y only
     * @returns {Promise<boolean>}
     */
    async updateElementDrag(pageNumber, x, y, modifiers = 0, dragMode = 0) {
        return Module.ccall('updateElementDrag',
            'boolean',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, modifiers, dragMode, this.excerptId]
        )
    }

    /**
     * End the active element drag gesture.
     * @param {boolean} commit true to commit (endCmd), false to rollback
     * @returns {Promise<boolean>}
     */
    async endElementDrag(commit) {
        return Module.ccall('endElementDrag',
            'boolean',
            ['number', 'boolean', 'number'],
            [this.scoreptr, commit, this.excerptId]
        )
    }

    /**
     * Apply a supported palette element at a page-relative engraving point.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @param {0|1|2} elementType 0=clef, 1=dynamic, 2=articulation
     * @param {number} subtype kind-specific subtype
     * @returns {Promise<boolean>}
     */
    async applyDropAtPoint(pageNumber, x, y, elementType, subtype) {
        return Module.ccall('applyDropAtPoint',
            'boolean',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, elementType, subtype, this.excerptId]
        )
    }

    /**
     * Enter grip edit mode for a spanner at a page-relative point.
     * @returns {Promise<{page:number, grips:Array<{index:number,x:number,y:number,draggable:boolean}>}|null>}
     */
    async beginGripEdit(pageNumber, x, y) {
        const dataptr = Module.ccall('beginGripEdit', 'number',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, pageNumber, x, y, this.excerptId])
        const json = WasmRes.readText(dataptr)
        if (!json) return null
        try {
            return JSON.parse(json)
        } catch (e) {
            return null
        }
    }

    /** Drag one grip by an incremental score-space delta. */
    async dragGrip(gripIndex, dx, dy, modifiers = 0) {
        const dataptr = Module.ccall('dragGrip', 'number',
            ['number', 'number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, gripIndex, dx, dy, modifiers, this.excerptId])
        const json = WasmRes.readText(dataptr)
        if (!json) return null
        try {
            return JSON.parse(json)
        } catch (e) {
            return null
        }
    }

    /** End grip edit mode, committing or rolling back its undo command. */
    async endGripEdit(commit) {
        return Module.ccall('endGripEdit', 'boolean',
            ['number', 'boolean', 'number'],
            [this.scoreptr, commit, this.excerptId])
    }

    /**
     * The score's spatium (staff space) in engraving canvas units — the same
     * coordinate space used by selection and drag point APIs.
     * @returns {Promise<number>}
     */
    async getSpatium() {
        return Module.ccall('getSpatium',
            'number',
            ['number', 'number'],
            [this.scoreptr, this.excerptId]
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
     * Transpose the current selection (or whole score if no selection).
     * @param {number} mode         0=TO_KEY, 1=BY_INTERVAL, 2=DIATONICALLY
     * @param {number} direction    0=UP, 1=DOWN, 2=CLOSEST
     * @param {number} key          target key (-7..7, only used for TO_KEY mode)
     * @param {number} interval     interval index (0-25 chromatic, 0-6 diatonic)
     * @param {boolean} trKeys      transpose key signatures
     * @param {boolean} trChordNames transpose chord symbols
     * @param {boolean} useDoubleSharpsFlats use double sharps/flats
     * @returns {Promise<boolean>}
     */
    async transpose(mode, direction, key, interval, trKeys, trChordNames, useDoubleSharpsFlats) {
        return Module.ccall('transpose', 'boolean',
            ['number', 'number', 'number', 'number', 'number', 'boolean', 'boolean', 'boolean', 'number'],
            [this.scoreptr, mode, direction, key, interval, trKeys, trChordNames, useDoubleSharpsFlats, this.excerptId])
    }

    /**
     * Select all elements in the score.
     * @returns {Promise<boolean>}
     */
    async selectAll() {
        return Module.ccall('selectAll', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
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
     * Enable or disable note entry mode
     * @param {boolean} enabled
     * @returns {Promise<boolean>}
     */
    async setNoteEntryMode(enabled) {
        return Module.ccall('setNoteEntryMode', 'boolean', ['number', 'number', 'number'], [this.scoreptr, enabled ? 1 : 0, this.excerptId])
    }

    /**
     * Get the engine-owned note input cursor in page coordinates.
     * @returns {Promise<{page: number, x: number, y: number, width: number, height: number, voice: number} | null>}
     */
    async getNoteInputCursorRect() {
        const dataptr = Module.ccall('getNoteInputCursorRect', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        const json = WasmRes.readText(dataptr)
        if (!json) return null
        try {
            return JSON.parse(json)
        } catch (e) {
            return null
        }
    }

    /**
     * Set note entry method
     * @param {number} method see engraving::NoteEntryMethod enum
     * @returns {Promise<boolean>}
     */
    async setNoteEntryMethod(method) {
        return Module.ccall('setNoteEntryMethod', 'boolean', ['number', 'number', 'number'], [this.scoreptr, method, this.excerptId])
    }

    /**
     * Seed input state (segment/track/duration) from the current selection
     * @returns {Promise<boolean>}
     */
    async setInputStateFromSelection() {
        return Module.ccall('setInputStateFromSelection', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Set accidental type for note entry input
     * @param {number} accidentalType see engraving::AccidentalType enum
     * @returns {Promise<boolean>}
     */
    async setInputAccidentalType(accidentalType) {
        return Module.ccall('setInputAccidentalType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, accidentalType, this.excerptId])
    }

    /**
     * Set input duration type for note entry
     * @param {number} durationType see engraving::DurationType enum
     * @returns {Promise<boolean>}
     */
    async setInputDurationType(durationType) {
        return Module.ccall('setInputDurationType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, durationType, this.excerptId])
    }

    /**
     * Toggle dotting for the current input duration
     * @returns {Promise<boolean>}
     */
    async toggleInputDot() {
        return Module.ccall('toggleInputDot', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Place a note at a page-relative point while in note entry mode
     * (click-to-place). Honors the current input duration/accidental/voice.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @param {boolean} replace
     * @param {boolean} insert
     * @returns {Promise<boolean>}
     */
    async putNote(pageNumber, x, y, replace = false, insert = false) {
        return Module.ccall('putNote',
            'boolean',
            ['number', 'number', 'number', 'number', 'boolean', 'boolean', 'number'],
            [this.scoreptr, pageNumber, x, y, replace, insert, this.excerptId]
        )
    }

    /**
     * Add a pitch by letter step (0=C ... 6=B)
     * @param {number} note
     * @param {boolean} addToChord
     * @param {boolean} insert
     * @returns {Promise<boolean>}
     */
    async addPitchByStep(note, addToChord = false, insert = false) {
        return Module.ccall(
            'addPitchByStep',
            'boolean',
            ['number', 'number', 'number', 'number', 'number'],
            [this.scoreptr, note, addToChord ? 1 : 0, insert ? 1 : 0, this.excerptId],
        )
    }

    /**
     * Enter a rest at the input cursor using the current duration
     * @returns {Promise<boolean>}
     */
    async enterRest() {
        return Module.ccall('enterRest', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Set duration type for the current selection
     * @param {number} durationType see engraving::DurationType enum
     * @returns {Promise<boolean>}
     */
    async setDurationType(durationType) {
        return Module.ccall('setDurationType', 'boolean', ['number', 'number', 'number'], [this.scoreptr, durationType, this.excerptId])
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
     * Move selected elements to another voice
     * @param {number} voiceIndex
     * @returns {Promise<boolean>}
     */
    async changeSelectedElementsVoice(voiceIndex) {
        return Module.ccall('changeSelectedElementsVoice', 'boolean', ['number', 'number', 'number'], [this.scoreptr, voiceIndex, this.excerptId])
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
     * Incrementally layout enough of the score so `pageNumber` can be exported.
     * Useful for faster first paint on very large scores loaded with `doLayout=false`.
     * @param {number} pageNumber zero-based target page index
     * @returns {Promise<boolean>}
     */
    async layoutUntilPage(pageNumber = 0) {
        return Module.ccall('layoutUntilPage', 'boolean', ['number', 'number', 'number'], [this.scoreptr, pageNumber, this.excerptId])
    }

    /**
     * Incrementally layout until target page and return structured progress state.
     * @param {number} pageNumber zero-based target page index
     * @returns {Promise<Record<string, any>>}
     */
    async layoutUntilPageState(pageNumber = 0) {
        const dataptr = Module.ccall('layoutUntilPageState', 'number', ['number', 'number', 'number'], [this.scoreptr, pageNumber, this.excerptId])
        return JSON.parse(WasmRes.readText(dataptr))
    }

    /**
     * Set the layout mode for rendering (e.g., PAGE, LINE).
     * @param {number} layoutMode see engraving::LayoutMode enum
     * @returns {Promise<boolean>}
     */
    async setLayoutMode(layoutMode) {
        return Module.ccall('setLayoutMode', 'boolean', ['number', 'number', 'number'], [this.scoreptr, layoutMode, this.excerptId])
    }

    /**
     * Get the current layout mode.
     * @returns {Promise<number>}
     */
    async getLayoutMode() {
        const dataptr = Module.ccall('getLayoutMode', 'number', ['number', 'number'], [this.scoreptr, this.excerptId])
        return WasmRes.readNum(dataptr)
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
     * Add a hairpin at the current selection
     * @param {number} hairpinType see engraving::HairpinType enum (0=cresc, 1=decresc)
     * @returns {Promise<boolean>}
     */
    async addHairpin(hairpinType) {
        return Module.ccall('addHairpin', 'boolean', ['number', 'number', 'number'], [this.scoreptr, hairpinType, this.excerptId])
    }

    /** Add a fermata variant to each selected chord/rest. */
    async addFermata(fermataVariant) {
        return Module.ccall('addFermata', 'boolean', ['number', 'number', 'number'], [this.scoreptr, fermataVariant, this.excerptId])
    }

    /** Add a breath or caesura to each selected chord/rest boundary. */
    async addBreath(breathType) {
        return Module.ccall('addBreath', 'boolean', ['number', 'number', 'number'], [this.scoreptr, breathType, this.excerptId])
    }

    /** Add an arpeggio to each selected multi-note chord. */
    async addArpeggio(arpeggioType) {
        return Module.ccall('addArpeggio', 'boolean', ['number', 'number', 'number'], [this.scoreptr, arpeggioType, this.excerptId])
    }

    /** Add a single- or two-note tremolo to the selected chord(s). */
    async addTremolo(tremoloType) {
        return Module.ccall('addTremolo', 'boolean', ['number', 'number', 'number'], [this.scoreptr, tremoloType, this.excerptId])
    }

    /** Add an ottava line to the current selection. */
    async addOttava(ottavaType) {
        return Module.ccall('addOttava', 'boolean', ['number', 'number', 'number'], [this.scoreptr, ottavaType, this.excerptId])
    }

    /** Add a trill line to the current selection. */
    async addTrill(trillType) {
        return Module.ccall('addTrill', 'boolean', ['number', 'number', 'number'], [this.scoreptr, trillType, this.excerptId])
    }

    /** Add a glissando between exactly two selected notes. */
    async addGlissando(glissandoType) {
        return Module.ccall('addGlissando', 'boolean', ['number', 'number', 'number'], [this.scoreptr, glissandoType, this.excerptId])
    }

    /** Add a semantic navigation marker to the selected measure. */
    async addMarker(markerType) {
        return Module.ccall('addMarker', 'boolean', ['number', 'number', 'number'], [this.scoreptr, markerType, this.excerptId])
    }

    /** Add a semantic playback jump to the selected measure. */
    async addJump(jumpType) {
        return Module.ccall('addJump', 'boolean', ['number', 'number', 'number'], [this.scoreptr, jumpType, this.excerptId])
    }

    /** Apply a curated notehead group to the selected notes. */
    async setNoteheadGroup(noteheadGroup) {
        return Module.ccall('setNoteheadGroup', 'boolean', ['number', 'number', 'number'], [this.scoreptr, noteheadGroup, this.excerptId])
    }

    /** Apply a MuseScore beam mode to the selected chord/rests. */
    async setBeamMode(beamMode) {
        return Module.ccall('setBeamMode', 'boolean', ['number', 'number', 'number'], [this.scoreptr, beamMode, this.excerptId])
    }

    /** Replace the native range-selection filter bitmask. */
    async setSelectionFilter(filterMask) {
        return Module.ccall('setSelectionFilter', 'boolean', ['number', 'number', 'number'], [this.scoreptr, filterMask, this.excerptId])
    }

    /** Replace empty selected measures with a semantic measure-repeat group. */
    async addMeasureRepeat(numMeasures) {
        return Module.ccall('addMeasureRepeat', 'boolean', ['number', 'number', 'number'], [this.scoreptr, numMeasures, this.excerptId])
    }

    /** Enable or disable score-wide multi-measure rest creation. */
    async setMultiMeasureRests(enabled) {
        return Module.ccall('setMultiMeasureRests', 'boolean', ['number', 'boolean', 'number'], [this.scoreptr, enabled, this.excerptId])
    }

    async multiMeasureRestsEnabled() {
        return Module.ccall('multiMeasureRestsEnabled', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Add a pedal marking at the current selection
     * @param {number} pedalVariant 0=line, 1=text
     * @returns {Promise<boolean>}
     */
    async addPedal(pedalVariant) {
        return Module.ccall('addPedal', 'boolean', ['number', 'number', 'number'], [this.scoreptr, pedalVariant, this.excerptId])
    }

    /**
     * Add a sostenuto pedal marking at the current selection
     * @returns {Promise<boolean>}
     */
    async addSostenutoPedal() {
        return Module.ccall('addSostenutoPedal', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Add an una corda marking at the current selection
     * @returns {Promise<boolean>}
     */
    async addUnaCorda() {
        return Module.ccall('addUnaCorda', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Split a pedal line at the current selection
     * @returns {Promise<boolean>}
     */
    async splitPedal() {
        return Module.ccall('splitPedal', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
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
     * Add figured bass text at the current selection
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async addFiguredBassText(text) {
        const strptr = getStrPtr(text == null ? '' : String(text))
        try {
            return Module.ccall('addFiguredBassText', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
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
    /** Flip the stem direction of the selected note(s)/chord(s). */
    async flipStem() {
        return Module.ccall('flipStem', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

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
     * Insert new measures around the current selection or score edges.
     * @param {number} count
     * @param {number} target Target enum: 0 after selection, 1 before selection, 2 start of score, 3 end of score
     */
    async insertMeasures(count, target) {
        return Module.ccall('insertMeasures', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, count, target, this.excerptId])
    }

    /**
     * Add a pickup (anacrusis) measure at the start of the score.
     * @param {number} numerator  Pickup duration numerator
     * @param {number} denominator  Pickup duration denominator
     * @returns {Promise<boolean>}
     */
    async addPickupMeasure(numerator, denominator) {
        return Module.ccall('addPickupMeasure', 'boolean', ['number', 'number', 'number', 'number'], [this.scoreptr, numerator, denominator, this.excerptId])
    }

    /**
     * Remove all trailing empty measures from the end of the score
     * @returns {Promise<boolean>}
     */
    async removeTrailingEmptyMeasures() {
        return Module.ccall('removeTrailingEmptyMeasures', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
    }

    /**
     * Remove the measure(s) containing the current selection.
     * @returns {Promise<boolean>}
     */
    async removeSelectedMeasures() {
        return Module.ccall('removeSelectedMeasures', 'boolean', ['number', 'number'], [this.scoreptr, this.excerptId])
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
     * Set the time signature (global) with a specific display type.
     * @param {number} numerator
     * @param {number} denominator
     * @param {number} timeSigType 0=Normal, 1=Common time, 2=Cut time
     * @returns {Promise<boolean>}
     */
    async setTimeSignatureWithType(numerator, denominator, timeSigType) {
        return Module.ccall('setTimeSignatureWithType', 'boolean', ['number', 'number', 'number', 'number', 'number'], [this.scoreptr, numerator, denominator, timeSigType, this.excerptId])
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
     * Set chord symbol interpretation mode.
     * @param {boolean} literal true = Literal, false = Jazz
     * @returns {Promise<boolean>}
     */
    async setHarmonyVoiceLiteral(literal) {
        return Module.ccall('setHarmonyVoiceLiteral', 'boolean', ['number', 'boolean', 'number'], [this.scoreptr, literal, this.excerptId])
    }

    /**
     * Set chord symbol style preset.
     * @param {'std' | 'jazz'} preset
     * @returns {Promise<boolean>}
     */
    async setChordSymbolStylePreset(preset) {
        const strptr = getStrPtr(preset == null ? '' : String(preset))
        try {
            return Module.ccall('setChordSymbolStylePreset', 'boolean', ['number', 'number', 'number'], [this.scoreptr, strptr, this.excerptId])
        } finally {
            freePtr(strptr)
        }
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
