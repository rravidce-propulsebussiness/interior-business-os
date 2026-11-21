'use client';

import { useEffect, useRef, useState } from 'react';
import { parseFeet } from '@business-os/core/construction-boq';

/**
 * Reads a typed number; with `feet`, also drawing sizes such as 11'3".
 * Returns null when the text is not a number, so it is never guessed.
 */
export function readNumber(text: string, feet = false): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (!trimmed) return 0;
  if (feet) return parseFeet(trimmed);
  return /^\d*\.?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

const shown = (value: number, blankZero: boolean) =>
  blankZero && !value ? '' : String(value);

/**
 * A number box for the BOQ. It keeps exactly what was typed (so clearing a
 * box never snaps back to "0", and 11'3" stays as written), commits only
 * numbers it can read, and marks text it cannot read instead of guessing.
 * Feet boxes accept 11'3", 11'3, 11-3 or 11.25 and show the feet they read.
 */
export function NumberField({
  value,
  onChange,
  label,
  feet = false,
  integer = false,
  min = 0,
  max,
  placeholder,
  blankZero = false,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** Accept feet-inches as written on drawings. */
  feet?: boolean;
  integer?: boolean;
  min?: number;
  max?: number | undefined;
  placeholder?: string | undefined;
  /** Show an empty box for 0 (the company default applies). */
  blankZero?: boolean;
}) {
  const [text, setText] = useState(shown(value, blankZero));
  const committed = useRef(value);
  useEffect(() => {
    // A new value from outside (another BOQ, Undo, a size list) replaces
    // the typed text; the box's own commits do not, even when the BOQ
    // stores them rounded (11'8" = 11.6667 is kept as 11.67).
    if (Math.abs(value - committed.current) < 0.006) return;
    committed.current = value;
    setText(shown(value, blankZero));
  }, [value, blankZero]);
  const clamp = (number: number) => {
    let next = Math.max(min, number);
    if (max !== undefined) next = Math.min(max, next);
    return integer ? Math.round(next) : next;
  };
  const read = readNumber(text, feet);
  const invalid = read === null;
  const hint =
    feet && read !== null && read > 0 && /[^\d.\s]/.test(text.trim())
      ? `= ${Math.round(read * 100) / 100} ft`
      : '';
  return (
    <span className={`boq-num${invalid ? ' is-invalid' : ''}`}>
      <input
        type="text"
        inputMode={feet ? 'text' : 'decimal'}
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        title={
          invalid
            ? feet
              ? `Not a length. Type feet and inches like 11'3" or decimals like 11.25.`
              : 'Not a number.'
            : hint || undefined
        }
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const number = readNumber(next, feet);
          if (number === null) return;
          const clamped = clamp(number);
          committed.current = clamped;
          onChange(clamped);
        }}
        onBlur={() => {
          if (invalid) return;
          // Plain numbers are tidied (04 → 4); drawing sizes stay as typed.
          if (!hint) setText(shown(clamp(read), blankZero));
        }}
      />
      {hint && <small className="boq-num-hint">{hint}</small>}
      {invalid && (
        <small className="boq-num-hint" role="alert">
          {feet ? `Use 11'3" or 11.25` : 'Not a number'}
        </small>
      )}
    </span>
  );
}
