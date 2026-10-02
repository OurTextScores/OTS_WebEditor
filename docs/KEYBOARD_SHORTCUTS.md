# Keyboard shortcuts

> Generated from `lib/commands/bindings.ts` and the command labels by
> `components/shell/shortcutDocument.ts`. Do not edit by hand.

Desktop MuseScore's shortcuts are the defaults. `Ctrl/Cmd` is Ctrl on Windows and Linux, ⌘ on macOS.
The same list is in the editor under **Help ▸ Keyboard Shortcuts** and on the help page.

## Everywhere

| Action | Keys |
| --- | --- |
| Command Palette | `Ctrl/Cmd+Shift+P` |
| Bar or Rehearsal Mark | `Ctrl/Cmd+F` |
| Editor Help | `F1` |
| Instruments | `F7` |
| Properties | `F8` |
| Palettes | `F9` |
| Toggle All Panels | `Ctrl/Cmd+\` |
| Zoom In | `Ctrl/Cmd+=` · `Ctrl/Cmd++` |
| Zoom Out | `Ctrl/Cmd+-` |
| Zoom to 100% | `Ctrl/Cmd+0` |
| Save Checkpoint | `Ctrl/Cmd+S` |
| Open Score | `Ctrl/Cmd+O` |
| Export PDF | `Ctrl/Cmd+P` |
| Cancel: close the innermost open item, then clear the selection | `Escape` |
| Play or Pause | `Space` |
| Play From Selection | `Shift+Space` |

## Editing

With a selection, or in note input. Each acts on what is selected.

| Action | Keys |
| --- | --- |
| Undo | `Ctrl/Cmd+Z` |
| Redo | `Ctrl/Cmd+Shift+Z` · `Ctrl/Cmd+Y` |
| Select All | `Ctrl/Cmd+A` |
| Copy | `Ctrl/Cmd+C` |
| Paste | `Ctrl/Cmd+V` |
| Note Input | `N` |
| Enter a note by letter (Shift adds it to the chord) | `C` · `Shift+C` · `D` · `Shift+D` · `E` · `Shift+E` · `F` · `Shift+F` · `G` · `Shift+G` · `A` · `Shift+A` · `B` · `Shift+B` |
| Rest | `0` |
| Set duration (1 = 64th … 7 = whole, 8 = breve) | `1` · `2` · `3` · `4` · `5` · `6` · `7` · `8` |
| Dot | `.` |
| Accidental: Sharp | `+` |
| Accidental: Flat | `-` |
| Accidental: Natural | `=` |
| Tie | `T` |
| Flip Direction | `X` |
| Select Next Chord | `ArrowRight` |
| Select Previous Chord | `ArrowLeft` |
| Extend Selection to Next Chord | `Shift+ArrowRight` |
| Extend Selection to Previous Chord | `Shift+ArrowLeft` |
| Extend Selection to Next Measure | `Ctrl/Cmd+Shift+ArrowRight` |
| Extend Selection to Previous Measure | `Ctrl/Cmd+Shift+ArrowLeft` |
| Delete | `Delete` · `Backspace` |
| Articulation: Staccato | `Shift+S` |
| Articulation: Tenuto | `Shift+N` |
| Articulation: Marcato | `Shift+O` |
| Hairpin: Crescendo | `Shift+,` |
| Hairpin: Decrescendo | `Shift+.` |
| Voice: Voice 1 | `Ctrl/Cmd+Alt+1` |
| Voice: Voice 2 | `Ctrl/Cmd+Alt+2` |
| Voice: Voice 3 | `Ctrl/Cmd+Alt+3` |
| Voice: Voice 4 | `Ctrl/Cmd+Alt+4` |
| Insert Measures | `Ctrl/Cmd+B` |

## Selection mode

| Action | Keys |
| --- | --- |
| Slur | `S` |
| Longer | `W` |
| Shorter | `Q` |
| Line Break | `Enter` |
| Page Break | `Ctrl/Cmd+Enter` |
| Pitch Up | `ArrowUp` |
| Pitch Down | `ArrowDown` |
| Up an Octave | `Ctrl/Cmd+ArrowUp` |
| Down an Octave | `Ctrl/Cmd+ArrowDown` |
| Extend Selection to Staff Above | `Shift+ArrowUp` |
| Extend Selection to Staff Below | `Shift+ArrowDown` |

## What is deliberately not bound

A page cannot capture every key, and a few desktop defaults would do something else in a browser.

- **Reserved by the browser** (cannot be captured, so no editor command uses them): `F5`, `F11`, `F12`, `Ctrl/Cmd+N`, `Ctrl/Cmd+T`, `Ctrl/Cmd+W`, `Ctrl/Cmd+Shift+N`, `Ctrl/Cmd+Shift+T`, `Ctrl/Cmd+Shift+W`, `Ctrl+Tab`, `Ctrl/Cmd+PageUp`, `Ctrl/Cmd+PageDown`, `Ctrl/Cmd+1`, `Ctrl/Cmd+2`, `Ctrl/Cmd+3`, `Ctrl/Cmd+4`, `Ctrl/Cmd+5`, `Ctrl/Cmd+6`, `Ctrl/Cmd+7`, `Ctrl/Cmd+8`, `Ctrl/Cmd+9`. Ctrl/Cmd+N (New Score) and Ctrl/Cmd+T (Staff Text) are on this list; reach those commands from the menus or the command palette.
- **Left unbound** (the browser or OS acts on them, and not every engine lets a page take them): `Ctrl/Cmd+D`, `Ctrl/Cmd+E`, `Ctrl/Cmd+G`, `Ctrl/Cmd+J`, `Ctrl/Cmd+K`, `Ctrl/Cmd+L`, `Ctrl/Cmd+Q`, `Ctrl/Cmd+R`. The commands stay in the menus and the palette.

## Limits

- Keys that need Shift on a US keyboard (`+`, `<`, `>`) are written as the physical key plus Shift. Other layouts may need a different chord for them.
- Keys typed into a text field, or while a dialog or menu is open, are not editing keys. Only the command palette key works there.
- Escape cancels the innermost open thing first: a drag, a grip edit, the floating palettes, note input, and finally the selection.
