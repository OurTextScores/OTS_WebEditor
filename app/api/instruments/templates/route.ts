import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

type InstrumentTemplate = {
    id: string;
    name: string;
    groupId?: string;
    groupName?: string;
};

type InstrumentTemplateGroup = {
    id: string;
    name: string;
    instruments: InstrumentTemplate[];
};

let cachedGroups: InstrumentTemplateGroup[] | null = null;

const decodeXml = (value: string) => value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));

const loadInstrumentGroups = (): InstrumentTemplateGroup[] => {
    if (cachedGroups) {
        return cachedGroups;
    }
    const xmlPath = path.join(process.cwd(), 'webmscore-fork', 'share', 'instruments', 'instruments.xml');
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const groups: InstrumentTemplateGroup[] = [];
    const groupRegex = /<InstrumentGroup id="([^"]+)">([\s\S]*?)<\/InstrumentGroup>/g;
    let groupMatch: RegExpExecArray | null;
    while ((groupMatch = groupRegex.exec(xml)) !== null) {
        const groupId = groupMatch[1];
        const groupBody = groupMatch[2];
        const groupNameMatch = groupBody.match(/<name>([^<]+)<\/name>/);
        const groupName = decodeXml(groupNameMatch?.[1] ?? groupId);
        const instruments: InstrumentTemplate[] = [];
        const instrumentRegex = /<Instrument id="([^"]+)">([\s\S]*?)<\/Instrument>/g;
        let instrumentMatch: RegExpExecArray | null;
        while ((instrumentMatch = instrumentRegex.exec(groupBody)) !== null) {
            const instrumentId = instrumentMatch[1];
            const instrumentBody = instrumentMatch[2];
            const longNameMatch = instrumentBody.match(/<longName>([^<]+)<\/longName>/);
            const trackNameMatch = instrumentBody.match(/<trackName>([^<]+)<\/trackName>/);
            const nameRaw = longNameMatch?.[1] || trackNameMatch?.[1] || instrumentId;
            instruments.push({
                id: instrumentId,
                name: decodeXml(nameRaw),
                groupId,
                groupName,
            });
        }
        groups.push({ id: groupId, name: groupName, instruments });
    }
    cachedGroups = groups;
    return groups;
};

export async function GET() {
    try {
        const groups = loadInstrumentGroups();
        return NextResponse.json({ groups });
    } catch (err) {
        console.error('Failed to load instruments.xml templates', err);
        return NextResponse.json({ error: 'Unable to load instrument templates.' }, { status: 500 });
    }
}
