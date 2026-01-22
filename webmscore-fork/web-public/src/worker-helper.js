// @ts-check

// The main entry point to use webmscore as a web worker,  
// implements the same API set as './index.js'

import { WebMscoreWorker } from '../.cache/worker.js'
import { getSelfURL, shimDom } from './utils.js'

// Check if MSCORE_SCRIPT_URL is defined globally (by webpack DefinePlugin for embedded builds)
// If not, fallback to getSelfURL() which extracts the path from the current script
const MSCORE_SCRIPT_URL = typeof globalThis.MSCORE_SCRIPT_URL !== 'undefined'
    ? globalThis.MSCORE_SCRIPT_URL
    : getSelfURL()

/**
 * Reconstruct `Error` objects sent from the web worker
 * 
 * Native `Error` types can't be cloned by structured clone algorithm
 */
class WorkerError extends Error {
    /**
     * @param {Error} err
     */
    constructor(err) {
        super()
        this.name = err.name
        this.message = err.message
        this.originalStack = err.stack
    }
}

/**
 * Set the log level when the instance is created  
 * default: 0 (Off)
 * @see WebMscore.setLogLevel
 */
let _logLevel = 0

/**
 * Use webmscore as a web worker
 * @implements {import('./index').default}
 */
class WebMscoreW {
    /**
     * @hideconstructor use `WebMscoreW.load`
     */
    constructor() {
        const refreshStub = 'var $RefreshSig$ = () => (type) => type; var $RefreshReg$ = () => {};';
        const url = URL.createObjectURL(
            new Blob([
                `(function () { var MSCORE_SCRIPT_URL = "${MSCORE_SCRIPT_URL}";`  // set the environment variable for worker
                + refreshStub // avoid React Fast Refresh helpers leaking into worker builds
                + '(' + shimDom.toString() + ')();'
                // %INJECTION_HINT_1%
                + '(' + WebMscoreWorker.toString() + ')()'
                + '})()'
            ])
        )
        /** @private */
        this.worker = new Worker(url)
        /** @private */
        this.workerURL = url
    }

    /**
     * @returns {Promise<void>}
     */
    static get ready() {
        // not implemented
        return Promise.resolve()
    }

    /**
     * The maximum MSCZ/MSCX file format version supported by webmscore 
     */
    static async version() {
        // not implemented
        return -1
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
        _logLevel = level
    }

    /**
     * Load score data
     * @param {import('../schemas').InputFileFormat} format 
     * @param {Uint8Array} data 
     * @param {Uint8Array[] | Promise<Uint8Array[]>} fonts load extra font files (CJK characters support)
     * @param {boolean} doLayout set to false if you only need the score metadata or the midi file (Super Fast, 3x faster than the musescore software)
     */
    static async load(format, data, fonts = [], doLayout = true) {
        const instance = new WebMscoreW()
        const [_fonts] = await Promise.all([
            fonts,
            instance.rpc('ready')
        ])
        await instance.rpc('setLogLevel', [_logLevel]) // default 0 (Off)
        await instance.rpc('load', [format, data, _fonts, doLayout], [data.buffer, ..._fonts.map(f => f.buffer)])
        return instance
    }

    /**
     * Communicate with the worker thread with JSON-RPC
     * @private
     * @typedef {{ id: number; result?: any; error?: any; }} RPCRes
     * @param {keyof import('./index').default | '_synthAudio' | 'processSynth' | 'processSynthBatch' | 'load' | 'ready' | 'setLogLevel'} method 
     * @param {any[]} params 
     * @param {Transferable[]} transfer
     */
    async rpc(method, params = [], transfer = []) {
        const id = Math.random()

        return new Promise((resolve, reject) => {
            const listener = (e) => {
                /** @type {RPCRes} */
                const data = e.data
                if (data.id === id) {
                    if (data.error) { reject(new WorkerError(data.error)) }
                    this.worker.removeEventListener('message', listener)
                    resolve(data.result)
                }
            }

            this.worker.addEventListener('message', listener)

            this.worker.postMessage({
                id,
                method,
                params,
            }, transfer)
        })
    }

    /**
     * Only save this excerpt (linked parts) of the score  
     * 
     * if no excerpts, generate excerpts from existing instrument parts
     * 
     * @param {number} id  `-1` means the full score 
     * @returns {Promise<void>}
     */
    setExcerptId(id) {
        return this.rpc('setExcerptId', [id])
    }

