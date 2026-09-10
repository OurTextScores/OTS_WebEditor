import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import {
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenu,
  DropdownMenuLabel,
} from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import {
  toolbarInputBaseClass,
  signatureOptionsDefault,
  keySignatureButtonOptionsDefault,
} from '../constants';
import { Clock, Check } from 'lucide-react';
import styles from './SignaturesSection.module.css';

const KEY_SHARP = String.fromCharCode(0xe262); // SMuFL accidentalSharp
const KEY_FLAT = String.fromCharCode(0xe260); // SMuFL accidentalFlat

// Render a key-signature label (e.g. "F#", "Bb") with its accidental drawn in the
// notation font: the leading note letter stays as text, trailing #/b become Leland glyphs.
const renderKeyLabel = (label: string): React.ReactNode => {
  if (label.length < 2) {
    return label;
  }
  const note = label[0];
  const accidentals = label.slice(1);
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span>{note}</span>
      {accidentals.split('').map((char, index) => {
        const glyph = char === '#' ? KEY_SHARP : char === 'b' ? KEY_FLAT : char;
        const isAccidental = char === '#' || char === 'b';
        return (
          <span
            key={index}
            className={isAccidental ? styles.keyAccidental : undefined}
            aria-hidden={isAccidental || undefined}
          >
            {glyph}
          </span>
        );
      })}
    </span>
  );
};

export const SignaturesSection: React.FC<ToolbarSectionProps> = ({
  onSetTimeSignature,
  onSetTimeSignature44,
  onSetTimeSignature34,
  timeSignatureOptions,
  onSetKeySignature,
  keySignatureOptions,
  mutationsEnabled,
}) => {
  const [customTimeSigNumerator, setCustomTimeSigNumerator] = useState('4');
  const [customTimeSigDenominator, setCustomTimeSigDenominator] = useState('4');

  const mutationDisabled = !mutationsEnabled;
  const canSetCustomTimeSig = !mutationDisabled && Boolean(onSetTimeSignature);

  const parsedCustomNumerator = Number.parseInt(customTimeSigNumerator, 10);
  const parsedCustomDenominator = Number.parseInt(customTimeSigDenominator, 10);
  const customTimeSigValid =
    Number.isInteger(parsedCustomNumerator) &&
    Number.isInteger(parsedCustomDenominator) &&
    parsedCustomNumerator > 0 &&
    parsedCustomDenominator > 0;

  const signatureOptions = timeSignatureOptions ?? signatureOptionsDefault;
  const keySignatureButtonOptions = keySignatureOptions ?? keySignatureButtonOptionsDefault;

  const resolveTimeSigHandler = (opt: {
    label: string;
    numerator: number;
    denominator: number;
    timeSigType?: number;
  }) => {
    if (onSetTimeSignature) {
      return () => onSetTimeSignature(opt.numerator, opt.denominator, opt.timeSigType);
    }
    if (opt.label === 'Common time') return onSetTimeSignature44;
    if (opt.label === 'Cut time') return onSetTimeSignature34;
    return undefined;
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-signature"
            variant="outline"
            size="sm"
            disabled={mutationDisabled}
            className="shadow-sm"
          >
            <Clock size={14} className="mr-1.5" />
            Time Signature
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {signatureOptions.map((opt) => {
            const handler = resolveTimeSigHandler(opt);
            return (
              <DropdownMenuItem
                key={opt.label}
                data-testid={`btn-timesig-${opt.numerator}-${opt.denominator}`}
                disabled={mutationDisabled || !handler}
                onSelect={() => handler?.()}
              >
                {opt.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-3 w-px bg-slate-200"></div>
      <span className="text-xs font-medium text-slate-600">Custom:</span>
      <input
        data-testid="input-timesig-numerator"
        type="number"
        min={1}
        value={customTimeSigNumerator}
        onChange={(event) => setCustomTimeSigNumerator(event.target.value)}
        disabled={!canSetCustomTimeSig}
        className={`${toolbarInputBaseClass} w-14`}
      />
      <span className="text-slate-600">/</span>
      <input
        data-testid="input-timesig-denominator"
        type="number"
        min={1}
        value={customTimeSigDenominator}
        onChange={(event) => setCustomTimeSigDenominator(event.target.value)}
        disabled={!canSetCustomTimeSig}
        className={`${toolbarInputBaseClass} w-14`}
      />
      <Button
        data-testid="btn-timesig-custom"
        onClick={() => {
          if (onSetTimeSignature && customTimeSigValid) {
            onSetTimeSignature(parsedCustomNumerator, parsedCustomDenominator);
          }
        }}
        disabled={!canSetCustomTimeSig || !customTimeSigValid}
        variant="outline"
        size="xs"
        className="shadow-sm"
        title="Apply Custom Time Signature"
        aria-label="Apply Custom Time Signature"
      >
        <Check size={14} />
      </Button>

      <div className="h-3 w-px bg-slate-200"></div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-key"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !onSetKeySignature}
            className="shadow-sm"
          >
            <span className={styles.triggerGlyph} aria-hidden="true">
              {KEY_SHARP}
            </span>
            Key
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Major</DropdownMenuLabel>
          {keySignatureButtonOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.fifths}
              data-testid={`btn-keysig-${opt.fifths}`}
              disabled={mutationDisabled || !onSetKeySignature}
              onSelect={() => onSetKeySignature?.(opt.fifths)}
            >
              {renderKeyLabel(opt.label)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
