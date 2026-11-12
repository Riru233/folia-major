import React, { useEffect, useRef } from 'react';
import { Row, Slider, Toggle } from '../modal/settings/kit';
import { Stepper } from '../panelTab/shell/Stepper';

// src/components/visualizer/panelRows.tsx
// What the option panels of the lyric styles and of the backgrounds share when they draw rows of
// the settings kit: the slider row, which also tells the window when a drag starts and ends, and
// the two ways a value is written beside a slider, and the row that is one switch.

export const percent = (value: number) => `${Math.round(value * 100)}%`;
export const times = (value: number) => `${value.toFixed(2)}x`;

type SliderRowProps = {
    label: React.ReactNode;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
    onChange: (value: number) => void;
    /** A pointer took hold of the slider: until onDragEnd the window keeps the values as a draft. */
    onDragStart?: () => void;
    /** The pointer let go, wherever it was by then. */
    onDragEnd?: () => void;
    marks?: ReadonlyArray<{ value: number; label?: string }>;
    note?: React.ReactNode;
    sub?: boolean;
    disabled?: boolean;
};

/**
 * A row that is one slider: the value ends the label's line, the track spans the row.
 * The kit's slider does not say when a drag starts or ends, so a hidden mark beside it finds the
 * box the row keeps it in, and the pointer is listened to there.
 */
export const SliderRow: React.FC<SliderRowProps> = ({ label, onDragStart, onDragEnd, note, sub, disabled, ...slider }) => {
    const markRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const box = markRef.current?.parentElement;
        if (!box || !onDragStart) {
            return;
        }
        let dragging = false;
        const end = () => {
            if (!dragging) {
                return;
            }
            dragging = false;
            window.removeEventListener('pointerup', end, true);
            window.removeEventListener('pointercancel', end, true);
            window.removeEventListener('blur', end);
            onDragEnd?.();
        };
        const start = (event: PointerEvent) => {
            // The names under a slider's marks are buttons: a press on one is not a drag.
            if (!(event.target instanceof HTMLInputElement)) {
                return;
            }
            dragging = true;
            onDragStart();
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
            // The window lost the focus with the button held: the release may never be told here.
            window.addEventListener('blur', end);
        };
        box.addEventListener('pointerdown', start);
        return () => {
            box.removeEventListener('pointerdown', start);
            // The row leaves in the middle of a drag (a fold closing, another style chosen): the drag ends now.
            end();
        };
    }, [onDragStart, onDragEnd]);

    return (
        <Row label={label} note={note} sub={sub} disabled={disabled}>
            <Slider {...slider} stacked />
            <span ref={markRef} hidden />
        </Row>
    );
};

type StepperRowProps = {
    label: React.ReactNode;
    value: number;
    step: number;
    onChange: (value: number) => void;
    /** How low the number may go; a press or a typed value that goes under stops here. */
    min?: number;
    /** How high it may go; leave it out for a value with no ceiling. */
    max?: number;
    /** Shown after the number, and in the tooltips of the two buttons. */
    unit?: string;
    note?: React.ReactNode;
    sub?: boolean;
    disabled?: boolean;
};

/**
 * A row that is one number with a minus and a plus: no track, so a value with no upper bound
 * still fits (a slider would have to pick a top for it). The number can be typed as well.
 */
export const StepperRow: React.FC<StepperRowProps> = ({ label, value, step, onChange, min, max, unit, note, sub, disabled }) => {
    const clamp = (next: number) => {
        let out = Number.isFinite(next) ? next : value;
        if (typeof min === 'number') {
            out = Math.max(min, out);
        }
        if (typeof max === 'number') {
            out = Math.min(max, out);
        }
        return out;
    };

    return (
        <Row label={label} note={note} sub={sub} disabled={disabled}>
            <Stepper
                value={value}
                step={step}
                unit={unit}
                label={typeof label === 'string' ? label : ''}
                onChange={next => onChange(clamp(next))}
            />
        </Row>
    );
};

type ToggleRowProps = {
    label: React.ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
    note?: React.ReactNode;
    sub?: boolean;
    disabled?: boolean;
};

/** A row that is one switch. */
export const ToggleRow: React.FC<ToggleRowProps> = ({ checked, onChange, ...row }) => (
    <Row {...row}>
        <Toggle checked={checked} onChange={onChange} />
    </Row>
);
