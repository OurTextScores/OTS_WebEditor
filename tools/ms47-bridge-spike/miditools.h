#pragma once
// MIDI export through upstream's ExportMidi (Qt-free via the MidiIODevice adapter in the upstream patch).
// Same contract as the 4.00 bridge: saveMidi(expandRepeats, exportRPNs) with the score's synthesizer state.

#include "global/io/buffer.h"
#include "engraving/dom/masterscore.h"
#include "importexport/midi/internal/midiexport/exportmidi.h"

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* saveMidi(uintptr_t score_ptr, bool midiExpandRepeats, bool exportRPNs, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    ByteArray bytes;
    io::Buffer buffer(&bytes);
    buffer.open(io::IODevice::WriteOnly);
    mu::iex::midi::MidiIODevice device(&buffer);
    mu::iex::midi::ExportMidi exportMidi(score);
    const bool ok = exportMidi.write(&device, midiExpandRepeats, exportRPNs, score->synthesizerState());
    buffer.close();
    return ok ? response(bytes) : textResponse("Could not write MIDI", 1);
}

} // extern "C"
