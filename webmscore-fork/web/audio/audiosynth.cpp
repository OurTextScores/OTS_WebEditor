
#include <cmath>

#include "global/log.h"
#include "async/processevents.h"

#include "audio/internal/worker/playback.h"
#include "audio/internal/worker/audioengine.h"
#include "playback/iplaybackcontroller.h"

#include "./audiosynth.h"

namespace MainAudio {

std::deque<std::function<Synth::SynthRes*(bool)>> Synth::synthIterators;

/**
 * De-interleave audio channels
 * @param dest: [ channelA #len frames, channelB #len frames ]
 * @param src:  [ channelA frame0, channelB frame0, channelA frame1, channelB frame1, ... ]
 */
void deInterleave(float* dest, const float* src, size_t framesLen) {
    for (size_t i = 0, j = 0; i < framesLen; i++, j+=2) {
        dest[i] = src[j];
        dest[framesLen + i] = src[j+1];
    }
}

static audio::ITrackSequencePtr resolveRenderableSequence(audio::Playback* playback, mu::playback::IPlaybackController* playbackController)
{
    if (!playback) {
        return nullptr;
    }

    if (playbackController) {
        const audio::TrackSequenceId currentId = playbackController->currentTrackSequenceId();
        if (currentId >= 0) {
            auto sequences = playback->getSequences();
            auto current = sequences.find(currentId);
            if (current != sequences.end() && current->second) {
                if (!current->second->trackIdList().empty()) {
                    return current->second;
                }
                // Fall back only if current sequence exists but is still loading tracks.
                return current->second;
            }
        }
    }

    for (const auto& pair : playback->getSequences()) {
        if (pair.second && !pair.second->trackIdList().empty()) {
            return pair.second;
        }
    }

    for (const auto& pair : playback->getSequences()) {
        if (pair.second) {
            return pair.second;
        }
    }

    return nullptr;
}

static audio::ITrackSequencePtr waitForRenderableSequence(audio::Playback* playback, mu::playback::IPlaybackController* playbackController, int maxPumps = 400)
{
    for (int i = 0; i < maxPumps; ++i) {
        audio::ITrackSequencePtr sequence = resolveRenderableSequence(playback, playbackController);
        if (sequence && !sequence->trackIdList().empty()) {
            if (i > 0) {
                LOGI() << "waitForRenderableSequence: ready after " << i << " processEvents() pumps";
            }
            return sequence;
        }
        mu::async::processEvents();
    }

    return resolveRenderableSequence(playback, playbackController);
}

const char* Synth::processBatch(int batchSize, bool cancel) {
    auto resArr = (SynthRes**)calloc(batchSize, sizeof(SynthRes*)); // array of pointers to SynthRes data 
    for (int i = 0; i < batchSize; i++) {
        resArr[i] = (*synthFn)(cancel);
    }
    return reinterpret_cast<const char*>(resArr);
}

Synth Synth::start(MainScore score, float starttime, float renderDurationSeconds, bool muteMainStream) {
    (void)score;
    LOGI() << String(u"starttime %1").arg(starttime);

    // use buffer size of 512 frames
    static const size_t renderStep = 512;
    static const size_t channels = 2;
    static const size_t sampleRate = 44100;

    // Wait async ticks, otherwise `sequenceIdList` is empty
    //  previous `Playback::addSequence()` is a `Promise`
    mu::async::processEvents();
    //  resolve `totalDuration`
    mu::async::processEvents();

    auto playback = modularity::ioc()->resolve<audio::Playback>("");
    IF_ASSERT_FAILED(playback) {
        LOGE() << "playback service unavailable";
        return nullptr;
    }

    auto playbackController = modularity::ioc()->resolve<mu::playback::IPlaybackController>("");
    audio::ITrackSequencePtr sequence = waitForRenderableSequence(playback.get(), playbackController.get());
    IF_ASSERT_FAILED(sequence) {
        LOGE() << "no playback sequence found!";
        printf("[WASM SYNTH] no sequence\n");
        return nullptr;
    }
    printf("[WASM SYNTH] sequenceId=%d trackCount=%zu\n",
           static_cast<int>(sequence->id()),
           sequence->trackIdList().size());
    if (sequence->trackIdList().empty()) {
        LOGW() << "selected playback sequence has no tracks; preview may be silent";
    }

    // Seek
    // https://github.com/LibreScore/webmscore/blob/v4.0/src/framework/audio/internal/worker/audiooutputhandler.cpp#L200-L201
    sequence->player()->stop();

    const auto totalDuration = sequence->player()->duration();
    const float seekSeconds = muteMainStream ? 0.f : starttime;
    sequence->player()->seek(seekSeconds * 1000); // get ms

    // Setup audio source
    // https://github.com/LibreScore/webmscore/blob/v4.0/src/framework/audio/internal/soundtracks/soundtrackwriter.cpp#L73-L76
    audio::AudioEngine::instance()->setMode(audio::RenderMode::OfflineMode);
    auto source = audio::AudioEngine::instance()->mixer();
    source->setSampleRate(sampleRate);
    // Preview mode uses off-stream (one-shot) events; keep sequencer inactive so
    // AbstractEventSequencer::eventsToBePlayed() consumes off-stream data.
    source->setIsActive(!muteMainStream);

    // https://github.com/LibreScore/webmscore/blob/v4.0/src/framework/audio/internal/soundtracks/soundtrackwriter.cpp#L49
    const audio::samples_t totalSamples = (totalDuration / 1000000.f) * sampleRate;
    const bool fixedDuration = renderDurationSeconds > 0.f;
    const audio::samples_t renderedSamples = fixedDuration
        ? static_cast<audio::samples_t>(renderDurationSeconds * sampleRate)
        : totalSamples;
    LOGI() << String(u"totalDuration %1, totalSamples %2").arg(totalDuration).arg((int64_t)renderedSamples);

    bool done = false;
    audio::samples_t playedSamples = fixedDuration ? 0 : static_cast<audio::samples_t>(starttime * sampleRate);
    auto synthIterator = [done, playedSamples, renderedSamples, source, muteMainStream, logged = false](bool cancel = false) mutable -> SynthRes* { // must use by-copy capture because variables are destroyed as the `_synthAudio` function ends
        if (done) {
            return new SynthRes{done, -1, -1, 0, {}};
        }

        float buffer[renderStep * channels] = {};
        auto res = (SynthRes*)calloc(1, sizeof(SynthRes) + sizeof(buffer)); 
        res->chunkSize = sizeof(buffer);

        // render audio buffer
        source->process(buffer, renderStep);
        if (!logged) {
            float peak = 0.f;
            for (size_t i = 0; i < renderStep * channels; ++i) {
                peak = std::max(peak, std::abs(buffer[i]));
            }
            printf("[WASM SYNTH] firstChunkPeak=%.6f preview=%d\n", peak, muteMainStream ? 1 : 0);
            logged = true;
        }
        deInterleave((float*)res->chunk, buffer, renderStep);

        auto prevPlayed = playedSamples;
        playedSamples += renderStep;
        if (playedSamples >= renderedSamples || cancel) {
            // finished, do cleanup
            source->setIsActive(false);
            done = true;
        }

        res->done = done;
        res->startTime = float(prevPlayed) / sampleRate;
        res->endTime = float(playedSamples) / sampleRate;

        return res;
    };

    // persist this `synthIterator` function
    synthIterators.push_back(synthIterator);

    return Synth(&synthIterators.back());
}

Synth Synth::startPreview(MainScore score, float durationSeconds) {
    constexpr float kDefaultPreviewSeconds = 0.5f;
    const float safeDuration = durationSeconds > 0.f ? durationSeconds : kDefaultPreviewSeconds;
    return start(score, 0.f, safeDuration, true);
}

} // namespace MainAudio