    /**
     * @returns {Promise<number>}
     */
    getExcerptId() {
        return this.rpc('getExcerptId')
    }

    /**
     * Generate excerpts from Parts (only parts that are visible) if no existing excerpts
     * @returns {Promise<void>}
     */
    generateExcerpts() {
        return this.rpc('generateExcerpts')
    }

    /**
     * Get the score title
     * @returns {Promise<string>}
     */
    title() {
        return this.rpc('title')
    }

    /**
     * Get the score subtitle
     * @returns {Promise<string>}
     */
    subtitle() {
        return this.rpc('subtitle')
    }

    /**
     * Get the score title (filename safe, replaced some characters)
     * @returns {Promise<string>}
     */
    titleFilenameSafe() {
        return this.rpc('titleFilenameSafe')
    }

    /**
     * Set the score title in the first title frame (VBox)
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    setTitleText(text) {
        return this.rpc('setTitleText', [text])
    }

    /**
     * Set the score subtitle in the first title frame (VBox)
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    setSubtitleText(text) {
        return this.rpc('setSubtitleText', [text])
    }

    /**
     * Set the score composer in the first title frame (VBox)
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    setComposerText(text) {
        return this.rpc('setComposerText', [text])
    }

    /**
     * Set the score lyricist in the first title frame (VBox)
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    setLyricistText(text) {
        return this.rpc('setLyricistText', [text])
    }

    /**
     * Set the text value for the currently selected text element.
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    setSelectedText(text) {
        return this.rpc('setSelectedText', [text])
    }

    /**
     * Append a new part using an instrument template id
     * @param {string} instrumentId
     * @returns {Promise<boolean>}
     */
    appendPart(instrumentId) {
        return this.rpc('appendPart', [instrumentId])
    }

    /**
     * Append a new part using a MusicXML instrument id
     * @param {string} instrumentMusicXmlId
     * @returns {Promise<boolean>}
     */
    appendPartByMusicXmlId(instrumentMusicXmlId) {
        return this.rpc('appendPartByMusicXmlId', [instrumentMusicXmlId])
    }

    /**
     * Remove a part by index
     * @param {number} partIndex
     * @returns {Promise<boolean>}
     */
    removePart(partIndex) {
        return this.rpc('removePart', [partIndex])
    }

    /**
     * Toggle part visibility by index
     * @param {number} partIndex
     * @param {boolean} visible
     * @returns {Promise<boolean>}
     */
    setPartVisible(partIndex, visible) {
        return this.rpc('setPartVisible', [partIndex, visible])
    }

    /**
     * List available instrument templates
     * @returns {Promise<any[]>}
     */
    listInstrumentTemplates() {
        return this.rpc('listInstrumentTemplates')
    }

    /**
     * Get the number of pages in the score (or the excerpt if `excerptId` is set)
     * @returns {Promise<number>}
     */
    npages() {
        return this.rpc('npages')
    }

    /**
     * Get the number of measures in a part (measure index basis for signatures).
     * @param {number} partIndex
     * @returns {Promise<number>}
     */
    measureSignatureCount(partIndex) {
        return this.rpc('measureSignatureCount', [partIndex])
    }

    /**
     * Get a compact signature string for a specific part measure.
     * @param {number} partIndex
     * @param {number} measureIndex
     * @returns {Promise<string>}
     */
    measureSignatureAt(partIndex, measureIndex) {
        return this.rpc('measureSignatureAt', [partIndex, measureIndex])
    }

    /**
     * Get all measure signatures for a part.
     * @param {number} partIndex
     * @returns {Promise<string[]>}
     */
    measureSignatures(partIndex) {
        return this.rpc('measureSignatures', [partIndex])
    }

    /**
     * Get line break flags for each measure in the score.
     * @returns {Promise<boolean[]>}
     */
    measureLineBreaks() {
        return this.rpc('measureLineBreaks')
    }

    /**
     * Set line break flags for each measure in the score.
     * @param {boolean[]} breaks
     * @returns {Promise<boolean>}
     */
    setMeasureLineBreaks(breaks) {
        return this.rpc('setMeasureLineBreaks', [breaks])
    }

