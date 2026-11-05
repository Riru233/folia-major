import React from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { CAPSULE_MORPH_DURATION_S, PANEL_OPEN_CLIP, capsuleClipPath, type CapsuleFrame } from './capsuleFrame';
import { useGlass } from '@/shinoinject/useGlass';

// src/components/command-palette/CommandPaletteCapsuleFrame.tsx
// The palette grown up out of the player bar instead of dropped in from the top.
//
// Split out of CommandPalette like the inline frame: the panel and the pinned row are built there,
// once, for every frame; this file only places them over the bar and unfolds them from its shape.

type CommandPaletteCapsuleFrameProps = {
    /** The bar as it was when the palette opened: where the panel sits and what it unfolds from. */
    frame: CapsuleFrame;
    /** The bar as it is when the palette closes: what the panel folds back into. */
    exitFrame: CapsuleFrame;
    isOpen: boolean;
    backdropStyle: React.CSSProperties;
    onClose: () => void;
    /** Built by the palette with its 'above' placement. */
    pinnedRow: React.ReactNode;
    /** The palette's panel, input row last so it lands where the bar was. */
    panel: React.ReactNode;
    onOpened: () => void;
};

const MORPH_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * 同一个颜色的零透明度写法：遮罩的淡入淡出走 alpha，颜色本身不跟着从黑（或白）爬回来。
 * 认不出的写法（含空格分隔的现代语法）退回全透明，不在渲染期抛错。
 */
const withZeroAlpha = (color: string) => {
    const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(color.trim());
    return match ? `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0)` : 'rgba(0, 0, 0, 0)';
};

// Driven by `custom`: the opening clip is the bar at open, the closing one is passed through
// AnimatePresence so the exit reads the bar measured at close — the props an exiting child was last
// rendered with still hold the old shape.
const panelVariants: Variants = {
    start: (clip: string) => ({ clipPath: clip, opacity: 1 }),
    capsule: (clip: string) => ({
        clipPath: clip,
        // Fully there until the very end of the fold, so the bar taking over is a short crossfade in
        // one spot rather than a fade over the whole shrink.
        opacity: [1, 1, 0],
        transition: {
            clipPath: { duration: CAPSULE_MORPH_DURATION_S, ease: MORPH_EASE },
            opacity: { duration: CAPSULE_MORPH_DURATION_S, times: [0, 0.7, 1] },
        },
    }),
    open: {
        clipPath: PANEL_OPEN_CLIP,
        opacity: 1,
        transition: { clipPath: { duration: CAPSULE_MORPH_DURATION_S, ease: MORPH_EASE } },
    },
};

const CommandPaletteCapsuleFrame: React.FC<CommandPaletteCapsuleFrameProps> = ({
    frame,
    exitFrame,
    isOpen,
    backdropStyle,
    onClose,
    pinnedRow,
    panel,
    onOpened,
}) => {
    useGlass();
    // 遮罩只淡填色，不动整层的 opacity：任何 opacity < 1 的祖先都会成为 backdrop-filter 的取样根，
    // 面板的玻璃在动画期间就只取到这一层平涂，看上去整块玻璃没了，要等淡入落到 1 才突然回来。
    // 因此背景色单独交给下面这个渐变值，容器本身不参与透明度动画（普通遮罩那条分支同理）。
    const { backgroundColor, ...containerStyle } = backdropStyle;
    const backdropColor = typeof backgroundColor === 'string' ? backgroundColor : 'transparent';
    return (
    <AnimatePresence custom={capsuleClipPath(exitFrame)}>
        {isOpen && (
            <motion.div
                data-folia-keyboard-window="true"
                data-palette-frame="capsule"
                className={`fixed inset-0 z-[150] flex items-end justify-center px-4`}
                style={{ ...containerStyle, paddingBottom: frame.bottomGap }}
                initial={{ background: `linear-gradient(to top,${withZeroAlpha(backdropColor)} 10%,transparent 20%)` }}
                animate={{ background: `linear-gradient(to top,${backdropColor} 10%,transparent 20%)`, transition: { duration: 0.2 } }}
                // The backdrop outlasts the panel folding back into the bar, or the fold plays out
                // half transparent and reads as a plain fade.
                exit={{ background: `linear-gradient(to top,${withZeroAlpha(backdropColor)} 10%,transparent 20%)`, transition: { duration: 0.3, ease: [0.7, 0, 1, 1] } }}
                onMouseDown={onClose}
            >
                <div className={"fixed top-0 left-0 w-full h-full backdrop-blur-[0.9px]"} style={{
                    maskImage: "linear-gradient(to bottom, transparent 20%, #000 80%)"
                }} />
                <div className={"fixed top-0 left-0 w-full h-full backdrop-blur-[2px]"} style={{
                    maskImage: "linear-gradient(to bottom, transparent 40%, #000 90%)"
                }} />
                <div className={"fixed top-0 left-0 w-full h-full backdrop-blur-[5px]"} style={{
                    maskImage: "linear-gradient(to bottom, transparent 50%, #000 95%)"
                }} />
                <div className="w-full max-w-2xl" onMouseDown={(event) => event.stopPropagation()}>
                    {/* 只推 y，不淡 opacity：置顶那几颗按钮自己挂着玻璃，祖先 opacity < 1 会把它们的
                        取样根截在这一层，淡入那段就只剩平涂。淡入淡出交给按钮自己（PinnedCommandRow）。 */}
                    <motion.div
                        initial={{ y: 8 }}
                        animate={{ y: 0 }}
                        exit={{ y: 8 }}
                        transition={{ duration: 0.18, delay: 0.08 }}
                    >
                        {pinnedRow}
                    </motion.div>
                    {/* Unfolds from the bar's own shape and folds back into it. Not a shared layoutId
                        across the two layers — the bar and the palette do not share a stacking
                        context, and the backdrop blur should not be recomputed under a scale.
                        The glass sits here rather than on the panel: an ancestor's clip-path ends the
                        backdrop's sampling, so a panel carrying the glass inside this clipped box
                        would sample nothing at all. */}
                    <motion.div
                        data-glass data-glass-light
                        // 圆角不是为了好看：位移图按这一层的 border-radius 生成折射带，缺了它四角的折射会按直角算。
                        className="rounded-3xl"
                        custom={capsuleClipPath(frame)}
                        variants={panelVariants}
                        initial="start"
                        animate="open"
                        exit="capsule"
                        onAnimationComplete={(definition) => {
                            if (definition === 'open') {
                                onOpened();
                            }
                        }}
                    >
                        {panel}
                    </motion.div>
                </div>
            </motion.div>
        )}
    </AnimatePresence>
    );
};

export default CommandPaletteCapsuleFrame;
