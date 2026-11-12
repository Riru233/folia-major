import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue } from 'framer-motion';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { getVisualizerRegistryEntry } from '../../src/components/visualizer/registry';
import type { Line } from '../../src/types';
import type { ProbeDefinition } from './definition';

// dev/probes/karaokeJitter.probe.tsx
// 临时台架：专门复现卡拉OK「第二行（靠右那句）在唱时上下抖动」的问题。

const params = new URLSearchParams(window.location.search);
const SPEED = Number(params.get('speed') ?? '1');
const START = Number(params.get('start') ?? '0');
const SECONDS_PER_LINE = Number(params.get('dur') ?? '5');
const MODE_TUNING = params.has('tuning') ? JSON.parse(params.get('tuning')!) : {};

const SHORT = 'hold on';
const LONG_EN = 'we were young under the neon rain and the river keeps calling me home again';
const LONG_EN2 = 'midnight river carry me back to the harbour where the lanterns never go out';

const buildLines = (): Line[] => {
    const texts = [SHORT, LONG_EN, LONG_EN2, SHORT, LONG_EN, LONG_EN2];
    return texts.map((text, index) => {
        const start = index * SECONDS_PER_LINE;
        const tokens = text.split(' ');
        const step = (SECONDS_PER_LINE - 0.2) / tokens.length;
        const words = tokens.map((token, offset) => ({
            text: offset < tokens.length - 1 ? `${token} ` : token,
            startTime: start + offset * step,
            endTime: start + (offset + 1) * step,
        }));
        return {
            id: `line-${index}`,
            words,
            startTime: start,
            endTime: start + SECONDS_PER_LINE - 0.1,
            fullText: text,
            translation: `译文 ${index}`,
            isChorus: false,
        };
    });
};

const LINES = buildLines();
const TOTAL = LINES.length * SECONDS_PER_LINE;

const KaraokeJitterProbe: React.FC = () => {
    const currentTime = useMotionValue(START);
    const audioPower = useMotionValue(0.4);
    const bass = useMotionValue(0.4);
    const lowMid = useMotionValue(0.4);
    const mid = useMotionValue(0.4);
    const vocal = useMotionValue(0.4);
    const treble = useMotionValue(0.4);
    const [currentLineIndex, setCurrentLineIndex] = useState(0);
    const lineIndexRef = useRef(0);

    const audioBands = useMemo(() => ({ bass, lowMid, mid, vocal, treble }), [bass, lowMid, mid, vocal, treble]);

    useEffect(() => {
        let raf = 0;
        let lastFrameAt = performance.now();
        let elapsed = START;
        const tick = (now: number) => {
            const dt = (now - lastFrameAt) / 1000;
            lastFrameAt = now;
            elapsed = (elapsed + dt * SPEED) % TOTAL;
            currentTime.set(elapsed);
            const index = Math.min(LINES.length - 1, Math.floor(elapsed / SECONDS_PER_LINE));
            if (index !== lineIndexRef.current) {
                lineIndexRef.current = index;
                setCurrentLineIndex(index);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [currentTime]);

    const entry = getVisualizerRegistryEntry('karaoke');

    return (
        <div className="fixed inset-0" data-probe-mode="karaoke">
            {entry.render({
                currentTime,
                currentLineIndex,
                lines: LINES,
                theme: DEFAULT_THEME,
                audioPower,
                audioBands,
                showText: true,
                paused: false,
                seed: 'probe',
                coverUrl: null,
                visualizerTunings: { karaoke: MODE_TUNING },
            } as never)}
        </div>
    );
};

const definition: ProbeDefinition = {
    id: 'karaokeJitter',
    title: '卡拉OK · 抖动台架',
    description: 'speed=<倍速> start=<秒> dur=<每句秒数>',
    Component: KaraokeJitterProbe,
};

export default definition;