    /**
     * Get score metadata
     * @returns {Promise<import('../schemas').ScoreMetadata>}
     */
    metadata() {
        return this.rpc('metadata')
    }

    /**
     * Get the positions of measures
     * @returns {Promise<import('../schemas').Positions>}
     */
    measurePositions() {
        return this.rpc('measurePositions')
    }

    /**
     * Get the positions of segments
     * @returns {Promise<import('../schemas').Positions>}
     */
    segmentPositions() {
        return this.rpc('segmentPositions')
    }

    /**
     * Export score as MusicXML file
     * @returns {Promise<string>} contents of the MusicXML file (plain text)
     */
    saveXml() {
        return this.rpc('saveXml')
    }

    /**
     * Export score as compressed MusicXML file
     * @returns {Promise<Uint8Array>}
     */
    saveMxl() {
        return this.rpc('saveMxl')
    }

    /**
     * Save part score as MSCZ/MSCX file
     * @param {'mscz' | 'mscx'} format 
     * @returns {Promise<Uint8Array>}
     */
    saveMsc(format = 'mscz') {
        return this.rpc('saveMsc', [format])
    }

    /**
     * Export score as the SVG file of one page
     * @param {number} pageNumber integer
     * @param {boolean} drawPageBackground
     * @param {boolean} highlightSelection - if true, selected elements will be rendered with selection color
     * @returns {Promise<string>} contents of the SVG file (plain text)
     */
    saveSvg(pageNumber = 0, drawPageBackground = false, highlightSelection = false) {
        return this.rpc('saveSvg', [pageNumber, drawPageBackground, highlightSelection])
    }

    /**
     * Export score as the PNG file of one page
     * @param {number} pageNumber integer
     * @param {boolean} drawPageBackground 
     * @param {boolean} transparent
     * @returns {Promise<Uint8Array>}
     */
    savePng(pageNumber = 0, drawPageBackground = false, transparent = true) {
        return this.rpc('savePng', [pageNumber, drawPageBackground, transparent])
    }

    /**
     * Export score as PDF file
     * @returns {Promise<Uint8Array>}
     */
    savePdf() {
        return this.rpc('savePdf')
    }

    /**
     * Export score as MIDI file
     * @param {boolean} midiExpandRepeats 
     * @param {boolean} exportRPNs 
     * @returns {Promise<Uint8Array>}
     */
    saveMidi(midiExpandRepeats = true, exportRPNs = true) {
        return this.rpc('saveMidi', [midiExpandRepeats, exportRPNs])
    }

    /**
     * Set the soundfont (sf2/sf3) data
     * @param {Uint8Array} data 
     * @returns {Promise<void>}
     */
    setSoundFont(data) {
        return this.rpc('setSoundFont', [data], [data.buffer])
    }

    /**
     * Export score as audio file (wav/ogg/flac/mp3)
     * @param {'wav' | 'ogg' | 'flac' | 'mp3'} format 
     * @returns {Promise<Uint8Array>}
     */
    saveAudio(format) {
        return this.rpc('saveAudio', [format])
    }

    /**
     * Export positions of measures or segments (if `ofSegments` == true) as JSON string
     * @param {boolean} ofSegments
     * @also `score.measurePositions()` and `score.segmentPositions()`
     * @returns {Promise<string>}
     */
    savePositions(ofSegments) {
        return this.rpc('savePositions', [ofSegments])
    }

    /**
     * Synthesize audio frames
     * @param {number} starttime The start time offset in seconds
     * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes>>} The iterator function
     */
    async synthAudio(starttime = 0) {
        const fnptr = await this.rpc('_synthAudio', [starttime])
        return (cancel) => {
            return this.rpc('processSynth', [fnptr, cancel])
        }
    }

    /**
     * Synthesize audio frames in bulk
     * @param {number} starttime - The start time offset in seconds
     * @param {number} batchSize - max number of result SynthRes' (n * 512 frames)
     * @returns {Promise<(cancel?: boolean) => Promise<import('../schemas').SynthRes[]>>}
     */
    async synthAudioBatch(starttime, batchSize) {
        const fnptr = await this.rpc('_synthAudio', [starttime])
        return (cancel) => {
            return this.rpc('processSynthBatch', [fnptr, batchSize, cancel])
        }
    }

    /**
     * Export score metadata as JSON string
     * @also `score.metadata()`
     * @returns {Promise<string>} contents of the JSON file
     */
    saveMetadata() {
        return this.rpc('saveMetadata')
    }

