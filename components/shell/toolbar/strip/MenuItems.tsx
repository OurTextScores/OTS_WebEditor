'use client';

import React from 'react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../../ui/DropdownMenu';
import { BeamIcon } from '../../../toolbar/BeamIcon';
import { GlyphIcon } from './icons/StripIcon';
import type { ToolbarCommands } from '../useToolbarCommands';
import type { StripItem, StripMenu } from './toolbarLayout';

/** The commands every strip menu draws from: an item's own, else the menu's. */
export const commandOf = (control: StripMenu, item: StripItem) =>
  item.commandId ?? control.commandId ?? '';

const glyphOf = (item: StripItem) =>
  item.beam !== undefined ? (
    <BeamIcon value={item.beam} className="text-slate-800" />
  ) : item.glyph ? (
    <GlyphIcon glyph={item.glyph} size={22} />
  ) : null;

/**
 * The items of a strip menu: a list (with section headings, glyphs beside labels, checkable items)
 * or, when the menu says how many columns, a grid of notation glyphs. Either ends with the menu's
 * footer. Each item keeps the ribbon's test id; `onChoose` is told which item ran (the split
 * buttons remember it).
 */
export function MenuItems({
  control,
  tools,
  onChoose,
}: {
  control: StripMenu;
  tools: ToolbarCommands;
  onChoose?: (item: StripItem) => void;
}) {
  const grid = Boolean(control.columns);
  const choose = (item: StripItem) => () => {
    tools.run(commandOf(control, item), item.arg)();
    onChoose?.(item);
  };

  return (
    <>
      {control.items.map((item, position) => {
        const id = commandOf(control, item);
        const enabled = tools.enabled(id);
        if (grid) {
          return (
            <DropdownMenuItem
              key={item.testId}
              data-testid={item.testId}
              aria-label={item.label}
              title={item.label}
              disabled={!enabled}
              className="h-9 w-9 justify-center p-0"
              onSelect={choose(item)}
            >
              {item.glyph || item.beam !== undefined ? (
                glyphOf(item)
              ) : (
                <span className="text-caption">{item.label}</span>
              )}
            </DropdownMenuItem>
          );
        }
        const heading = item.section ? (
          <>
            {position > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{item.section}</DropdownMenuLabel>
          </>
        ) : null;
        const label = (
          <>
            {glyphOf(item)}
            {item.label}
          </>
        );
        if (control.checkable) {
          return (
            <React.Fragment key={item.testId}>
              {heading}
              <DropdownMenuCheckboxItem
                data-testid={item.testId}
                checked={tools.checkedFor(id, item.arg)}
                disabled={!enabled}
                onSelect={(event) => {
                  event.preventDefault();
                  choose(item)();
                }}
              >
                {label}
              </DropdownMenuCheckboxItem>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={item.testId}>
            {heading}
            <DropdownMenuItem
              data-testid={item.testId}
              className={item.glyph || item.beam !== undefined ? 'gap-3' : undefined}
              disabled={!enabled}
              onSelect={choose(item)}
            >
              {label}
            </DropdownMenuItem>
          </React.Fragment>
        );
      })}
      {control.footer && (
        <>
          <DropdownMenuSeparator style={grid ? { gridColumn: '1 / -1' } : undefined} />
          <DropdownMenuItem
            data-testid={control.footer.testId}
            style={grid ? { gridColumn: '1 / -1' } : undefined}
            disabled={!tools.enabled(commandOf(control, control.footer))}
            onSelect={tools.run(commandOf(control, control.footer), control.footer.arg)}
          >
            {control.footer.label}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
