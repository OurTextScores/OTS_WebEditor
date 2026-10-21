#pragma once
// Playback (DECISIONS.md item 1): upstream 4.7's own audio stack in-process, as the 4.00 fork used 4.00's.
// Engraving's PlaybackModel renders MPE events per instrument track; the audio engine (FluidSynth) plays them
// offline. The services are created and registered as EngineController does, without the RPC channel (the bridge
// is single-threaded and calls the engine directly).

#ifdef MS47_WITH_PLAYBACK

#include <cstring>
#include <map>
#include <memory>

#include "mpe/internal/articulationprofilesrepository.h"
#include "audio/common/audiosanitizer.h"
#include "audio/common/audioutils.h"
#include "audio/engine/internal/audioengine.h"
#include "audio/engine/internal/audioengineconfiguration.h"
#include "audio/engine/internal/engineplayback.h"
#include "audio/engine/internal/mixer.h"
#include "audio/engine/internal/fx/fxresolver.h"
#include "audio/engine/internal/fx/musefxresolver.h"
#include "audio/engine/internal/synthesizers/synthresolver.h"
#include "audio/engine/internal/synthesizers/soundfontrepository.h"
#include "audio/engine/internal/synthesizers/fluidsynth/fluidresolver.h"
#include "engraving/playback/playbackmodel.h"

namespace ms47audio {
using namespace muse::audio;

constexpr sample_rate_t SAMPLE_RATE = 44100;
constexpr samples_t RENDER_STEP = 512;   // frames per chunk, as the 4.00 bridge
constexpr audioch_t CHANNELS = 2;
constexpr double PLAYBACK_TAIL_SECS = 3.0;   // desktop notationplayback.cpp

struct Engine {
    std::shared_ptr<engine::AudioEngineConfiguration> configuration;
    std::shared_ptr<engine::AudioEngine> audioEngine;
    std::shared_ptr<engine::EnginePlayback> playback;
    std::shared_ptr<fx::FxResolver> fxResolver;
    std::shared_ptr<synth::SynthResolver> synthResolver;
    std::shared_ptr<synth::SoundFontRepository> soundFonts;
    std::shared_ptr<muse::mpe::ArticulationProfilesRepository> profiles;
    std::shared_ptr<synth::FluidResolver> fluidResolver;
    AudioInputParams inputParams;   // FluidSynth, automatic presets from the loaded soundfont
    std::string soundFontPath;
};

struct ScorePlayback {
    std::unique_ptr<mu::engraving::PlaybackModel> model;
    TrackSequenceId sequenceId = -1;
};

static std::map<uintptr_t, ScorePlayback> scorePlaybacks;

static OutputSpec outputSpec()
{
    OutputSpec spec;
    spec.sampleRate = SAMPLE_RATE;
    spec.samplesPerChannel = RENDER_STEP;
    spec.audioChannelCount = CHANNELS;
    return spec;
}

static Engine* engine()
{
    static std::unique_ptr<Engine> e;
    if (e) return e.get();
    e = std::make_unique<Engine>();
    AudioSanitizer::setupEngineThread();   // single-threaded: the bridge thread is the engine thread
    auto ioc = muse::modularity::globalIoc();
    const std::string module = "audio_engine";

    e->profiles = std::make_shared<muse::mpe::ArticulationProfilesRepository>(nullptr);
    ioc->registerExport<muse::mpe::IArticulationProfilesRepository>("mpe", e->profiles);

    e->configuration = std::make_shared<engine::AudioEngineConfiguration>();
    e->audioEngine = std::make_shared<engine::AudioEngine>();
    e->playback = std::make_shared<engine::EnginePlayback>();
    e->fxResolver = std::make_shared<fx::FxResolver>();
    e->synthResolver = std::make_shared<synth::SynthResolver>();
    e->soundFonts = std::make_shared<synth::SoundFontRepository>();
    ioc->registerExport<engine::IAudioEngineConfiguration>(module, e->configuration);
    ioc->registerExport<engine::IAudioEngine>(module, e->audioEngine);
    ioc->registerExport<engine::IEnginePlayback>(module, e->playback);
    ioc->registerExport<fx::IFxResolver>(module, e->fxResolver);
    ioc->registerExport<synth::ISynthResolver>(module, e->synthResolver);
    ioc->registerExport<synth::ISoundFontRepository>(module, e->soundFonts);

    e->fxResolver->registerResolver(AudioFxType::MuseFx, std::make_shared<fx::MuseFxResolver>());
    e->fluidResolver = std::make_shared<synth::FluidResolver>();
    e->synthResolver->registerResolver(AudioSourceType::Fluid, e->fluidResolver);

    e->configuration->setConfig(AudioEngineConfig());
    engine::AudioEngine::RenderConstraints consts;   // as EngineController::init
    consts.minSamplesToReserveWhenIdle = minSamplesToReserve(RenderMode::IdleMode);
    consts.minSamplesToReserveInRealtime = minSamplesToReserve(RenderMode::RealTimeMode);
    consts.desiredAudioThreadNumber = e->configuration->desiredAudioThreadNumber();
    consts.minTrackCountForMultithreading = e->configuration->minTrackCountForMultithreading();
    e->audioEngine->init(outputSpec(), consts);
    e->synthResolver->init(e->configuration->defaultAudioInputParams(), outputSpec());
    e->playback->init();
    return e.get();
}

// The JS API writes the soundfont to /MuseScore_General.sf3 (WebMscore.setSoundFont); Node tests can point
// MS47_SOUNDFONT at a host file instead.
static bool ensureSoundFont()
{
    Engine* e = engine();
    const char* override = emscripten_run_script_string("(typeof process !== 'undefined' && process.env.MS47_SOUNDFONT) || ''");
    const std::string path = override && *override ? override : "/MuseScore_General.sf3";
    if (e->soundFontPath == path) return true;
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) {
        LOGE() << "no soundfont at " << path;
        return false;
    }
    fclose(f);
    e->soundFonts->addSoundFont(muse::Uri("file://" + path));
    e->fluidResolver->refresh();
    // The default input names desktop's bundled "MS Basic"; use the loaded soundfont's automatic-preset resource
    // (its id is the soundfont name), which picks General MIDI presets per instrument as 4.00 did
    e->inputParams = e->configuration->defaultAudioInputParams();
    for (const auto& [uri, meta] : e->soundFonts->soundFonts()) {
        if (uri == muse::Uri("file://" + path)) e->inputParams.resourceMeta.id = meta.name;
    }
    e->soundFontPath = path;
    return true;
}

