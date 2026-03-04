import { expect, test } from '@playwright/test';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const HAS_OPENAI_KEY = Boolean(OPENAI_API_KEY);

const FEEDBACK_BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>2</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

test.describe('Diff feedback OpenAI e2e', () => {
  test.skip(!HAS_OPENAI_KEY, 'Requires OPENAI_API_KEY in environment');

  test('second-iteration style clef revision keeps accepted key signature and applies', async ({ request }) => {
    const response = await request.post('/api/music/diff/feedback', {
      data: {
        provider: 'openai',
        model: 'gpt-5.2',
        apiKey: OPENAI_API_KEY,
        iteration: 1,
        content: FEEDBACK_BASE_XML,
        blocks: [
          { partIndex: 0, measureRange: '1', status: 'accepted' },
          {
            partIndex: 0,
            measureRange: '2',
            status: 'comment',
            comment: 'Change measure 2 to treble clef (sign G, line 2). Keep measure 1 key signature unchanged.',
          },
        ],
        globalComment: 'Only revise measure 2. Do not modify accepted measure 1.',
      },
      timeout: 120_000,
    });

    const json = await response.json();
    expect(response.ok(), JSON.stringify(json)).toBeTruthy();
    expect(json.iteration).toBe(2);
    expect(Array.isArray(json.patch?.ops)).toBeTruthy();
    expect(json.patch.ops.length).toBeGreaterThan(0);
    expect(String(json.proposedXml)).toContain('<fifths>1</fifths>');
    expect(String(json.proposedXml)).toMatch(
      /<measure number="2">[\s\S]*?<clef>[\s\S]*?<sign>G<\/sign>[\s\S]*?<line>2<\/line>[\s\S]*?<\/clef>/,
    );
  });
});
