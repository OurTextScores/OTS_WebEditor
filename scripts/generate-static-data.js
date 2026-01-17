const fs = require('fs');
const path = require('path');

// Mock NextResponse for re-using route logic (simplified)
const NextResponse = {
    json: (data) => data
};

// We need to import the logic from the route files. 
// Since they are TS files and use ES modules, and we are running this in node, it's tricky to import directly without compilation.
// Instead, I will duplicate the logic since it's small, or use ts-node if available.
// Given the environment, duplication is safer and faster than setting up ts-node for this one-off script.

// --- Copied from app/api/instruments/clefs/route.ts ---
const loadClefMap = () => {
    const xmlPath = path.join(process.cwd(), 'webmscore-fork', 'share', 'instruments', 'instruments.xml');
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const map = {};
    const raw = {};
    const instrumentRegex = /<Instrument id="([^"]+)">([\s\S]*?)<\/Instrument>/g;
    let match;
    while ((match = instrumentRegex.exec(xml)) !== null) {
        const id = match[1];
        const body = match[2];
        const stavesMatch = body.match(/<staves>(\d+)<\/staves>/);
        const staves = stavesMatch ? Math.max(1, Number(stavesMatch[1])) : 1;
        const clefs = [];
        const clefRegex = /<clef(?:\s+staff="(\d+)")?>([^<]+)<\/clef>/g;
        let clefMatch;
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
    return map;
};

// --- Copied from app/api/instruments/templates/route.ts ---
const decodeXml = (value) => value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));

const loadInstrumentGroups = () => {
    const xmlPath = path.join(process.cwd(), 'webmscore-fork', 'share', 'instruments', 'instruments.xml');
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const groups = [];
    const groupRegex = /<InstrumentGroup id="([^"]+)">([\s\S]*?)<\/InstrumentGroup>/g;
    let groupMatch;
    while ((groupMatch = groupRegex.exec(xml)) !== null) {
        const groupId = groupMatch[1];
        const groupBody = groupMatch[2];
        const groupNameMatch = groupBody.match(/<name>([^<]+)<\/name>/);
        const groupName = decodeXml(groupNameMatch?.[1] ?? groupId);
        const instruments = [];
        const instrumentRegex = /<Instrument id="([^"]+)">([\s\S]*?)<\/Instrument>/g;
        let instrumentMatch;
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
    return groups;
};

// --- Main execution ---
const outputDir = path.join(process.cwd(), 'public', 'data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

try {
    const clefs = loadClefMap();
    fs.writeFileSync(path.join(outputDir, 'clefs.json'), JSON.stringify({ map: clefs }, null, 2));
    console.log('Generated clefs.json');

    const templates = loadInstrumentGroups();
    fs.writeFileSync(path.join(outputDir, 'templates.json'), JSON.stringify({ groups: templates }, null, 2));
    console.log('Generated templates.json');
} catch (err) {
    console.error('Error generating static data:', err);
    process.exit(1);
}
