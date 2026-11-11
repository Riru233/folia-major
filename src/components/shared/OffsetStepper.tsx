import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { FIELD_CLASS, parseNumberText } from '../modal/settings/kit';

// src/components/shared/OffsetStepper.tsx
// 音画偏移的输入：`< - 0 + >` 秒。两头的尖角是粗调（整秒），中间的加减是细调（10 毫秒），
// 中间的数字可以直接输入——大调小调都在同一个格子里，不设上下限。
//
// 值一直是秒，落盘时由 store 收到毫秒精度；这里只管把它显示成好读的样子（多余的零不画）。

/** 粗调一格 1 秒，细调一格 0.01 秒。 */
const COARSE_STEP_SEC = 1;
const FINE_STEP_SEC = 0.01;

const STEP_BUTTON_CLASS = 'st-t-fast grid h-full w-7 shrink-0 place-items-center text-[color:var(--st-t2)] transition-colors enabled:hover:text-[color:var(--st-t1)] disabled:cursor-not-allowed disabled:opacity-40';

/** 0.25 而不是 0.25000000000000003：二进制小数相加会带上尾巴。 */
const formatSeconds = (value: number): string => String(Math.round(value * 1000) / 1000);

type OffsetStepperProps = {
    /** 秒；正数画面比声音晚。 */
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    /** 给读屏用：这是哪个设置。 */
    label: string;
};

const OffsetStepper: React.FC<OffsetStepperProps> = ({ value, onChange, disabled, label }) => {
    /** 正在输入的文字；null 表示显示 `value`。 */
    const [draft, setDraft] = useState<string | null>(null);

    const commit = () => {
        if (draft === null) return;
        const typed = parseNumberText(draft);
        // 清空的格子当作没偏移；读不出来的文字把原值放回去。
        onChange(typed ?? 0);
        setDraft(null);
    };
    const step = (delta: number) => {
        const from = (draft === null ? null : parseNumberText(draft)) ?? value;
        onChange(Math.round((from + delta) * 1000) / 1000);
        setDraft(null);
    };
    const button = (delta: number, icon: React.ReactNode, hint: string) => (
        <button
            type="button"
            tabIndex={-1}
            aria-label={`${label} ${hint}`}
            title={hint}
            aria-hidden
            disabled={disabled}
            onMouseDown={event => event.preventDefault()}
            onClick={() => step(delta)}
            className={STEP_BUTTON_CLASS}
        >
            {icon}
        </button>
    );

    return (
        <span className={`${FIELD_CLASS} inline-flex w-[150px] items-stretch overflow-hidden${disabled ? ' opacity-40' : ''}`}>
            {button(-COARSE_STEP_SEC, <ChevronLeft size={14} />, '-1s')}
            {button(-FINE_STEP_SEC, <Minus size={14} />, '-0.01s')}
            <input
                type="text"
                inputMode="decimal"
                role="spinbutton"
                aria-label={label}
                value={draft ?? formatSeconds(value)}
                disabled={disabled}
                spellCheck={false}
                onChange={event => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') commit();
                    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        // 方向键走细调；按住 Shift 走粗调。
                        event.preventDefault();
                        step((event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? COARSE_STEP_SEC : FINE_STEP_SEC));
                    }
                }}
                className="min-w-0 flex-1 bg-transparent text-center tabular-nums outline-none disabled:cursor-not-allowed"
            />
            {button(FINE_STEP_SEC, <Plus size={14} />, '+0.01s')}
            {button(COARSE_STEP_SEC, <ChevronRight size={14} />, '+1s')}
        </span>
    );
};

export default OffsetStepper;
