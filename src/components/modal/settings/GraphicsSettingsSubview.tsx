import React, { useState } from "react";
import { Gauge, MonitorCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { Theme, VisualizerFrameRate } from "../../../types";
import { VISUALIZER_FRAME_RATE_OPTIONS } from "../../../utils/frameRateLimiter";
import ThemedDialog from "../../shared/ThemedDialog";
import { SettingsAnchor } from "./navigation/SettingsAnchorContext";
import SettingsSectionHeading from "./navigation/SettingsSectionHeading";
import MotionReductionSettingsSection from "./MotionReductionSettingsSection";
import SettingsRow, { SettingsToggle } from "./SettingsRow";
import { settingsDividerClassFor } from "./settingsCardClasses";
import { useThemeSettingsStore } from "../../../stores/useThemeSettingsStore";
import { usePlayerChromeSettingsStore } from "../../../stores/usePlayerChromeSettingsStore";
import { useVisualizerSettingsStore } from "../../../stores/useVisualizerSettingsStore";
import { useLiquidGlassSettingsStore } from "../../../stores/useLiquidGlassSettingsStore";
import { LIQUID_GLASS_PARAM_BOUNDS } from "../../../mods/liquidglass";
import { isLinuxPlatform, isWindowsPlatform } from "@/utils/platform";

// src/components/modal/settings/GraphicsSettingsSubview.tsx
// Everything that trades picture for smoothness or works around a renderer problem: static mode,
// the home background, native blur, the frame-rate cap, the Linux glow fix and reduced motion.
// Moved out of the lab page, where these sat among unrelated player-chrome switches.

/** Docs page behind the "Fix lyric animation freeze on Linux" switch. */
const CHROMIUM_FD_EXHAUSTION_DOCS_URL =
  "https://folia-site.cielaniska.top/guide/chromium-fd-exhaustion";

// 液态玻璃三个滑杆的步长；量程来自 liquidglass.ts，和钳制逻辑同一份。
const LIQUID_GLASS_SLIDER_STEPS = {
  strength: 0.25,
  blur: 0.5,
  sat: 5,
} as const;

/** On desktop a plain link would open inside the app window; hand it to the system browser instead. */
const openDocsLinkExternally = (event: React.MouseEvent<HTMLAnchorElement>) => {
  if (!window.electron?.openExternalUrl) return;
  event.preventDefault();
  void window.electron.openExternalUrl(event.currentTarget.href);
};

const getFrameRateLabel = (frameRate: VisualizerFrameRate) =>
  `${frameRate} FPS`;

type GraphicsSettingsSubviewProps = {
  isDaylight: boolean;
  settingsCardClass: string;
  toggleOffBackgroundClass: string;
  utilityGhostButtonClass: string;
  rangeInputClass: string;
  theme?: Theme;
};

const GraphicsSettingsSubview: React.FC<GraphicsSettingsSubviewProps> = ({
  isDaylight,
  settingsCardClass,
  toggleOffBackgroundClass,
  utilityGhostButtonClass,
  rangeInputClass,
  theme,
}) => {
  const { t } = useTranslation();
  const [isNativeBlurNoticeOpen, setIsNativeBlurNoticeOpen] = useState(false);
  const {
    disableHomeDynamicBackground,
    staticMode,
    onToggleDisableHomeDynamicBackground,
    onToggleStaticMode,
  } = useThemeSettingsStore(
    useShallow((state) => ({
      disableHomeDynamicBackground: state.disableHomeDynamicBackground,
      staticMode: state.staticMode,
      onToggleDisableHomeDynamicBackground:
        state.handleToggleDisableHomeDynamicBackground,
      onToggleStaticMode: state.handleToggleStaticMode,
    })),
  );
  const enablePlayerPageNativeBlur = usePlayerChromeSettingsStore(
    (state) => state.enablePlayerPageNativeBlur,
  );
  const onTogglePlayerPageNativeBlur = usePlayerChromeSettingsStore(
    (state) => state.handleTogglePlayerPageNativeBlur,
  );
  const visualizerFrameRate = useVisualizerSettingsStore(
    (state) => state.visualizerFrameRate,
  );
  const onVisualizerFrameRateChange = useVisualizerSettingsStore(
    (state) => state.handleSetVisualizerFrameRate,
  );
  const glowBlurQuantize = useVisualizerSettingsStore(
    (state) => state.glowBlurQuantize,
  );
  const onToggleGlowBlurQuantize = useVisualizerSettingsStore(
    (state) => state.handleToggleGlowBlurQuantize,
  );
  const liquidGlassStrength = useLiquidGlassSettingsStore(
    (state) => state.strength,
  );
  const liquidGlassBlur = useLiquidGlassSettingsStore((state) => state.blur);
  const liquidGlassSat = useLiquidGlassSettingsStore((state) => state.sat);
  const onLiquidGlassStrengthChange = useLiquidGlassSettingsStore(
    (state) => state.handleSetLiquidGlassStrength,
  );
  const onLiquidGlassBlurChange = useLiquidGlassSettingsStore(
    (state) => state.handleSetLiquidGlassBlur,
  );
  const onLiquidGlassSatChange = useLiquidGlassSettingsStore(
    (state) => state.handleSetLiquidGlassSat,
  );

  const dividerClass = settingsDividerClassFor(isDaylight);
  const isLinux =
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("linux");
  const isVisualizerFrameRateLimiterEnabled = visualizerFrameRate !== "off";
  const selectedVisualizerFrameRate = isVisualizerFrameRateLimiterEnabled
    ? visualizerFrameRate
    : 120;
  const selectedVisualizerFrameRateIndex =
    VISUALIZER_FRAME_RATE_OPTIONS.indexOf(selectedVisualizerFrameRate);

  const renderToggle = (checked: boolean, onChange: () => void) => (
    <SettingsToggle
      checked={checked}
      onChange={onChange}
      offClass={toggleOffBackgroundClass}
      onColor={theme?.secondaryColor}
    />
  );

  // 液态玻璃的一条参数滑杆：左边是读数，下面是 range；步长与量程调用点各自给。
  const renderLiquidGlassSlider = (
    value: number,
    step: number,
    bounds: { min: number; max: number },
    onChange: (next: number) => void,
    labelKey: string,
    format: (v: number) => string,
  ) => (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        <span className="opacity-60">{t("options.liquidGlassValueLabel")}</span>
        <span className="font-mono opacity-70">{format(value)}</span>
      </div>
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={rangeInputClass}
        aria-label={t(labelKey)}
      />
    </div>
  );

  // Native blur can drop frames on some GPUs, so switching it on goes through a confirmation.
  const handleNativeBlurToggle = () => {
    if (enablePlayerPageNativeBlur) {
      onTogglePlayerPageNativeBlur(false);
      return;
    }
    setIsNativeBlurNoticeOpen(true);
  };

  const confirmNativeBlur = () => {
    onTogglePlayerPageNativeBlur(true);
    setIsNativeBlurNoticeOpen(false);
  };

  const handleFrameRateSliderChange = (value: string) => {
    const nextIndex = Math.min(
      VISUALIZER_FRAME_RATE_OPTIONS.length - 1,
      Math.max(0, Number(value)),
    );
    onVisualizerFrameRateChange(VISUALIZER_FRAME_RATE_OPTIONS[nextIndex]);
  };

  return (
    <div className="space-y-5">
      <SettingsAnchor
        anchorId="graphicsPerformance"
        label={t("options.labPerformanceSection")}
        className="space-y-4"
      >
        <SettingsSectionHeading
          icon={MonitorCog}
          label={t("options.labPerformanceSection")}
        />
        <div
          className={`rounded-xl border overflow-hidden ${settingsCardClass}`}
        >
          <SettingsRow
            title={t("options.enableStaticMode")}
            description={t("options.enableStaticModeDesc")}
            note={t("options.enableStaticModeDescSub")}
            control={renderToggle(staticMode, () =>
              onToggleStaticMode(!staticMode),
            )}
            dividerClass={dividerClass}
          />
          <SettingsRow
            title={t("options.disableHomeDynamicBackground")}
            description={t("options.disableHomeDynamicBackgroundDesc")}
            note={t("options.disableHomeDynamicBackgroundWarning")}
            control={renderToggle(disableHomeDynamicBackground, () =>
              onToggleDisableHomeDynamicBackground(
                !disableHomeDynamicBackground,
              ),
            )}
            dividerClass={dividerClass}
          />
          {!isLinux && (
            <SettingsRow
              title={t("options.enablePlayerPageNativeBlur")}
              description={t("options.enablePlayerPageNativeBlurDesc")}
              control={renderToggle(
                enablePlayerPageNativeBlur,
                handleNativeBlurToggle,
              )}
              dividerClass={dividerClass}
            />
          )}
          <SettingsRow
            title={t("options.visualizerFrameRate")}
            description={t("options.visualizerFrameRateDesc")}
            control={renderToggle(isVisualizerFrameRateLimiterEnabled, () =>
              onVisualizerFrameRateChange(
                isVisualizerFrameRateLimiterEnabled
                  ? "off"
                  : selectedVisualizerFrameRate,
              ),
            )}
            dividerClass={dividerClass}
          >
            <div
              className={`space-y-3 transition-opacity ${isVisualizerFrameRateLimiterEnabled ? "opacity-100" : "opacity-45 pointer-events-none"}`}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                <span className="opacity-60">
                  {t("options.visualizerFrameRateValue")}
                </span>
                <span className="font-mono opacity-70">
                  {getFrameRateLabel(selectedVisualizerFrameRate)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max={VISUALIZER_FRAME_RATE_OPTIONS.length - 1}
                step="1"
                value={Math.max(0, selectedVisualizerFrameRateIndex)}
                onChange={(event) =>
                  handleFrameRateSliderChange(event.target.value)
                }
                className={rangeInputClass}
                aria-label={t("options.visualizerFrameRateValue")}
                disabled={!isVisualizerFrameRateLimiterEnabled}
              />
              <div
                className="grid grid-cols-3 text-[11px] font-mono opacity-50"
                style={{ color: "var(--text-secondary)" }}
              >
                {VISUALIZER_FRAME_RATE_OPTIONS.map((frameRate, index) => (
                  <span
                    key={frameRate}
                    className={
                      index === 1
                        ? "text-center"
                        : index === 2
                          ? "text-right"
                          : ""
                    }
                  >
                    {frameRate}
                  </span>
                ))}
              </div>
            </div>
          </SettingsRow>
          {isLinuxPlatform ? (
            // 识别系统是否linux
            <SettingsRow
              title={t("options.glowBlurQuantize")}
              description={
                <>
                  {t("options.glowBlurQuantizeDesc")}{" "}
                  <a
                    href={CHROMIUM_FD_EXHAUSTION_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={openDocsLinkExternally}
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    {t("options.glowBlurQuantizeDocs")}
                  </a>
                </>
              }
              control={renderToggle(glowBlurQuantize, () =>
                onToggleGlowBlurQuantize(!glowBlurQuantize),
              )}
              dividerClass={dividerClass}
            />
          ) : (
            <></>
          )}
          {isWindowsPlatform ? (
            <SettingsRow
              title={t("options.liquidGlassStrength")}
              description={t("options.liquidGlassStrengthDesc")}
              control={renderLiquidGlassSlider(
                liquidGlassStrength,
                LIQUID_GLASS_SLIDER_STEPS.strength,
                LIQUID_GLASS_PARAM_BOUNDS.strength,
                onLiquidGlassStrengthChange,
                "options.liquidGlassStrength",
                (v) => v.toFixed(2),
              )}
              dividerClass={dividerClass}
            />
          ) : (
            <></>
          )}
          {/* 模糊在所有平台都可调：非 Windows 只是没有扭曲滤镜与饱和度（见 liquidglass.ts）。 */}
          <SettingsRow
            title={t("options.liquidGlassBlur")}
            description={t("options.liquidGlassBlurDesc")}
            control={renderLiquidGlassSlider(
              liquidGlassBlur,
              LIQUID_GLASS_SLIDER_STEPS.blur,
              LIQUID_GLASS_PARAM_BOUNDS.blur,
              onLiquidGlassBlurChange,
              "options.liquidGlassBlur",
              (v) => v.toFixed(1),
            )}
            dividerClass={dividerClass}
            isLast={!isWindowsPlatform}
          />
          {isWindowsPlatform ? (
            <SettingsRow
              title={t("options.liquidGlassSat")}
              description={t("options.liquidGlassSatDesc")}
              control={renderLiquidGlassSlider(
                liquidGlassSat,
                LIQUID_GLASS_SLIDER_STEPS.sat,
                LIQUID_GLASS_PARAM_BOUNDS.sat,
                onLiquidGlassSatChange,
                "options.liquidGlassSat",
                (v) => `${Math.round(v)}%`,
              )}
              dividerClass={dividerClass}
              isLast
            />
          ) : (
            <></>
          )}
        </div>
      </SettingsAnchor>

      <SettingsAnchor
        anchorId="graphicsMotion"
        label={t("options.reduceMotionSection")}
        className="space-y-4"
      >
        <SettingsSectionHeading
          icon={Gauge}
          label={t("options.reduceMotionSection")}
        />
        <MotionReductionSettingsSection
          settingsCardClass={settingsCardClass}
          settingsDividerClass={dividerClass}
          toggleOffBackgroundClass={toggleOffBackgroundClass}
          theme={theme}
        />
      </SettingsAnchor>

      <ThemedDialog
        isOpen={isNativeBlurNoticeOpen}
        onClose={() => setIsNativeBlurNoticeOpen(false)}
        isDaylight={isDaylight}
        title={t("options.nativeBlurConfirmTitle")}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsNativeBlurNoticeOpen(false)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${utilityGhostButtonClass}`}
              style={{ color: "var(--text-primary)" }}
            >
              {t("localMusic.cancel")}
            </button>
            <button
              type="button"
              onClick={confirmNativeBlur}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme?.accentColor || "#3b82f6" }}
            >
              {t("options.nativeBlurConfirmAction")}
            </button>
          </>
        }
      >
        <p
          className="text-sm leading-6 opacity-75"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("options.nativeBlurConfirmDesc")}
        </p>
      </ThemedDialog>
    </div>
  );
};

export default GraphicsSettingsSubview;
