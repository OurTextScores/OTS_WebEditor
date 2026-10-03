import { clefCodeMap, escapeXml, pickupDurationToRestType } from './new-score-defaults';

export type BuildNewScoreXmlContext = {
  resolveInstrumentClefs: (
    instrumentId: string,
    instrumentName: string,
  ) => { staves: number; clefs: { staff: number; clef: string }[] };
};

export function buildNewScoreXmlImpl(
  ctx: BuildNewScoreXmlContext,
  options: {
    title: string;
    composer: string;
    instruments: { id: string; name: string }[];
    measures: number;
    keyFifths: number;
    timeNumerator: number;
    timeDenominator: number;
    pickup?: { numerator: number; denominator: number };
  },
) {
  const { resolveInstrumentClefs } = ctx;
  const title = escapeXml(options.title.trim());
  const composer = escapeXml(options.composer.trim());
  const divisions = 16;
  const measureDuration = Math.round(
    (divisions * 4 * options.timeNumerator) / options.timeDenominator,
  );
  const partsXml = options.instruments.map((instrument, index) => {
    const partId = `P${index + 1}`;
    const rawName = instrument.name.trim() || 'Instrument';
    const instrumentName = escapeXml(rawName);
    const clefSpec = resolveInstrumentClefs(instrument.id, rawName);
    const staves = Math.max(clefSpec.staves || 1, clefSpec.clefs.length || 1);
    const clefXml = clefSpec.clefs
      .map((clefEntry) => {
        const mapEntry = clefCodeMap[clefEntry.clef] ?? clefCodeMap.G;
        const staffAttr = staves > 1 ? ` number="${clefEntry.staff}"` : '';
        const octave = mapEntry.octave
          ? `\n        <clef-octave-change>${mapEntry.octave}</clef-octave-change>`
          : '';
        return `        <clef${staffAttr}>\n          <sign>${mapEntry.sign}</sign>\n          <line>${mapEntry.line}</line>${octave}\n        </clef>`;
      })
      .join('\n');
    const fullAttributesXml = `
      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${options.keyFifths}</fifths></key>
        <time><beats>${options.timeNumerator}</beats><beat-type>${options.timeDenominator}</beat-type></time>
        ${staves > 1 ? `<staves>${staves}</staves>` : ''}
${clefXml}
      </attributes>`;
    // When there's a pickup, all attributes go on the pickup measure (measure 0).
    // Measure 1 gets no attributes block to avoid duplicate clefs/time sigs.
    const hasPickup = !!options.pickup;
    const measuresXml = Array.from({ length: options.measures }, (_, measureIndex) => {
      const attributes = measureIndex === 0 && !hasPickup ? fullAttributesXml : '';
      const notesXml = Array.from({ length: staves }, (_, staffIndex) => {
        const staffNumber = staffIndex + 1;
        const voice = staffIndex * 4 + 1;
        const backup =
          staffIndex > 0
            ? `      <backup>\n        <duration>${measureDuration}</duration>\n      </backup>\n`
            : '';
        return `${backup}      <note>
        <rest measure="yes"/>
        <duration>${measureDuration}</duration>
        <voice>${voice}</voice>
        ${staves > 1 ? `<staff>${staffNumber}</staff>` : ''}
      </note>`;
      }).join('\n');
      return `    <measure number="${measureIndex + 1}">
${attributes}
${notesXml}
    </measure>`;
    }).join('\n');
    let pickupXml = '';
    if (options.pickup) {
      const pickupDuration = Math.round(
        (divisions * 4 * options.pickup.numerator) / options.pickup.denominator,
      );
      const pickupRestType = pickupDurationToRestType(
        options.pickup.numerator,
        options.pickup.denominator,
      );
      const pickupNotesXml = Array.from({ length: staves }, (_, staffIndex) => {
        const staffNumber = staffIndex + 1;
        const voice = staffIndex * 4 + 1;
        const backup =
          staffIndex > 0
            ? `      <backup>\n        <duration>${pickupDuration}</duration>\n      </backup>\n`
            : '';
        return `${backup}      <note>
        <rest/>
        <duration>${pickupDuration}</duration>
        <voice>${voice}</voice>
        <type>${pickupRestType}</type>
        ${staves > 1 ? `<staff>${staffNumber}</staff>` : ''}
      </note>`;
      }).join('\n');
      pickupXml = `    <measure number="0" implicit="yes">
${fullAttributesXml}
${pickupNotesXml}
    </measure>\n`;
    }
    return {
      partList: `    <score-part id="${partId}">
      <part-name>${instrumentName}</part-name>
      <score-instrument id="${partId}-I1">
        <instrument-name>${instrumentName}</instrument-name>
      </score-instrument>
    </score-part>`,
      part: `  <part id="${partId}">
${pickupXml}${measuresXml}
  </part>`,
    };
  });
  const workLine = title ? `  <work><work-title>${title}</work-title></work>\n` : '';
  const identificationLine = composer
    ? `  <identification><creator type="composer">${composer}</creator></identification>\n`
    : '';
  const partListXml = partsXml.map((part) => part.partList).join('\n');
  const partsBodyXml = partsXml.map((part) => part.part).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
${workLine}${identificationLine}  <part-list>
${partListXml}
  </part-list>
${partsBodyXml}
</score-partwise>
`;
}
