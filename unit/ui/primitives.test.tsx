// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { Input, Textarea } from '../../components/ui/Input';

afterEach(cleanup);

describe('Button', () => {
  it('is a type=button so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('type', 'button');
  });

  it('does not run onClick while disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('never sets the same colour property twice from the base and a variant', () => {
    // Two utilities for one property are resolved by stylesheet order, not class order. The
    // disabled and ring-offset looks therefore live in the variants only.
    render(<Button variant="quiet">Quiet</Button>);
    const classes = screen.getByRole('button').className.split(/\s+/);
    for (const prefix of ['disabled:bg-', 'disabled:text-', 'focus-visible:ring-offset-']) {
      const matches = classes.filter((name) => name.startsWith(prefix) && !name.includes('hover'));
      expect(
        new Set(matches.map((name) => name.split('-').slice(0, 3).join('-'))).size,
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe('IconButton', () => {
  it('uses its label as the accessible name and the default tooltip', () => {
    render(<IconButton label="Zoom in">+</IconButton>);
    const button = screen.getByRole('button', { name: 'Zoom in' });
    expect(button.getAttribute('title')).toBe('Zoom in');
  });

  it('keeps a longer title when one is given', () => {
    render(
      <IconButton label="Notifications" title="Notifications (2 unread)">
        !
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('title')).toBe(
      'Notifications (2 unread)',
    );
  });
});

describe('Field', () => {
  it('ties the label, the hint and the control together', () => {
    render(
      <Field label="Title" hint="Shown in the list.">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Title');
    const hint = screen.getByText('Shown in the list.');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows an error instead of the hint, marks the control invalid and announces it', () => {
    render(
      <Field label="Composer" hint="Who wrote it." error="A composer is required.">
        {(control) => <Textarea {...control} />}
      </Field>,
    );
    const control = screen.getByLabelText('Composer');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('Who wrote it.')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('A composer is required.');
    expect(control.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('gives two fields different ids', () => {
    render(
      <>
        <Field label="A">{(control) => <Input {...control} />}</Field>
        <Field label="B">{(control) => <Input {...control} />}</Field>
      </>,
    );
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});

describe('Input', () => {
  it('forwards its ref and attributes', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} placeholder="Name" maxLength={4} />);
    expect(ref.current?.maxLength).toBe(4);
    expect(ref.current?.type).toBe('text');
  });
});

describe('Badge', () => {
  it('renders its text with the tone classes', () => {
    render(<Badge tone="danger">Failed</Badge>);
    expect(screen.getByText('Failed').className).toContain('text-danger');
  });
});
