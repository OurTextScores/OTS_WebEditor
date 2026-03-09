import React, { useState } from 'react';
import { Dialog, DialogContent, DialogClose } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';

/** TransposeMode enum values matching C++ TransposeMode */
const TransposeMode = { TO_KEY: 0, BY_INTERVAL: 1, DIATONICALLY: 2 } as const;
/** TransposeDirection enum values matching C++ TransposeDirection */
const TransposeDirection = { UP: 0, DOWN: 1, CLOSEST: 2 } as const;

const KEY_OPTIONS = [
    { value: -7, label: 'C\u266D Major / A\u266D minor' },
    { value: -6, label: 'G\u266D Major / E\u266D minor' },
    { value: -5, label: 'D\u266D Major / B\u266D minor' },
    { value: -4, label: 'A\u266D Major / F minor' },
    { value: -3, label: 'E\u266D Major / C minor' },
    { value: -2, label: 'B\u266D Major / G minor' },
    { value: -1, label: 'F Major / D minor' },
    { value: 0, label: 'C Major / A minor' },
    { value: 1, label: 'G Major / E minor' },
    { value: 2, label: 'D Major / B minor' },
    { value: 3, label: 'A Major / F\u266F minor' },
    { value: 4, label: 'E Major / C\u266F minor' },
    { value: 5, label: 'B Major / G\u266F minor' },
    { value: 6, label: 'F\u266F Major / D\u266F minor' },
    { value: 7, label: 'C\u266F Major / A\u266F minor' },
];

const CHROMATIC_INTERVALS = [
    { value: 0, label: 'Perfect Unison' },
    { value: 1, label: 'Augmented Unison' },
    { value: 2, label: 'Diminished Second' },
    { value: 3, label: 'Minor Second' },
    { value: 4, label: 'Major Second' },
    { value: 5, label: 'Augmented Second' },
    { value: 6, label: 'Diminished Third' },
    { value: 7, label: 'Minor Third' },
    { value: 8, label: 'Major Third' },
    { value: 9, label: 'Augmented Third' },
    { value: 10, label: 'Diminished Fourth' },
    { value: 11, label: 'Perfect Fourth' },
    { value: 12, label: 'Augmented Fourth' },
    { value: 13, label: 'Diminished Fifth' },
    { value: 14, label: 'Perfect Fifth' },
    { value: 15, label: 'Augmented Fifth' },
    { value: 16, label: 'Diminished Sixth' },
    { value: 17, label: 'Minor Sixth' },
    { value: 18, label: 'Major Sixth' },
    { value: 19, label: 'Augmented Sixth' },
    { value: 20, label: 'Diminished Seventh' },
    { value: 21, label: 'Minor Seventh' },
    { value: 22, label: 'Major Seventh' },
    { value: 23, label: 'Augmented Seventh' },
    { value: 24, label: 'Diminished Octave' },
    { value: 25, label: 'Perfect Octave' },
];

const DIATONIC_DEGREES = [
    { value: 0, label: 'Unison' },
    { value: 1, label: 'Second' },
    { value: 2, label: 'Third' },
    { value: 3, label: 'Fourth' },
    { value: 4, label: 'Fifth' },
    { value: 5, label: 'Sixth' },
    { value: 6, label: 'Seventh' },
];

export interface TransposeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onTranspose: (
        mode: number,
        direction: number,
        key: number,
        interval: number,
        trKeys: boolean,
        trChordNames: boolean,
        useDoubleSharpsFlats: boolean,
    ) => void;
}

