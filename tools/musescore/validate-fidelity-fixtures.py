#!/usr/bin/env python3
"""Validate pilot files against the pinned local MusicXML schema (requires lxml)."""
import os
from fractions import Fraction
from pathlib import Path
from lxml import etree

repo = Path(__file__).resolve().parents[2]
source = Path(os.environ.get('MS47_SOURCE', repo.parent / 'ms47-spike'))
schema_dir = source / 'src/importexport/musicxml/schema'


class LocalSchemaResolver(etree.Resolver):
    def resolve(self, url, public_id, context):
        name = url.rsplit('/', 1)[-1]
        if name in {'xml.xsd', 'xlink.xsd'}:
            return self.resolve_filename(str(schema_dir / name), context)
        return None


parser = etree.XMLParser(no_network=True, resolve_entities=False)
parser.resolvers.add(LocalSchemaResolver())
schema = etree.XMLSchema(etree.parse(str(schema_dir / 'musicxml.xsd'), parser))
root = repo / 'tools/musescore/fixtures/osmd-fidelity'
for file in sorted(root.glob('*.musicxml')):
    doc = etree.parse(str(file), parser)
    schema.assertValid(doc)
    if file.name == 'nested-undotted.musicxml':
        divisions = int(doc.findtext('.//divisions'))
        notes = doc.findall('.//measure/note')
        for note in notes[:9]:
            assert Fraction(int(note.findtext('duration')), divisions) == Fraction(1, 2) * Fraction(4, 9)
        assert sum(Fraction(int(note.findtext('duration')), divisions) for note in notes) == 4
        assert len(doc.findall('.//tuplet[@type="start"]')) == 4
        assert len(doc.findall('.//tuplet[@type="stop"]')) == 4
    print(f'{file.name}: schema valid')