    /**
     * Select the topmost selectable element near a page-relative point.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @returns {Promise<boolean>}
     */
    selectElementAtPoint(pageNumber, x, y) {
        return this.rpc('selectElementAtPoint', [pageNumber, x, y])
    }

    /**
     * Select a measure near a page-relative point.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @returns {Promise<boolean>}
     */
    selectMeasureAtPoint(pageNumber, x, y) {
        return this.rpc('selectMeasureAtPoint', [pageNumber, x, y])
    }

    /**
     * Select a measure by index for a specific part.
     * @param {number} partIndex
     * @param {number} measureIndex
     * @returns {Promise<boolean>}
     */
    selectPartMeasureByIndex(partIndex, measureIndex) {
        return this.rpc('selectPartMeasureByIndex', [partIndex, measureIndex])
    }

    /**
     * Select a text element near a page-relative point.
     * @param {number} pageNumber zero-based page index
     * @param {number} x
     * @param {number} y
     * @returns {Promise<boolean>}
     */
    selectTextElementAtPoint(pageNumber, x, y) {
        return this.rpc('selectTextElementAtPoint', [pageNumber, x, y])
    }

    /**
     * Clear current selection.
     * @returns {Promise<boolean>}
     */
    clearSelection() {
        return this.rpc('clearSelection')
    }

    /**
     * Move selection to the next chord
     * @returns {Promise<boolean>}
     */
    selectNextChord() {
        return this.rpc('selectNextChord')
    }

    /**
     * Move selection to the previous chord
     * @returns {Promise<boolean>}
     */
    selectPrevChord() {
        return this.rpc('selectPrevChord')
    }

    /**
     * Extend selection to the next chord (for Shift+Right arrow)
     * @returns {Promise<boolean>}
     */
    extendSelectionNextChord() {
        return this.rpc('extendSelectionNextChord')
    }

    /**
     * Extend selection to the previous chord (for Shift+Left arrow)
     * @returns {Promise<boolean>}
     */
    extendSelectionPrevChord() {
        return this.rpc('extendSelectionPrevChord')
    }

    /**
     * Get the bounding box of the current selection
     * @returns {Promise<{page: number, x: number, y: number, width: number, height: number} | null>}
     */
    getSelectionBoundingBox() {
        return this.rpc('getSelectionBoundingBox')
    }

    /**
     * Get the bounding boxes of all selected elements (for range selection)
     * @returns {Promise<Array<{page: number, x: number, y: number, width: number, height: number}>>}
     */
    getSelectionBoundingBoxes() {
        return this.rpc('getSelectionBoundingBoxes')
    }

    /**
     * Get the selection MIME type for copy/paste.
     * @returns {Promise<string>}
     */
    selectionMimeType() {
        return this.rpc('selectionMimeType')
    }

    /**
     * Get the selection MIME data for copy/paste.
     * @returns {Promise<Uint8Array>}
     */
    selectionMimeData() {
        return this.rpc('selectionMimeData')
    }

    /**
     * Paste selection data at the current selection.
     * @param {string} mimeType
     * @param {Uint8Array} data
     * @returns {Promise<boolean>}
     */
    pasteSelection(mimeType, data) {
        return this.rpc('pasteSelection', [mimeType, data])
    }

    /**
     * Select element at point with mode.
     * @param {number} pageNumber
     * @param {number} x
     * @param {number} y
     * @param {0|1|2} mode 0=replace, 1=add, 2=toggle
     * @returns {Promise<boolean>}
     */
    selectElementAtPointWithMode(pageNumber, x, y, mode) {
        return this.rpc('selectElementAtPointWithMode', [pageNumber, x, y, mode])
    }

    /**
     * Delete the current selection.
     * @returns {Promise<boolean>}
     */
    deleteSelection() {
        return this.rpc('deleteSelection')
    }

    /**
     * Raise pitch for the current selection.
     * @returns {Promise<boolean>}
     */
    pitchUp() {
        return this.rpc('pitchUp')
    }

    /**
     * Lower pitch for the current selection.
     * @returns {Promise<boolean>}
     */
    pitchDown() {
        return this.rpc('pitchDown')
    }