export const TransposeDialog: React.FC<TransposeDialogProps> = ({
    open,
    onOpenChange,
    onTranspose,
}) => {
    const [mainMode, setMainMode] = useState<'chromatic' | 'diatonic'>('chromatic');
    const [chromaticSub, setChromaticSub] = useState<'toKey' | 'byInterval'>('byInterval');

    // Chromatic To Key state
    const [toKeyDirection, setToKeyDirection] = useState(TransposeDirection.CLOSEST);
    const [targetKey, setTargetKey] = useState(0);

    // Chromatic By Interval state
    const [intervalDirection, setIntervalDirection] = useState(TransposeDirection.UP);
    const [chromaticInterval, setChromaticInterval] = useState(4); // Major Second

    // Diatonic state
    const [diatonicDirection, setDiatonicDirection] = useState(TransposeDirection.UP);
    const [diatonicDegree, setDiatonicDegree] = useState(1); // Second
    const [keepDegreeAlterations, setKeepDegreeAlterations] = useState(true);

    // Shared options
    const [transposeKeys, setTransposeKeys] = useState(true);
    const [transposeChordNames, setTransposeChordNames] = useState(true);
    const [useDoubleSharpsFlats, setUseDoubleSharpsFlats] = useState(true);

    const handleApply = () => {
        let mode: number;
        let direction: number;
        let key: number;
        let interval: number;

        if (mainMode === 'chromatic') {
            if (chromaticSub === 'toKey') {
                mode = TransposeMode.TO_KEY;
                direction = toKeyDirection;
                key = targetKey;
                interval = 0;
            } else {
                mode = TransposeMode.BY_INTERVAL;
                direction = intervalDirection;
                key = 0;
                interval = chromaticInterval;
            }
        } else {
            mode = TransposeMode.DIATONICALLY;
            direction = diatonicDirection;
            key = 0;
            interval = diatonicDegree;
        }

        onTranspose(mode, direction, key, interval, transposeKeys, transposeChordNames, useDoubleSharpsFlats);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
                <h2 className="mb-4 text-base font-semibold text-slate-800">Transpose</h2>

                {/* Main mode selector */}
                <div className="mb-4 flex gap-4 border-b border-slate-200 pb-3">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
                        <input
                            type="radio"
                            name="mainMode"
                            checked={mainMode === 'chromatic'}
                            onChange={() => setMainMode('chromatic')}
                            className="accent-blue-600"
                        />
                        Chromatic
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
                        <input
                            type="radio"
                            name="mainMode"
                            checked={mainMode === 'diatonic'}
                            onChange={() => setMainMode('diatonic')}
                            className="accent-blue-600"
                        />
                        Diatonic
                    </label>
                </div>

                {mainMode === 'chromatic' && (
                    <div className="space-y-4">
                        {/* Chromatic sub-mode */}
                        <div className="flex gap-4">
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                                <input
                                    type="radio"
                                    name="chromaticSub"
                                    checked={chromaticSub === 'toKey'}
                                    onChange={() => setChromaticSub('toKey')}
                                    className="accent-blue-600"
                                />
                                To Key
                            </label>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
                                <input
                                    type="radio"
                                    name="chromaticSub"
                                    checked={chromaticSub === 'byInterval'}
                                    onChange={() => setChromaticSub('byInterval')}
                                    className="accent-blue-600"
                                />
                                By Interval
                            </label>
                        </div>

                        {chromaticSub === 'toKey' && (
                            <div className="space-y-3 rounded border border-slate-200 bg-slate-50/50 p-3">
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Key</label>
                                    <Select value={String(targetKey)} onValueChange={(v) => setTargetKey(Number(v))}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {KEY_OPTIONS.map((k) => (
                                                <SelectItem key={k.value} value={String(k.value)}>{k.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Direction</label>
                                    <div className="flex gap-3">
                                        {([
                                            [TransposeDirection.CLOSEST, 'Closest'],
                                            [TransposeDirection.UP, 'Up'],
                                            [TransposeDirection.DOWN, 'Down'],
                                        ] as const).map(([val, lbl]) => (
                                            <label key={val} className="flex cursor-pointer items-center gap-1 text-xs text-slate-700">
                                                <input type="radio" name="toKeyDir" checked={toKeyDirection === val} onChange={() => setToKeyDirection(val)} className="accent-blue-600" />
                                                {lbl}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {chromaticSub === 'byInterval' && (
                            <div className="space-y-3 rounded border border-slate-200 bg-slate-50/50 p-3">
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Interval</label>
                                    <Select value={String(chromaticInterval)} onValueChange={(v) => setChromaticInterval(Number(v))}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CHROMATIC_INTERVALS.map((i) => (
                                                <SelectItem key={i.value} value={String(i.value)}>{i.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Direction</label>
                                    <div className="flex gap-3">
                                        {([
                                            [TransposeDirection.UP, 'Up'],
                                            [TransposeDirection.DOWN, 'Down'],
                                        ] as const).map(([val, lbl]) => (
                                            <label key={val} className="flex cursor-pointer items-center gap-1 text-xs text-slate-700">
                                                <input type="radio" name="intervalDir" checked={intervalDirection === val} onChange={() => setIntervalDirection(val)} className="accent-blue-600" />
                                                {lbl}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {mainMode === 'diatonic' && (
                    <div className="space-y-3 rounded border border-slate-200 bg-slate-50/50 p-3">
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Degree</label>
                            <Select value={String(diatonicDegree)} onValueChange={(v) => setDiatonicDegree(Number(v))}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {DIATONIC_DEGREES.map((d) => (
                                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Direction</label>
                            <div className="flex gap-3">
                                {([
                                    [TransposeDirection.UP, 'Up'],
                                    [TransposeDirection.DOWN, 'Down'],
                                ] as const).map(([val, lbl]) => (
                                    <label key={val} className="flex cursor-pointer items-center gap-1 text-xs text-slate-700">
                                        <input type="radio" name="diatonicDir" checked={diatonicDirection === val} onChange={() => setDiatonicDirection(val)} className="accent-blue-600" />
                                        {lbl}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                            <Checkbox checked={keepDegreeAlterations} onCheckedChange={(v) => setKeepDegreeAlterations(v === true)} />
                            Keep degree alterations
                        </label>
                    </div>
                )}

                {/* Shared options */}
                <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                        <Checkbox checked={transposeKeys} onCheckedChange={(v) => setTransposeKeys(v === true)} />
                        Transpose key signatures
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                        <Checkbox checked={transposeChordNames} onCheckedChange={(v) => setTransposeChordNames(v === true)} />
                        Transpose chord symbols
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                        <Checkbox checked={useDoubleSharpsFlats} onCheckedChange={(v) => setUseDoubleSharpsFlats(v === true)} />
                        Use double sharps and flats
                    </label>
                </div>

                {/* Actions */}
                <div className="mt-5 flex justify-end gap-2">
                    <DialogClose asChild>
                        <Button variant="outline" size="sm">Cancel</Button>
                    </DialogClose>
                    <Button size="sm" onClick={handleApply}>
                        Transpose
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
