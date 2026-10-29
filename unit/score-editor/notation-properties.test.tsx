import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  NOTATION_PROPERTIES,
  NotationPropertiesSection,
  notationPropertyNames,
  splitInterval,
  type NotationPropertiesModel,
} from '../../components/score-editor/properties';

const state = (value: string | null, def: string, mixed = false) => ({ value, default: def, mixed, applicableCount: 1 });

function model(elementType: string, values: NotationPropertiesModel['values']): NotationPropertiesModel {
  return { group: NOTATION_PROPERTIES[elementType], values, set: vi.fn(async () => {}), supported: true };
}

describe('notation property descriptors (E09)', () => {
  it('asks the engine about the properties of the selected element type only', () => {
    expect(notationPropertyNames('Ornament')).toContain('intervalAbove');
    expect(notationPropertyNames('Dynamic')).toContain('voiceAssignment');
    expect(notationPropertyNames('TremoloTwoChord')).toEqual(['subtype', 'strokeStyle', 'play']);
    expect(notationPropertyNames('Note')).toEqual([]);
    expect(notationPropertyNames(null)).toEqual([]);
  });

  it('splits an ornament interval token, falling back on unknown parts', () => {
    expect(splitInterval('third,minor')).toEqual({ step: 'third', type: 'minor' });
    expect(splitInterval('eleventh,weird')).toEqual({ step: 'second', type: 'auto' });
    expect(splitInterval(null)).toEqual({ step: 'second', type: 'auto' });
  });
});

describe('the notation section', () => {
  it('shows only the properties the selection has', () => {
    render(<NotationPropertiesSection disabled={false} model={model('Ornament', { intervalAbove: state('second,auto', 'second,auto') })} />);
    expect(screen.getByTestId('notation-intervalAbove-step')).toHaveValue('second');
    expect(screen.queryByTestId('notation-startOnUpperNote')).toBeNull();
  });

  it('sets an interval as the engine token, and resets a changed property to its default', () => {
    const m = model('Ornament', { intervalAbove: state('third,minor', 'second,auto') });
    render(<NotationPropertiesSection disabled={false} model={m} />);
    fireEvent.change(screen.getByTestId('notation-intervalAbove-type'), { target: { value: 'major' } });
    expect(m.set).toHaveBeenCalledWith('intervalAbove', 'third,major');
    fireEvent.click(screen.getByTestId('notation-intervalAbove-reset'));
    expect(m.set).toHaveBeenLastCalledWith('intervalAbove', null);
  });

  it('cannot reset a property already at its default, and marks mixed values', () => {
    render(
      <NotationPropertiesSection
        disabled={false}
        model={model('Dynamic', {
          voiceAssignment: state('allInInstrument', 'allInInstrument'),
          centerBetweenStaves: state(null, 'auto', true),
        })}
      />,
    );
    expect(screen.getByTestId('notation-voiceAssignment-reset')).toBeDisabled();
    expect(screen.getByTestId('notation-centerBetweenStaves')).toHaveValue('');
  });

  it('renders nothing for an element type without notation properties', () => {
    const { container } = render(<NotationPropertiesSection disabled={false} model={model('Note', {})} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('number properties', () => {
  it('commits a clamped number on blur, as the engine token', () => {
    const m = model('Dynamic', { velocity: state('96', '96') });
    render(<NotationPropertiesSection disabled={false} model={m} />);
    const input = screen.getByTestId('notation-velocity');
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.blur(input);
    expect(m.set).toHaveBeenCalledWith('velocity', '127');
  });

  it('does not write an unchanged value', () => {
    const m = model('Dynamic', { velocity: state('80', '96') });
    render(<NotationPropertiesSection disabled={false} model={m} />);
    fireEvent.blur(screen.getByTestId('notation-velocity'));
    expect(m.set).not.toHaveBeenCalled();
  });
});
