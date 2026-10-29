// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// MuseScore's Realize chord symbols (RealizeHarmonyDialog → Score::cmdRealizeChordSymbols): the selected
// chord symbols become notes. literal: play the symbol as written (else as jazz voicing); voicing and
// duration are Voicing / HDuration values, -1 for the score's own per-symbol settings.
#include "engraving/dom/realizedharmony.h"

extern "C" {

EMSCRIPTEN_KEEPALIVE bool realizeChordSymbols(uintptr_t score_ptr, bool literal, int voicing, int duration, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || voicing < -1 || voicing > 6 || duration < -1 || duration > 2) return false;
    bool hasHarmony = false;
    for (auto* e : score->selection().elements()) hasHarmony |= e && e->isHarmony();
    if (!hasHarmony) return false;
    score->startCmd(TranslatableString::untranslatable("Realize chord symbols"));
    score->cmdRealizeChordSymbols(literal, engraving::Voicing(voicing), engraving::HDuration(duration));
    score->endCmd();
    layoutLinked(score);
    return true;
}

} // extern "C"
