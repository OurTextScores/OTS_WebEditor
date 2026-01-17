import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-static';

type ClefEntry = { staff: number; clef: string };
type InstrumentClefMap = Record<string, { staves: number; clefs: ClefEntry[] }>;
type RawInstrument = {
    id: string;
    staves: number;
    clefs: ClefEntry[];
    transposingClef?: string;
    concertClef?: string;
    init?: string;
};

let cachedMap: InstrumentClefMap | null = null;

const loadClefMap = (): InstrumentClefMap => {
    if (cachedMap) {
        return cachedMap;
    }
    const xmlPath = path.join(process.cwd(), 'webmscore-fork', 'share', 'instruments', 'instruments.xml');
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const map: InstrumentClefMap = {};
    const raw: Record<string, RawInstrument> = {};
    const instrumentRegex = /<Instrument id="([^"]+)">([\s\S]*?)<\/Instrument>/g;
    let match: RegExpExecArray | null;
    while ((match = instrumentRegex.exec(xml)) !== null) {
        const id = match[1];
        const body = match[2];
        const stavesMatch = body.match(/<staves>(\d+)<\/staves>/);
        const staves = stavesMatch ? Math.max(1, Number(stavesMatch[1])) : 1;
        const clefs: ClefEntry[] = [];
        const clefRegex = /<clef(?:\s+staff="(\d+)")?>([^<]+)<\/clef>/g;
        let clefMatch: RegExpExecArray | null;
        while ((clefMatch = clefRegex.exec(body)) !== null) {
            const staff = clefMatch[1] ? Math.max(1, Number(clefMatch[1])) : 1;
            const clef = clefMatch[2].trim();
            if (clef) {
                clefs.push({ staff, clef });
            }
        }
        const transposingMatch = body.match(/<transposingClef>([^<]+)<\/transposingClef>/);
        const concertMatch = body.match(/<concertClef>([^<]+)<\/concertClef>/);
        const initMatch = body.match(/<init>([^<]+)<\/init>/);
        raw[id] = {
            id,
            staves,
            clefs,
            transposingClef: transposingMatch?.[1]?.trim(),
            concertClef: concertMatch?.[1]?.trim(),
            init: initMatch?.[1]?.trim(),
        };
    }
    Object.values(raw).forEach((entry) => {
        const clefs = entry.clefs.length > 0
            ? entry.clefs
            : entry.transposingClef
                ? [{ staff: 1, clef: entry.transposingClef }]
                : entry.concertClef
                    ? [{ staff: 1, clef: entry.concertClef }]
                    : [];
        map[entry.id] = { staves: entry.staves, clefs };
    });
    Object.values(raw).forEach((entry) => {
        const current = map[entry.id];
        if (!current || current.clefs.length > 0) {
            return;
        }
        if (entry.init) {
            const target = map[entry.init];
            if (target && target.clefs.length > 0) {
                map[entry.id] = { staves: current?.staves ?? target.staves, clefs: target.clefs };
            }
        }
    });
    Object.values(map).forEach((entry) => {
        if (entry.clefs.length === 0) {
            entry.clefs.push({ staff: 1, clef: 'G' });
        }
    });
    cachedMap = map;
    return map;
};

export async function GET() {
    try {
        const map = loadClefMap();
        return NextResponse.json({ map });
    } catch (err) {
        console.error('Failed to load instruments.xml', err);
        return NextResponse.json({ error: 'Unable to load instrument clefs.' }, { status: 500 });
    }
}