// Build (or rebuild after edits) the score's playback model and engine sequence
static ScorePlayback* preparePlayback(uintptr_t id, mu::engraving::Score* score)
{
    Engine* e = engine();
    ScorePlayback& sp = scorePlaybacks[id];
    if (sp.sequenceId >= 0) {
        e->playback->removeSequence(sp.sequenceId);
    }
    sp.model = std::make_unique<mu::engraving::PlaybackModel>(nullptr);
    sp.model->setPlayRepeats(true);
    sp.model->load(score);
    sp.sequenceId = e->playback->addSequence();
    AudioParams params;
    params.in = e->inputParams;
    for (const mu::engraving::InstrumentTrackId& trackId : sp.model->existingTrackIdSet()) {
        muse::mpe::PlaybackData& data = sp.model->resolveTrackPlaybackData(trackId);
        e->playback->addTrack(sp.sequenceId, trackId.instrumentId.toStdString(), data, params);
    }
    // As desktop NotationPlayback/PlaybackController: total play time with repeats plus the release tail
    const int lastTick = score->repeatList(true).ticks();
    const secs_t total = secs_t(score->utick2utime(lastTick)) + PLAYBACK_TAIL_SECS;
    if (auto sequence = e->playback->sequence(sp.sequenceId)) {
        sequence->player()->setDuration(secsToMilisecs(total));
    }
    return &sp;
}

static void writeWavHeader(muse::ByteArray& out, size_t frames)
{
    auto u32 = [&](uint32_t v) { out.push_back(reinterpret_cast<const uint8_t*>(&v), 4); };
    auto u16 = [&](uint16_t v) { out.push_back(reinterpret_cast<const uint8_t*>(&v), 2); };
    const uint32_t dataBytes = static_cast<uint32_t>(frames * CHANNELS * sizeof(float));
    out.push_back(reinterpret_cast<const uint8_t*>("RIFF"), 4); u32(36 + dataBytes);
    out.push_back(reinterpret_cast<const uint8_t*>("WAVEfmt "), 8); u32(16);
    u16(3 /* IEEE float */); u16(CHANNELS); u32(SAMPLE_RATE); u32(SAMPLE_RATE * CHANNELS * sizeof(float));
    u16(CHANNELS * sizeof(float)); u16(32);
    out.push_back(reinterpret_cast<const uint8_t*>("data"), 4); u32(dataBytes);
}

// Offline render of the whole score, as upstream's SoundTrackWriter: stop, seek 0, process the mixer in offline mode
static bool renderWav(uintptr_t id, mu::engraving::Score* score, muse::ByteArray& out)
{
    if (!ensureSoundFont()) return false;
    Engine* e = engine();
    ScorePlayback* sp = preparePlayback(id, score);
    auto sequence = e->playback->sequence(sp->sequenceId);
    if (!sequence) return false;
    sequence->player()->stop();
    sequence->player()->seek(0);
    const msecs_t duration = sequence->player()->duration();
    const size_t totalFrames = static_cast<size_t>((static_cast<uint64_t>(std::max<int64_t>(0, duration)) * SAMPLE_RATE) / 1000000ULL);

    e->audioEngine->setMode(RenderMode::OfflineMode);
    auto mixer = e->audioEngine->mixer();
    mixer->setOutputSpec(outputSpec());
    mixer->setIsActive(true);
    writeWavHeader(out, totalFrames);
    std::vector<float> buffer(RENDER_STEP * CHANNELS);
    for (size_t done = 0; done < totalFrames; done += RENDER_STEP) {
        const samples_t chunk = static_cast<samples_t>(std::min<size_t>(RENDER_STEP, totalFrames - done));
        std::fill(buffer.begin(), buffer.end(), 0.f);
        mixer->process(buffer.data(), chunk);
        out.push_back(reinterpret_cast<const uint8_t*>(buffer.data()), chunk * CHANNELS * sizeof(float));
    }
    mixer->setIsActive(false);
    e->audioEngine->setMode(RenderMode::IdleMode);
    sequence->player()->seek(0);
    return true;
}
} // namespace ms47audio

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* saveAudio(uintptr_t score_ptr, const char* format, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    if (!format || std::strcmp(format, "wav") != 0) return textResponse("Only WAV is supported", 1);
    muse::ByteArray wav;
    if (!ms47audio::renderWav(score_ptr, score, wav)) return textResponse("Could not render audio (soundfont missing?)", 1);
    return response(wav);
}

} // extern "C"

#endif // MS47_WITH_PLAYBACK