    /**
     * Transpose the current selection by semitone delta.
     * If there is no selection, this transposes the whole score.
     * @param {number} semitones
     * @returns {Promise<boolean>}
     */
    transpose(semitones) {
        return this.rpc('transpose', [semitones])
    }

    /**
     * Set accidental for the current selection.
     * @param {number} accidentalType see engraving::AccidentalType enum
     * @returns {Promise<boolean>}
     */
    setAccidental(accidentalType) {
        return this.rpc('setAccidental', [accidentalType])
    }

    /**
     * Double the duration of the current selection.
     * @returns {Promise<boolean>}
     */
    doubleDuration() {
        return this.rpc('doubleDuration')
    }

    /**
     * Halve the duration of the current selection.
     * @returns {Promise<boolean>}
     */
    halfDuration() {
        return this.rpc('halfDuration')
    }

    toggleDot() {
        return this.rpc('toggleDot')
    }

    toggleDoubleDot() {
        return this.rpc('toggleDoubleDot')
    }

    setNoteEntryMode(enabled) {
        return this.rpc('setNoteEntryMode', [enabled ? 1 : 0])
    }

    setNoteEntryMethod(method) {
        return this.rpc('setNoteEntryMethod', [method])
    }

    setInputStateFromSelection() {
        return this.rpc('setInputStateFromSelection')
    }

    setInputAccidentalType(accidentalType) {
        return this.rpc('setInputAccidentalType', [accidentalType])
    }

    setInputDurationType(durationType) {
        return this.rpc('setInputDurationType', [durationType])
    }

    toggleInputDot() {
        return this.rpc('toggleInputDot')
    }

    addPitchByStep(note, addToChord = false, insert = false) {
        return this.rpc('addPitchByStep', [note, addToChord ? 1 : 0, insert ? 1 : 0])
    }

    enterRest() {
        return this.rpc('enterRest')
    }

    setDurationType(durationType) {
        return this.rpc('setDurationType', [durationType])
    }

    toggleLineBreak() {
        return this.rpc('toggleLineBreak')
    }

    togglePageBreak() {
        return this.rpc('togglePageBreak')
    }

    setVoice(voiceIndex) {
        return this.rpc('setVoice', [voiceIndex])
    }

    changeSelectedElementsVoice(voiceIndex) {
        return this.rpc('changeSelectedElementsVoice', [voiceIndex])
    }

    addDynamic(dynamicType) {
        return this.rpc('addDynamic', [dynamicType])
    }

    addHairpin(hairpinType) {
        return this.rpc('addHairpin', [hairpinType])
    }

    addPedal(pedalVariant) {
        return this.rpc('addPedal', [pedalVariant])
    }

    addSostenutoPedal() {
        return this.rpc('addSostenutoPedal')
    }

    addUnaCorda() {
        return this.rpc('addUnaCorda')
    }

    splitPedal() {
        return this.rpc('splitPedal')
    }

    addRehearsalMark() {
        return this.rpc('addRehearsalMark')
    }

    addTempoText(bpm) {
        return this.rpc('addTempoText', [bpm])
    }

    addStaffText(text) {
        return this.rpc('addStaffText', [text])
    }

    addSystemText(text) {
        return this.rpc('addSystemText', [text])
    }

    addExpressionText(text) {
        return this.rpc('addExpressionText', [text])
    }

    addLyricText(text) {
        return this.rpc('addLyricText', [text])
    }

    addHarmonyText(variant, text) {
        return this.rpc('addHarmonyText', [variant, text])
    }

    addFingeringText(text) {
        return this.rpc('addFingeringText', [text])
    }

    addLeftHandGuitarFingeringText(text) {
        return this.rpc('addLeftHandGuitarFingeringText', [text])
    }

    addRightHandGuitarFingeringText(text) {
        return this.rpc('addRightHandGuitarFingeringText', [text])
    }

    addStringNumberText(text) {
        return this.rpc('addStringNumberText', [text])
    }

    addInstrumentChangeText(text) {
        return this.rpc('addInstrumentChangeText', [text])
    }

    addStickingText(text) {
        return this.rpc('addStickingText', [text])
    }

    addFiguredBassText(text) {
        return this.rpc('addFiguredBassText', [text])
    }

    addArticulation(articulationSymbolName) {
        return this.rpc('addArticulation', [articulationSymbolName])
    }

    addSlur() {
        return this.rpc('addSlur')
    }

