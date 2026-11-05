import { useGlass } from "@/shinoinject/useGlass";
import React from "react";

// src/library/suites/grid/artist/ArtistHeaderPillButton.tsx
// 网格歌手页左上角返回键旁的一颗胶囊按钮（「加入热门歌曲」「全部歌曲」）：窄屏只剩图标，宽屏带字；
// 不可用时照样画、变淡、点不动（能力的 enabled）。底色跟返回键走，由调用方给。

type ArtistHeaderPillButtonProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** 返回键同一套底色与文字色（ArtistGridView 的 closeBtnBg）。 */
  toneClassName: string;
  /** 让思索与测试认出它。 */
  dataAction?: string;
  isDaylight?: boolean;
};

export const ArtistHeaderPillButton: React.FC<ArtistHeaderPillButtonProps> = ({
  icon,
  label,
  onClick,
  disabled = false,
  toneClassName,
  dataAction,
  isDaylight,
}) => {
  useGlass();
  return (
    <button
      data-glass
      data-glass-jelly
      data-glass-light
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-grid-action={dataAction}
      className={`h-12 w-12 sm:w-auto sm:px-4 rounded-full ${toneClassName} flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default`}
      style={{
        borderTop: isDaylight
          ? "1px solid rgba(255,255,255,0.32)"
          : "1px solid rgba(255,255,255,0.22)",
        borderBottom: isDaylight
          ? "1px solid rgba(255,255,255,0.32)"
          : "1px solid rgba(255,255,255,0.22)",
        outline: "1px solid rgba(40,40,40,0.2)",
        boxShadow: "2px 2px 8px 2px rgba(40,40,40,0.4)",
        color: "var(--text-primary)",
      }}
      title={label}
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};
