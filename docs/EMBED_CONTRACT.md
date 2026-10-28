# Embed surfaces and host contracts

This document describes the current implementation, not a general editor SDK. The player, review and scanner surfaces have different URLs and message contracts. There is no documented host message for selecting or modifying score elements, querying geometry, or exporting a score. The local score and its lifetime belong to the iframe.

## Player

A URL with `score` and `embed=player` (or the compatibility alias `embed=1`) opens the playback player, unless compare or review parameters select an editor host surface first. The browser must be able to fetch the score, including any required CORS and credentials. The player displays loading and error states; `ready` follows successful score loading and initial SVG rendering. The player owns the score, audio transport and observers; removing the iframe destroys that browsing context and the player disposes its transport and score. Allow for asynchronous shutdown; there is no disposal command or acknowledgement.

The current options are listed in [Building for Embed/Export](BUILD_EMBED.md#embedding-the-playback-player). Supply a unique `playerId` per iframe when sending or receiving messages: valid IDs have 1–64 letters, digits, `.`, `_`, `:` or `-`. An absent or invalid ID falls back to a generated ID, which is not a cross-frame uniqueness guarantee. The `parentOrigin` parameter is an exact HTTP(S) origin, such as `https://host.example` (no path, credentials, query, fragment or trailing slash). Omission selects the player's own origin; a malformed origin or `*` disables the message channel. A cross-origin host must specify its own exact origin. Player controls do not require host messaging.

### Version 1 commands

Send to the iframe's `contentWindow` with the **player's** exact origin as `targetOrigin`. The player checks `event.source === window.parent`, the configured parent origin, `type`, version, ID and the command value. Invalid or unrecognized messages are silently ignored; there is no command acknowledgement.

```js
const frame = document.querySelector('#score-player');
frame.contentWindow.postMessage({
  type: 'ots-player:command', version: 1, playerId: 'score-1',
  command: 'seek', value: 5000,
}, 'https://player.example');
```

| Command | `value` |
| --- | --- |
| `play`, `pause`, `toggle`, `stop` | Omit. Stop returns to the configured start position. |
| `seek` | Finite milliseconds from 0 through the current duration. |
| `set-volume` | Finite number from 0 through 1. |
| `set-follow` | Boolean. |
| `set-highlight` | `note` or `measure`; availability depends on the score and playback release settings. |

The player posts `{type: 'ots-player:event', version: 1, playerId, event, detail}` to its configured parent origin. Events and details are:

| Event | Detail |
| --- | --- |
| `ready` | `durationMs`, `pageCount` |
| `statechange` | `state`, `positionMs`, `durationMs`, `compatibilityAudio` |
| `timeupdate` | `positionMs`, `durationMs`; emitted during playback, throttled to at most once per 250 ms |
| `pagechange` | `page` (one-based), `pageCount` |
| `ended` | `positionMs` |
| `error` | `category` (`score`, `page`, or `audio`) and `message` |

A host must validate the expected player origin, `event.source === frame.contentWindow`, envelope version, player ID, event name and the types of fields it consumes. Do not treat an origin check alone as instance identification. Register the listener before loading the frame and remove it when the host disposes the frame. Event timing and ordering are not an acknowledgement protocol. Error text is diagnostic; hosts should handle it as untrusted text.

The OurTextScores score preview (`frontend/app/works/[workId]/score-player-preview.tsx`) checks origin, iframe source, version and ID before consuming player state. The generated copy-and-paste player snippet deliberately omits the original host's `playerId` and `parentOrigin`; a new host that wants messaging must set its own values.

## Editor, compare and scanner

The normal editor is selected when the player and host-mode URL conditions do not apply. A single-score change review uses `reviewScore` with `changeReviewId`. A two-score host compare uses `compareLeft` and `compareRight`, optionally labels, `changeReviewId`, and `patchset`. Scanner system rows use the compare URLs plus `compareRegions` and `compareMode=rows`; findings use `compareLeft`, `compareRegions` and `compareMode=findings` without `compareRight`. These modes use their own chrome, editing policies, loading and errors; they do not implement the player command protocol.

Current host-specific messages are separate and unversioned:

- Content-sized scanner rows and findings send `{type: 'ots-compare-height', height}` on layout and resize. The sender disconnects its `ResizeObserver` and resize handler on cleanup. OurTextScores binds each receiver to its current iframe, checks the same origin and a finite height, and uses a minimum height and hysteresis to avoid resize oscillation.
- Scanner findings send `{type: 'ots-finding-issue', kind, part, message, index, total, places, exampleIndex}`. OurTextScores checks the same origin and current iframe, validates the finding fields it consumes, and clears the displayed decision when the reading changes. This payload contains finding text.
- A change-review action sends `{type: 'ots.change-review.updated', reviewId}` to the editor's own origin. OurTextScores checks origin, current iframe and review ID before refreshing.

The scanner height and finding senders target the editor's exact origin by default, which supports OurTextScores' same-origin deployment. A cross-origin host must pass `parentOrigin=<exact-origin>` in the editor URL, using the same strict HTTP(S) origin syntax as the player. An invalid origin, including `*`, disables these messages. **Compatibility change:** cross-origin scanner embeds that previously relied on wildcard delivery must set `parentOrigin`. The change-review update remains same-origin only. Hosts should validate both origin and the intended iframe's `contentWindow`, validate all consumed fields, and avoid treating these unversioned messages as general authenticated commands. These protections require the updated editor and host code to be deployed together.

OurTextScores currently constructs these URLs in its change-review, scanner page-comparison and finding-review components. Its static `/score-editor/` deployment and companion API are described in [Building for Embed/Export](BUILD_EMBED.md#vendoring-into-ourtextscores). Resizing and cleanup belong to the host for its iframe and listeners; editor/player internals clean up on unmount. The existing protocols do not provide a general cross-origin editor or compare API.
