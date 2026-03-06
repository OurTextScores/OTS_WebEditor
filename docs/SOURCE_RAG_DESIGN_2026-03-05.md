# Source RAG Design (March 5, 2026)

## 1. Purpose

Design the next evolution of editor chat retrieval after the initial IMSLP-only pass-through implementation.

Goals:

1. support broader music-history and musicology chat questions than IMSLP alone can answer
2. preserve high factual quality and citation quality
3. avoid the failure mode of naive unrestricted web scraping
4. keep the system practical to implement in the current OTS editor/server architecture

This design applies to chat-mode retrieval first. It does not change score-edit or patch-mode behavior.

## 2. Current state

Current implementation:

- `OurTextScores` passes launch metadata into `OTS_Web`
- `OTS_Web` persists that metadata into the score session and exposes it through `music.context`
- chat-mode `/api/llm/*` requests can optionally enrich prompts with retrieval context
- current retrieval implementation is limited to:
  - a single URL from `sourceContext.imslpUrl`
  - IMSLP HTML fetch
  - simple snippet extraction

This is useful but too narrow for:

- composer biography/history questions
- reception/publication-history questions
- manuscript/source-history questions
- musicology/theory questions requiring scholarship rather than a score library page

## 3. Core recommendation

Do not keep the system IMSLP-only.

Also do not move to unrestricted undifferentiated web fetch.

Recommended policy:

1. broad retrieval and search are allowed
2. sources are ranked by trust and fit-for-query
3. extraction is source-aware when possible
4. results are citation-forward
5. the model is told which evidence is authoritative, which is supporting, and which is fallback

In short:

- broad discovery
- selective trust
- explicit provenance

## 4. Source classes

## 4.1 Tier A: authority / structured metadata

These should rank highest when they match.

### Wikidata

Use for:

- entity resolution
- composer/work normalization
- dates, identifiers, catalogue numbers, linked external IDs

Why:

- machine-friendly
- open licensing for structured data
- strong backbone for cross-source identity resolution

Role in system:

- first-pass entity resolution
- metadata normalization layer
- disambiguation support

### RISM

Use for:

- manuscript/source questions
- holdings/institutions
- incipits and source provenance
- primary-source discovery

Why:

- this is the most important specialized musicological source to add after Wikimedia + IMSLP
- public machine-readable API exists

Role in system:

- high-priority for source-history and manuscript questions
- higher trust than general web prose for source provenance

### Library of Congress

Use for:

- digitized primary materials
- bibliographic context
- archival and item-level metadata

Why:

- official institutional metadata
- public JSON API

Role in system:

- strong supplemental authority source
- especially useful for historical documents and U.S.-held materials

### MusicBrainz

Use for:

- entity metadata fallback
- recordings/releases/relationships
- canonical naming support

Why:

- public REST service
- useful for entity resolution when work/composer matching is fuzzy

Caveat:

- stronger for recordings/releases than for scholarly work-level cataloguing
- should not outrank Wikidata/RISM for score-centric scholarship

## 4.2 Tier B: work/source pages and general reference

### IMSLP

Use for:

- work pages
- instrumentation
- publication/source notes
- scan/edition links

Why:

- directly aligned to OTS source workflows
- usually the first relevant page for score-specific context

Caveat:

- prose quality and metadata consistency vary
- should not be the only source for biography/history claims

### Wikipedia

Use for:

- composer/work overview
- music history context
- publication/reception overview
- quick explanatory background

Why:

- broad coverage
- excellent API surface
- strong utility for explanatory chat responses

Caveat:

- should be cited and treated as a general reference, not absolute authority
- answers should prefer confirmation from a stronger source when available

## 4.3 Tier C: scholarly discovery and open-access scholarship

### OpenAlex

Use for:

- discover scholarly articles, books, repositories, OA works, journals
- resolve whether open-access scholarship exists for the topic

Why:

- broad scholarly discovery coverage
- structured API
- useful pivot from music entity -> literature

Caveat:

- discovery layer, not usually the final answer source by itself

### Music Theory Online

Use for:

- theory and analytical explanation
- peer-reviewed open-access music theory scholarship

Why:

- directly relevant to harmonic/formal/theory questions
- open and citation-friendly

### Open Music Theory

Use for:

- pedagogical theory explanations
- user-facing explanatory answers

Why:

- open textbook with clear reuse terms
- useful when the user asks for explanation rather than scholarship discovery

Caveat:

- pedagogical source, not a primary musicology source

### JSTOR open/free content

Use for:

- discovery of open/free scholarly material
- secondary fallback for accessible scholarship

Caveat:

- use only where access is clearly permitted
- do not assume subscription content is fetchable or usable

## 4.4 Tier D: repertoire-specific scholarly projects

These should be recognized when they match the composer/repertoire.

Examples:

- Mozart: Köchel Catalogue Online / Mozarteum
- Beethoven: Beethoven-Haus archive
- Bach: Bach Digital
- medieval chant: Cantus Database
- medieval polyphony/manuscripts: DIAMM

Why:

- for their repertoire, these are often better than Wikipedia and more directly useful than general search

Recommendation:

- support these via a domain registry with source-specific rank boosts
- do not block rollout on implementing all of them at once

## 5. Retrieval policy by question type

## 5.1 Composer/work overview

Preferred order:

1. Wikidata
2. Wikipedia
3. IMSLP
4. composer-specific archive if available