    addTie() {
        return this.rpc('addTie')
    }

    addGraceNote(graceType) {
        return this.rpc('addGraceNote', [graceType])
    }

    /**
     * Add a simple tuplet (e.g. 3, 5, 7) at the current selection.
     * @param {number} tupletCount
     * @returns {Promise<boolean>}
     */
    addTuplet(tupletCount) {
        return this.rpc('addTuplet', [tupletCount])
    }

    /**
     * Convert a selected rest into a note
     * @returns {Promise<boolean>}
     */
    addNoteFromRest() {
        return this.rpc('addNoteFromRest')
    }

    toggleRepeatStart() {
        return this.rpc('toggleRepeatStart')
    }

    toggleRepeatEnd() {
        return this.rpc('toggleRepeatEnd')
    }

    setRepeatCount(count) {
        return this.rpc('setRepeatCount', [count])
    }

    setBarLineType(barLineType) {
        return this.rpc('setBarLineType', [barLineType])
    }

    addVolta(endingNumber) {
        return this.rpc('addVolta', [endingNumber])
    }

    /**
     * Insert new measures around the current selection or score edges.
     * @see WebMscore.insertMeasures
     */
    insertMeasures(count, target) {
        return this.rpc('insertMeasures', [count, target])
    }

    /**
     * Remove all trailing empty measures from the end of the score.
     * @returns {Promise<boolean>}
     */
    removeTrailingEmptyMeasures() {
        return this.rpc('removeTrailingEmptyMeasures')
    }

    /**
     * Remove the measure(s) containing the current selection.
     * @returns {Promise<boolean>}
     */
    removeSelectedMeasures() {
        return this.rpc('removeSelectedMeasures')
    }

    /**
     * Undo the last command.
     * @returns {Promise<boolean>}
     */
    undo() {
        return this.rpc('undo')
    }

    /**
     * Redo the last undone command.
     * @returns {Promise<boolean>}
     */
    redo() {
        return this.rpc('redo')
    }

    /**
     * Force a relayout and update of the current score.
     * @returns {Promise<boolean>}
     */
    relayout() {
        return this.rpc('relayout')
    }

    /**
     * Set the layout mode for rendering (e.g., PAGE, LINE).
     * @param {number} layoutMode
     * @returns {Promise<boolean>}
     */
    setLayoutMode(layoutMode) {
        return this.rpc('setLayoutMode', [layoutMode])
    }

    /**
     * Get the current layout mode.
     * @returns {Promise<number>}
     */
    getLayoutMode() {
        return this.rpc('getLayoutMode')
    }

    /**
     * Set the time signature (global) at the start of the score.
     * @param {number} numerator
     * @param {number} denominator
     * @returns {Promise<boolean>}
     */
    setTimeSignature(numerator, denominator) {
        return this.rpc('setTimeSignature', [numerator, denominator])
    }

    setTimeSignatureWithType(numerator, denominator, timeSigType) {
        return this.rpc('setTimeSignatureWithType', [numerator, denominator, timeSigType])
    }

    /**
     * Set the key signature (global) at the start of the score.
     * @param {number} fifths -7..+7 (Cb..C#)
     * @returns {Promise<boolean>}
     */
    setKeySignature(fifths) {
        return this.rpc('setKeySignature', [fifths])
    }

    /**
     * Get the key signature (global) at the start of the score.
     * @returns {Promise<number>} fifths -7..+7 (Cb..C#)
     */
    getKeySignature() {
        return this.rpc('getKeySignature')
    }

    /**
     * Insert a clef at the current selection/input position.
     * @param {number} clefType see engraving::ClefType enum
     * @returns {Promise<boolean>}
     */
    setClef(clefType) {
        return this.rpc('setClef', [clefType])
    }

    /**
     * @param {boolean=} soft (default `true`)
     *                 * `true`  destroy the score instance only, or
     *                 * `false` destroy the whole WebMscore webworker context 
     * @returns {void}
     */
    destroy(soft = true) {
        if (soft) {
            // destroy the score instance only
            this.rpc('destroy', [soft])
        } else {
            // destroy the whole WebMscore webworker context
            // the default behaviour prior to v0.9.0
            this.worker.terminate()
            URL.revokeObjectURL(this.workerURL) // GC
        }
    }
}

export default WebMscoreW
