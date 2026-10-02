import { notFound } from 'next/navigation';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button, type ButtonSize, type ButtonVariant } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Input, Textarea } from '../../../components/ui/Input';

/**
 * Every token and primitive in every state (docs/private/DESIGN_LANGUAGE.md §8). Development
 * only: a production build answers 404. It is also the page to screenshot when a token changes.
 */

const COLOURS: [string, string][] = [
  ['surface', 'bg-surface'],
  ['surface-sunken', 'bg-surface-sunken'],
  ['surface-hover', 'bg-surface-hover'],
  ['line', 'bg-line'],
  ['line-strong', 'bg-line-strong'],
  ['line-control', 'bg-line-control'],
  ['ink', 'bg-ink'],
  ['ink-muted', 'bg-ink-muted'],
  ['ink-faint', 'bg-ink-faint'],
  ['accent', 'bg-accent'],
  ['accent-hover', 'bg-accent-hover'],
  ['accent-soft', 'bg-accent-soft'],
  ['success', 'bg-success'],
  ['success-soft', 'bg-success-soft'],
  ['warning', 'bg-warning'],
  ['warning-soft', 'bg-warning-soft'],
  ['danger', 'bg-danger'],
  ['danger-soft', 'bg-danger-soft'],
];

const TYPE_ROLES: [string, string, string][] = [
  ['display', 'text-xl font-semibold', 'text-xl, 20px'],
  ['title', 'text-base font-semibold', 'text-base, 16px'],
  ['body', 'text-sm', 'text-sm, 14px'],
  ['small', 'text-xs', 'text-xs, 12px'],
  ['caption', 'text-caption', 'text-caption, 11px'],
  ['eyebrow', 'text-caption font-bold uppercase tracking-wider text-ink-muted', '11px, uppercase'],
  ['mono', 'font-mono text-xs', 'font-mono, 12px'],
];

const LAYERS = [
  'canvas',
  'panel',
  'status',
  'toolbar',
  'activity',
  'header',
  'float',
  'toast',
  'menu',
  'palette',
];

const VARIANTS: ButtonVariant[] = [
  'primary',
  'outline',
  'ghost',
  'danger',
  'neutral',
  'destructive',
  'quiet',
  'link',
];
const SIZES: ButtonSize[] = ['xs', 'sm', 'md', 'bar'];
const TONES: BadgeTone[] = ['neutral', 'accent', 'success', 'warning', 'danger'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-caption font-bold uppercase tracking-wider text-ink-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function UiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main data-testid="ui-gallery" className="mx-auto max-w-5xl bg-surface p-8 text-ink">
      <h1 className="mb-8 text-xl font-semibold">OTS design language</h1>

      <Section title="Colour roles">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {COLOURS.map(([name, swatch]) => (
            <div key={name} className="text-caption">
              <div className={`h-10 rounded border border-line ${swatch}`} />
              <div className="mt-1 text-ink-muted">{name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type roles">
        <div className="space-y-2">
          {TYPE_ROLES.map(([role, classes, note]) => (
            <div key={role} className="flex items-baseline gap-4">
              <span className="w-20 text-caption text-ink-muted">{role}</span>
              <span className={classes}>Sonata for Piano in A minor</span>
              <span className="text-caption text-ink-faint">{note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Shape and elevation">
        <div className="flex flex-wrap gap-4">
          {(['rounded', 'rounded-md', 'rounded-lg'] as const).map((radius) => (
            <div
              key={radius}
              className={`h-14 w-24 border border-line-control bg-surface p-2 text-caption ${radius}`}
            >
              {radius}
            </div>
          ))}
          <div className="h-14 w-24 rounded-lg border border-line bg-surface p-2 text-caption shadow-raised">
            raised
          </div>
          <div className="h-14 w-24 rounded-lg border border-line bg-surface p-2 text-caption shadow-modal">
            modal
          </div>
        </div>
      </Section>

      <Section title="Layers">
        <ol className="space-y-1 text-xs">
          {LAYERS.map((layer) => (
            <li key={layer} className="font-mono">
              --ots-z-{layer}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Button">
        <div className="space-y-3">
          {VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-caption text-ink-muted">{variant}</span>
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
              <Button variant={variant} disabled>
                disabled
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="IconButton">
        <div className="flex items-center gap-2">
          <IconButton label="Zoom in">+</IconButton>
          <IconButton label="Zoom out">−</IconButton>
          <IconButton label="Disabled" disabled>
            ×
          </IconButton>
        </div>
      </Section>

      <Section title="Input, Textarea, Field">
        <div className="grid max-w-xl gap-4">
          <Field label="Title" hint="Shown in the score list.">
            {(control) => <Input placeholder="Untitled score" {...control} />}
          </Field>
          <Field label="Composer" error="A composer is required.">
            {(control) => <Input defaultValue="" {...control} />}
          </Field>
          <Field label="Notes">{(control) => <Textarea rows={3} {...control} />}</Field>
          <Field label="Locked">
            {(control) => <Input defaultValue="Read only" disabled {...control} />}
          </Field>
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex gap-2">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
      </Section>
    </main>
  );
}
