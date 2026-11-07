// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/repeatlist.h"

// Performer mode's Play-through view (performer plan, Phase 3): the score with its repeats written out, as desktop
// MuseScore's Unroll repeats, returned as MSCZ bytes for the caller to load as a second score through the ordinary
// load path. Done as desktop's NotationProject::load does it with unrollRepeats: on a fresh copy of the score in a
// project of its own (the unrolled clone stays tied to the project it was cloned in), so the user's score is not
// touched. Each written-out bar follows the playback timeline's occurrences, in order.

static Ret writeProjectMscz(const std::shared_ptr<EngravingProject>& project, ByteArray& bytes)
{
    io::Buffer buffer(&bytes);
    MscWriter::Params params;
    params.device = &buffer;
    params.filePath = "score.mscz";
    params.mode = MscIoMode::Zip;
    MscWriter writer(params);
    Ret opened = writer.open();
    if (!opened) return opened;
    const bool ok = project->writeMscz(writer, false);
    writer.close();
    return ok ? make_ok() : make_ret(Ret::Code::UnknownError);
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* unrolledMsc(uintptr_t id)
{
    auto found = projects.find(id);
    if (found == projects.end() || !found->second) return textResponse("Invalid score", 1);

    // A fresh copy of the score, in a project of its own
    ByteArray original;
    if (!writeProjectMscz(found->second, original)) return textResponse("Could not copy the score", 1);
    auto project = EngravingProject::create(nullptr);
    project->setFileInfoProvider(std::make_shared<LocalFileInfoProvider>("score.mscz"));
    io::Buffer input(&original);
    MscReader::Params params;
    params.device = &input;
    params.filePath = "score.mscz";
    params.mode = MscIoMode::Zip;
    MscReader reader(params);
    Ret loaded = reader.open();
    if (loaded) loaded = project->loadMscz(reader, nullptr, true);
    if (loaded) loaded = project->setupMasterScore(true);
    if (!loaded) return textResponse(loaded.toString(), 1);

    // As desktop on opening with "unroll repeats": replace the project's score with the unrolled one
    engraving::MasterScore* copy = project->masterScore();
    copy->doLayout();
    if (copy->repeatList().size() > 1) {
        engraving::MasterScore* unrolled = copy->unrollRepeats();
        if (!unrolled) return textResponse("Could not write the repeats out", 1);
        delete copy;
        project->setMasterScore(unrolled);
    }

    ByteArray bytes;
    if (!writeProjectMscz(project, bytes)) return textResponse("Could not write the repeats out", 1);
    return response(bytes);
}


// Performer mode's reflow: the score laid out for the device ignores the engraver's line and page breaks (section
// breaks, which separate movements, stay). On the perform view's own read-only copy, never saved. Returns how many
// breaks were removed.
EMSCRIPTEN_KEEPALIVE int removeLayoutBreaks(uintptr_t id, int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score) return -1;
    int removed = 0;
    score->startCmd(TranslatableString::untranslatable("Remove line and page breaks"));
    for (engraving::MeasureBase* measure = score->first(); measure; measure = measure->next()) {
        if (measure->lineBreak()) {
            measure->undoSetLineBreak(false);
            ++removed;
        }
        if (measure->pageBreak()) {
            measure->undoSetPageBreak(false);
            ++removed;
        }
    }
    score->endCmd();
    layoutLinked(score);
    return removed;
}

}