## 5.2 Source/manuscript/provenance question

Preferred order:

1. RISM
2. IMSLP
3. Library of Congress
4. composer archive / scholarly project

## 5.3 Theory/analysis explanation

Preferred order:

1. score context itself
2. Music Theory Online
3. Open Music Theory
4. open-access scholarship via OpenAlex
5. Wikipedia only as context/fallback

## 5.4 Publication/reception/history

Preferred order:

1. Wikipedia
2. OpenAlex-discovered OA scholarship
3. JSTOR open/free items
4. institutional archives
5. IMSLP supporting notes if relevant

## 5.5 Catalogue number / identifiers / metadata normalization

Preferred order:

1. Wikidata
2. composer-specific catalogue site
3. IMSLP
4. MusicBrainz

## 6. Architecture recommendation

## 6.1 Replace single-source helper with a retrieval orchestrator

Current helper:

- single-source URL fetch (`sourceContext.imslpUrl`)

Recommended next architecture:

1. normalize query intent
2. resolve entities from score/session metadata
3. retrieve from multiple adapters
4. rerank results by trust + query fit
5. inject a compact cited evidence block into the model prompt

Suggested modules:

- `entity-resolver.ts`
- `source-registry.ts`
- `retrieval-adapters/`
- `rerank.ts`
- `prompt-augment.ts`

## 6.2 Entity resolution inputs

Inputs should include:

- `sourceContext.imslpUrl`
- `sourceContext.workTitle`
- `sourceContext.composer`
- score fingerprint data from `music.context`
- optional user prompt terms

Resolved entities should include:

- normalized composer name
- work title
- possible catalogue numbers
- candidate Wikipedia page title
- candidate Wikidata QID
- candidate RISM search query

## 6.3 First-wave adapters

Recommended first-wave implementation:

1. Wikipedia adapter
- query by title/search
- fetch page summary/content via MediaWiki REST API

2. Wikidata adapter
- resolve entity IDs and identifiers
- pull structured claims needed for metadata grounding

3. IMSLP adapter
- continue current page fetch, but treat as one source among several

4. RISM adapter
- query public search/resource API for source-history questions

5. OpenAlex adapter
- discover open scholarship and open-access resources

This is the best initial balance of value and complexity.

## 6.4 Second-wave adapters

Later additions:

- Library of Congress
- MusicBrainz
- Mozart/Beethoven/Bach project adapters
- Cantus / DIAMM for early music

## 7. Ranking model

Do not rank only by text similarity.

Recommended score components:

1. source trust score
- structured authority > institutional archive > peer-reviewed OA > general reference > generic web

2. query-type fit
- manuscript question boosts RISM
- theory explanation boosts MTO/Open Music Theory
- biography/history boosts Wikipedia/OpenAlex

3. entity match confidence
- exact composer/work/catalogue match gets priority

4. openness/accessibility
- open and fetchable sources get preference over inaccessible sources

5. recency where relevant
- mostly low importance for classical work metadata
- higher for journal/discovery sources

6. diversity bonus
- prefer final evidence set that includes at least two different source types

## 8. Prompt and answer format

The model should not just receive raw snippets.

Recommended injected structure:

- source type
- source label
- source URL
- trust tier
- short snippet or structured fact block
- conflict notes when sources disagree

Example prompt block:

- `Authority metadata`
- `Reference overview`
- `Scholarly context`
- `Primary/source context`

Response guidance to model:

- cite the source type and URL in the answer when using external facts
- distinguish score-derived facts from web-derived facts
- note uncertainty or source disagreement explicitly

## 9. Why not unrestricted raw web fetch

Problems with unrestricted fetch:

- low-quality music SEO pages outrank better sources
- inconsistent extraction quality
- weak provenance
- licensing ambiguity
- more hallucination pressure because evidence quality is noisy

General search is acceptable only if paired with:

- trust-aware reranking
- domain heuristics
- citation requirements
- adapter-specific extraction where possible

## 10. Legal and operational considerations

### Wikipedia / Wikimedia

- acceptable and useful as a source
- must respect content licensing and attribution expectations in any user-visible reuse workflow
- for prompt-only grounding, quoting should still remain minimal and citation-forward

### Wikidata

- ideal for structured metadata because of CC0 licensing for structured data

### JSTOR / subscription resources

- only use open/free accessible material
- do not build retrieval assuming paywalled full-text access

### Institutional sites and APIs

- prefer public APIs over scraping when available
- RISM explicitly recommends using its API rather than scraping the UI

## 11. Recommended rollout

## Phase 1

Implement:

1. Wikipedia
2. Wikidata
3. IMSLP
4. RISM
5. OpenAlex

Why:

- covers general reference, structured metadata, source-history, and scholarship discovery
- all are public and practical to integrate
- materially better than IMSLP-only without requiring a full search engine integration

## Phase 2

Add:

- Library of Congress
- MusicBrainz
- composer-project adapters

## Phase 3

Add:

- optional broader search provider for discovery
- but still run through the same trust-aware reranking and citation policy

## 12. Recommended product stance

Recommended answer to the product question:

- not IMSLP-only
- not strict hard-whitelist only
- not unrestricted web scrape

Instead:

- broad search and retrieval are allowed
- trusted musicological and institutional sources are ranked first
- the system remains citation-forward and source-aware

This gives OTS a better music-history/musicology chat stack without sacrificing answer quality.
