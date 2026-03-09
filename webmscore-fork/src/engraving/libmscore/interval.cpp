/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-CLA-applies
 *
 * MuseScore
 * Music Composition & Notation
 *
 * Copyright (C) 2021 MuseScore BVBA and others
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

#include "interval.h"
#include "utils.h"

namespace mu::engraving {
//---------------------------------------------------------
//   Interval
//---------------------------------------------------------

Interval::Interval()
    : diatonic(0), chromatic(0)
{
}

Interval::Interval(int a, int b)
    : diatonic(a), chromatic(b)
{
}

Interval::Interval(int c)
{
    chromatic = c;
    diatonic = chromatic2diatonic(c);
}

//---------------------------------------------------------
//   flip
//---------------------------------------------------------

void Interval::flip()
{
    diatonic = -diatonic;
    chromatic = -chromatic;
}

//---------------------------------------------------------
//   isZero
//---------------------------------------------------------

bool Interval::isZero() const
{
    return diatonic == 0 && chromatic == 0;
}

//---------------------------------------------------------
//   allIntervals
//---------------------------------------------------------

const Interval Interval::allIntervals[26] = {
    // diatonic - chromatic
    Interval(0, 0),           //  0 Perfect Unison
    Interval(0, 1),           //  1 Augmented Unison

    Interval(1, 0),           //  2 Diminished Second
    Interval(1, 1),           //  3 Minor Second
    Interval(1, 2),           //  4 Major Second
    Interval(1, 3),           //  5 Augmented Second

    Interval(2, 2),           //  6 Diminished Third
    Interval(2, 3),           //  7 Minor Third
    Interval(2, 4),           //  8 Major Third
    Interval(2, 5),           //  9 Augmented Third

    Interval(3, 4),           // 10 Diminished Fourth
    Interval(3, 5),           // 11 Perfect Fourth
    Interval(3, 6),           // 12 Augmented Fourth

    Interval(4, 6),           // 13 Diminished Fifth
    Interval(4, 7),           // 14 Perfect Fifth
    Interval(4, 8),           // 15 Augmented Fifth

    Interval(5, 7),           // 16 Diminished Sixth
    Interval(5, 8),           // 17 Minor Sixth
    Interval(5, 9),           // 18 Major Sixth
    Interval(5, 10),          // 19 Augmented Sixth

    Interval(6, 9),           // 20 Diminished Seventh
    Interval(6, 10),          // 21 Minor Seventh
    Interval(6, 11),          // 22 Major Seventh
    Interval(6, 12),          // 23 Augmented Seventh

    Interval(7, 11),          // 24 Diminished Octave
    Interval(7, 12),          // 25 Perfect Octave
};
}
