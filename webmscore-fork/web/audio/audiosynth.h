
#ifndef MAINAUDIO_SYNTH_H
#define MAINAUDIO_SYNTH_H

#include <deque>
#include <functional>
#include "../score.h"

namespace MainAudio {

class Synth {
public:
    struct SynthRes {
        int done;  // bool
        float startTime; // the chunk's start time in seconds
        float endTime;   // the chunk's end time in seconds (playtime)
        unsigned chunkSize;
        char chunk[0 /* to be chunkSize */];
    };

    typedef std::function<SynthRes*(bool)>* SynthFnPtr;

    Synth(SynthFnPtr f)
        : synthFn(f) {}

    Synth(uintptr_t fn_ptr) {
        synthFn = reinterpret_cast<SynthFnPtr>(fn_ptr);
    };

    inline operator uintptr_t() {
        return reinterpret_cast<uintptr_t>(synthFn);
    }

    inline const char* process(bool cancel) {
        const auto res = (*synthFn)(cancel);
        return reinterpret_cast<const char*>(res);
    }

    const char* processBatch(int batchSize, bool cancel);

    /**
     * synthesize audio frames
     * @param starttime The start time offset in seconds
     */
    static Synth start(MainScore score, float starttime, float renderDurationSeconds = -1.f, bool muteMainStream = false);

    /**
     * synthesize a short preview clip (for isolated note/chord/selection audition)
     * @param durationSeconds Clip duration in seconds
     */
    static Synth startPreview(MainScore score, float durationSeconds);

private:
    SynthFnPtr synthFn = nullptr;

    // Keep pointers stable across push_back() while JS still holds iterator addresses.
    static std::deque<std::function<SynthRes*(bool)>> synthIterators;
};

} // namespace MainAudio

#endif // MAINAUDIO_SYNTH_H
