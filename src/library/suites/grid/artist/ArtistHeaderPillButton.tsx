import { useGlass } from "@/shinoinject/useGlass";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { gridGlassCircleStyle } from "../shared/gridGlassChrome";

// src/library/suites/grid/artist/ArtistHeaderPillButton.tsx
// 网格歌手页页头右端的一颗圆钮：点开是一份两项的菜单（「加入热门歌曲」「全部媒体」）。
// 按钮本身只剩三个点（40×40 的圆，表面取集合页那组液态玻璃 gridGlassCircleStyle，与返回、面板开关同款），
// 窄屏宽屏一样大；菜单朝左下展开（钮在右端，left-0 会顶出窗口）。
// 菜单里的每一项各自决定可不可用：不可用的照样列出来、变淡、点不动（能力的 enabled）。

export type ArtistHeaderMenuItem = {
  /** 让思索与测试认出它（data-grid-action）。 */
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type ArtistHeaderPillButtonProps = {
  items: ArtistHeaderMenuItem[];
  /** 三个点这颗按钮的名字（「更多操作」）。 */
  label: string;
  isDaylight?: boolean;
};

export const ArtistHeaderPillButton: React.FC<ArtistHeaderPillButtonProps> = ({
  items,
  label,
  isDaylight = false,
}) => {
  useGlass();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  // 一项都没有就不画（调用方在两个能力都没给时本来也不画）。
  if (items.length === 0) return null;

  const circleStyle = { ...gridGlassCircleStyle(isDaylight), color: "var(--text-primary)" };

  return (
    <div
      ref={rootRef}
      className="relative flex items-center"
      // Escape 只收这份菜单，不往上冒（页面自己也听 Escape，会顺手关掉整页）。
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !isOpen) return;
        event.stopPropagation();
        setIsOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef}
        data-glass
        data-glass-jelly
        data-glass-light
        type="button"
        onClick={() => setIsOpen(current => !current)}
        data-grid-action="artist-more"
        className="h-10 w-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
        style={circleStyle}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-glass
            data-glass-jelly
            data-glass-light
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            role="menu"
            aria-label={label}
            className="absolute right-0 top-12 z-[80] w-52 rounded-2xl p-1.5"
            style={{
              ...gridGlassCircleStyle(isDaylight),
              backgroundColor: isDaylight
                ? "rgba(215,215,215,0.62)"
                : "rgba(40,40,40,0.62)",
              color: "var(--text-primary)",
            }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                data-grid-action={item.key}
                onClick={() => {
                  setIsOpen(false);
                  item.onClick();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-normal transition-colors cursor-pointer hover:bg-[var(--st-fill,rgba(127,127,127,0.18))] disabled:opacity-40 disabled:cursor-default"
              >
                <span className="shrink-0 opacity-70">{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
