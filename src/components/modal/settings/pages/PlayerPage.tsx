import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { getActiveLibrarySuiteId, isWallLibrarySuite, useActiveLibrarySuiteId } from '../../../../library/app/librarySuiteChoice';
import { PLAYER_CONTROL_SLOT_OPTIONS } from '../../../floating-player/playerControlSlotActions';
import FastColorPicker from '../../../shared/FastColorPicker';
import { useColorPreviewThrottle } from '../../../shared/useColorPreviewThrottle';
import { playerBottomBarLiveOffset } from '../../../../stores/motionSignals';
import { useLatticeSettingsStore } from '../../../../stores/useLatticeSettingsStore';
import { usePlaybackEntryViewStore } from '../../../../stores/usePlaybackEntryViewStore';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { usePlayerBottomBarLayoutStore } from '../../../../stores/usePlayerBottomBarLayoutStore';
import { usePlayerChromeSettingsStore } from '../../../../stores/usePlayerChromeSettingsStore';
import { setStatusMessage } from '../../../../stores/useStatusMessageStore';
import { hasNowPlayingCardSong, useNowPlayingCardLayoutStore } from '../../../app/overlays/now-playing-toast/nowPlayingCardLayoutStore';
import { useStageSettingsStore } from '../../../../stores/useStageSettingsStore';
import { useTypographySettingsStore } from '../../../../stores/useTypographySettingsStore';
import { PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, resolvePlayerBottomBarMaxOffset } from '../../../../utils/playerBottomBarLayout';
import { Button, FoldedGroup, Group, PictureChoice, Reveal, Row, Segmented, Select, Slider, Toggle, Value, option, type SettingsGroupDef, type SettingsOptionDef } from '../kit';
import { EntryViewPicture } from './pictures';
import { useSettingsPage } from './settingsPageContext';

// src/components/modal/settings/pages/PlayerPage.tsx
// The 播放页 page: what the playing screen looks like. Which view play opens and the look of the
// queue collage, the control bar, the now-playing card, the video behind the lyrics, and a folded
// group of switches that hide or pin parts of the player. The card's 在首页显示 switch is not drawn
// while the home screen is a wall (bravais): the card is always on the wall, whatever it says.

const VIEW: SettingsGroupDef = { id: 'playbackEntryView', titleKey: 'options.settingsHeadingView' };
const BAR: SettingsGroupDef = { id: 'bottomUiSettings', titleKey: 'options.settingsHeadingControlBar' };
const CARD: SettingsGroupDef = { id: 'stageTrackPill', titleKey: 'options.stageTrackPill' };
const PLAYER_UI: SettingsGroupDef = { id: 'labPlayerUi', titleKey: 'options.labPlayerUiSection' };

const O = {
    entryView: option(VIEW, 'playbackEntryViewChoice', 'options.playbackEntryView'),
    vignette: option(VIEW, 'latticeSettings', 'options.latticeVignette'),
    tint: option(VIEW, 'latticePosterTint', 'options.latticePosterTint'),
    tintCustomColor: option(VIEW, 'latticePosterTintCustomColor', 'options.latticePosterTintCustomColor'),
    tintColor: option(VIEW, 'latticePosterTintColor', 'options.latticePosterTintColor'),
    tintIntensity: option(VIEW, 'latticePosterTintIntensity', 'options.latticePosterTintIntensity'),
    badgeCurrentOnly: option(VIEW, 'latticeBadgeCurrentOnly', 'options.latticeBadgeCurrentOnly'),
    autoHide: option(BAR, 'autoHidePlayerChrome', 'options.autoHidePlayerChrome'),
    autoHideCursor: option(BAR, 'autoHideCursorWithPlayerChrome', 'options.autoHideCursorWithPlayerChrome'),
    idleCursorHide: option(BAR, 'hideCursorWhenIdle', 'options.hideCursorWhenIdle'),
    barStyle: option(BAR, 'playerBarStyle', 'options.playerBarStyle'),
    barOffset: option(BAR, 'playerBottomBarOffset', 'options.playerBottomBarOffset'),
    barReposition: option(BAR, 'playerBottomBarReposition', 'options.playerBottomBarReposition'),
    controlSlots: option(BAR, 'playerControlSlots', 'options.playerControlSlots'),
    cardMode: option(CARD, 'stageTrackPillMode', 'options.stageTrackPillMode'),
    cardTimeout: option(CARD, 'stageTrackPillTimeout', 'options.stageTrackPillTimeout'),
    cardPosition: option(CARD, 'stageTrackPillReposition', 'options.stageTrackPillReposition'),
    cardOnHome: option(CARD, 'stageTrackPillOnHome', 'options.stageTrackPillOnHome', { available: () => !isWallLibrarySuite(getActiveLibrarySuiteId()) }),
    cardInObs: option(CARD, 'stageTrackPillInObs', 'options.stageTrackPillInObs'),
    cardCloseButton: option(CARD, 'showOpenPanelCloseButton', 'options.showOpenPanelCloseButton'),
    hideProgressBar: option(PLAYER_UI, 'hidePlayerProgressBar', 'options.hidePlayerProgressBar'),
    hideSubtitle: option(PLAYER_UI, 'hidePlayerTranslationSubtitle', 'options.hidePlayerTranslationSubtitle'),
    hidePanelButton: option(PLAYER_UI, 'hidePlayerRightPanelButton', 'options.hidePlayerRightPanelButton'),
    alwaysBackButton: option(PLAYER_UI, 'alwaysShowPlayerBackButton', 'options.alwaysShowPlayerBackButton'),
    alwaysTrackSwitch: option(PLAYER_UI, 'alwaysShowTrackSwitchButtons', 'options.alwaysShowTrackSwitchButtons'),
    // The titlebar it sits behind is only drawn by the desktop window.
    headerBlur: option(PLAYER_UI, 'playerHeaderBlur', 'options.playerHeaderBlur', { electronOnly: true }),
};

export const OPTIONS: SettingsOptionDef[] = Object.values(O);

const percent = (value: number) => `${Math.round(value * 100)}%`;

const PlayerPage: React.FC = () => {
    const { t } = useTranslation();
    const { isElectron } = useSettingsPage();
    const { playbackEntryView, setPlaybackEntryView } = usePlaybackEntryViewStore(useShallow(state => ({
        playbackEntryView: state.playbackEntryView,
        setPlaybackEntryView: state.setPlaybackEntryView,
    })));
    const lattice = useLatticeSettingsStore(useShallow(state => ({
        vignette: state.latticeVignette,
        tintEnabled: state.latticePosterTintEnabled,
        tintUseCustomColor: state.latticePosterTintUseCustomColor,
        tintColor: state.latticePosterTintColor,
        tintIntensity: state.latticePosterTintIntensity,
        badgeCurrentOnly: state.latticeBadgeCurrentOnly,
        setVignette: state.handleToggleLatticeVignette,
        setTintEnabled: state.handleToggleLatticePosterTint,
        setTintUseCustomColor: state.handleToggleLatticePosterTintCustomColor,
        setTintColor: state.handleSetLatticePosterTintColor,
        setTintIntensity: state.handleSetLatticePosterTintIntensity,
        setBadgeCurrentOnly: state.handleToggleLatticeBadgeCurrentOnly,
    })));
    const chrome = usePlayerChromeSettingsStore(useShallow(state => ({
        autoHide: state.autoHidePlayerChrome,
        autoHideCursor: state.autoHideCursorWithPlayerChrome,
        hideCursorWhenIdle: state.hideCursorWhenIdle,
        barStyle: state.playerBarStyle,
        barOffset: state.playerBottomBarOffset,
        slotPrimary: state.playerControlSlotPrimary,
        slotSecondary: state.playerControlSlotSecondary,
        hideProgressBar: state.hidePlayerProgressBar,
        hidePanelButton: state.hidePlayerRightPanelButton,
        alwaysBackButton: state.alwaysShowPlayerBackButton,
        alwaysTrackSwitch: state.alwaysShowTrackSwitchButtons,
        headerBlur: state.playerHeaderBlur,
        cardCloseButton: state.showOpenPanelCloseButton,
        setAutoHide: state.handleToggleAutoHidePlayerChrome,
        setAutoHideCursor: state.handleToggleAutoHideCursorWithPlayerChrome,
        setHideCursorWhenIdle: state.handleToggleHideCursorWhenIdle,
        setBarStyle: state.handleSetPlayerBarStyle,
        setBarOffset: state.handleSetPlayerBottomBarOffset,
        setSlot: state.handleSetPlayerControlSlot,
        setHideProgressBar: state.handleToggleHidePlayerProgressBar,
        setHidePanelButton: state.handleToggleHidePlayerRightPanelButton,
        setAlwaysBackButton: state.handleToggleAlwaysShowPlayerBackButton,
        setAlwaysTrackSwitch: state.handleToggleAlwaysShowTrackSwitchButtons,
        setHeaderBlur: state.handleTogglePlayerHeaderBlur,
        setCardCloseButton: state.handleToggleOpenPanelCloseButton,
    })));
    const card = useStageSettingsStore(useShallow(state => ({
        mode: state.stageTrackPillMode,
        timeoutSec: state.stageTrackPillTimeoutSec,
        onHome: state.stageTrackPillOnHome,
        inObs: state.stageTrackPillInObs,
        setMode: state.handleSetStageTrackPillMode,
        setTimeoutSec: state.handleSetStageTrackPillTimeoutSec,
        setOnHome: state.handleToggleStageTrackPillOnHome,
        setInObs: state.handleToggleStageTrackPillInObs,
    })));
    const hideSubtitle = useTypographySettingsStore(state => state.hidePlayerTranslationSubtitle);
    const setHideSubtitle = useTypographySettingsStore(state => state.handleToggleHidePlayerTranslationSubtitle);
    const hasCurrentSong = usePlaybackStore(state => Boolean(state.currentSong));
    const canPositionCard = usePlaybackStore(hasNowPlayingCardSong);
    const requestCardPosition = useNowPlayingCardLayoutStore(state => state.requestPositioning);
    // Same test App asks the card with (homeIsWall).
    const homeIsWall = isWallLibrarySuite(useActiveLibrarySuiteId());
    const requestPositioning = usePlayerBottomBarLayoutStore(state => state.requestPositioning);
    const tintColorPreview = useColorPreviewThrottle(lattice.setTintColor);

    // The slider's upper end follows the viewport height, also while the settings are open.
    const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight));
    useEffect(() => {
        const syncHeight = () => setViewportHeight(window.innerHeight);
        window.addEventListener('resize', syncHeight);
        return () => window.removeEventListener('resize', syncHeight);
    }, []);
    const maxBarOffset = resolvePlayerBottomBarMaxOffset(viewportHeight);
    // The slider and dragging on the player change the same value, so the live MotionValue gets it
    // too; otherwise the player would not move while the slider does.
    const applyBarOffset = (next: number) => {
        chrome.setBarOffset(next);
        playerBottomBarLiveOffset.set(next);
    };
    const canReposition = hasCurrentSong && !chrome.hideProgressBar;
    const slotOptions = useMemo(
        () => PLAYER_CONTROL_SLOT_OPTIONS.map(slot => ({ value: slot.id, label: t(slot.labelKey) })),
        [t],
    );

    return (
        <>
            <Group def={VIEW}>
                <Row option={O.entryView} hint={t('options.playbackEntryViewDesc')}>
                    <PictureChoice
                        value={playbackEntryView}
                        options={[
                            { value: 'player', label: t('playbackEntryView.player.title'), picture: <EntryViewPicture view="player" /> },
                            { value: 'lattice', label: t('playbackEntryView.lattice.title'), picture: <EntryViewPicture view="lattice" /> },
                            { value: 'stay', label: t('playbackEntryView.stay.title'), picture: <EntryViewPicture view="stay" /> },
                        ]}
                        onChange={setPlaybackEntryView}
                    />
                </Row>
                <Row option={O.vignette} note={t('options.latticeVignetteDesc')}>
                    <Toggle checked={lattice.vignette} onChange={lattice.setVignette} />
                </Row>
                <Row option={O.tint} note={t('options.latticePosterTintDesc')}>
                    <Toggle checked={lattice.tintEnabled} onChange={lattice.setTintEnabled} />
                </Row>
                <Reveal when={lattice.tintEnabled}>
                    <Row sub option={O.tintCustomColor} hint={t('options.latticePosterTintCustomColorDesc')}>
                        <Toggle checked={lattice.tintUseCustomColor} onChange={lattice.setTintUseCustomColor} />
                    </Row>
                    <Reveal when={lattice.tintUseCustomColor}>
                        <Row
                            sub
                            option={O.tintColor}
                            below={(
                                <div onPointerUpCapture={tintColorPreview.flushColor} onPointerCancelCapture={tintColorPreview.flushColor}>
                                    <FastColorPicker color={lattice.tintColor} height={128} onChange={tintColorPreview.previewColor} />
                                </div>
                            )}
                        >
                            <Value>{lattice.tintColor.toUpperCase()}</Value>
                        </Row>
                    </Reveal>
                    <Row sub option={O.tintIntensity}>
                        <Slider value={lattice.tintIntensity} min={0} max={1} step={0.01} onChange={lattice.setTintIntensity} format={percent} />
                    </Row>
                </Reveal>
                <Row option={O.badgeCurrentOnly} note={t('options.latticeBadgeCurrentOnlyDesc')}>
                    <Toggle checked={lattice.badgeCurrentOnly} onChange={lattice.setBadgeCurrentOnly} />
                </Row>
            </Group>

            <Group def={BAR}>
                <Row option={O.barStyle} note={t('options.playerBarStyleDesc')}>
                    <Segmented
                        value={chrome.barStyle}
                        options={[
                            { value: 'floating', label: t('options.playerBarStyle_floating') },
                            { value: 'docked', label: t('options.playerBarStyle_docked') },
                        ]}
                        onChange={next => chrome.setBarStyle(next as 'floating' | 'docked')}
                    />
                </Row>
                <Row option={O.autoHide} note={t('options.autoHidePlayerChromeDesc')}>
                    <Toggle checked={chrome.autoHide} onChange={chrome.setAutoHide} />
                </Row>
                <Reveal when={chrome.autoHide}>
                    <Row sub option={O.autoHideCursor} note={t('options.autoHideCursorWithPlayerChromeDesc')}>
                        <Toggle checked={chrome.autoHideCursor} onChange={chrome.setAutoHideCursor} />
                    </Row>
                </Reveal>
                <Row option={O.idleCursorHide} note={t('options.hideCursorWhenIdleDesc')}>
                    <Toggle checked={chrome.hideCursorWhenIdle} onChange={chrome.setHideCursorWhenIdle} />
                </Row>
                {/* 高度与拖动定位只对浮动胶囊成立：停靠栏贴在窗口底边，没有可抬的基线也没有可拖的位置。 */}
                <Reveal when={chrome.barStyle === 'floating'}>
                    <Row option={O.barOffset} note={t('options.playerBottomBarOffsetDesc')}>
                        <Button
                            icon={RotateCcw}
                            tip={t('options.playerBottomBarReset')}
                            onClick={() => applyBarOffset(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX)}
                            disabled={chrome.barOffset === PLAYER_BOTTOM_BAR_BASE_OFFSET_PX}
                        />
                        <Slider
                            value={chrome.barOffset}
                            min={PLAYER_BOTTOM_BAR_BASE_OFFSET_PX}
                            max={maxBarOffset}
                            onChange={applyBarOffset}
                            format={value => `${value}px`}
                        />
                    </Row>
                    <Row
                        option={O.barReposition}
                        hint={canReposition ? undefined : t('options.playerBottomBarRepositionUnavailable')}
                        onClick={requestPositioning}
                        disabled={!canReposition}
                    />
                </Reveal>
                <Row option={O.controlSlots} note={t('options.playerControlSlotsDesc')}>
                    <Select
                        name={t('options.playerControlSlotPrimary')}
                        value={chrome.slotPrimary}
                        options={slotOptions}
                        onChange={next => chrome.setSlot('primary', next)}
                    />
                    <Select
                        name={t('options.playerControlSlotSecondary')}
                        value={chrome.slotSecondary}
                        options={slotOptions}
                        onChange={next => chrome.setSlot('secondary', next)}
                    />
                </Row>
            </Group>

            <Group def={CARD}>
                <Row
                    option={O.cardPosition}
                    hint={canPositionCard ? undefined : t('options.stageTrackPillRepositionUnavailable')}
                    onClick={requestCardPosition}
                    disabled={!canPositionCard}
                />
                <Row option={O.cardMode} note={t('options.stageTrackPillDesc')}>
                    <Segmented
                        value={card.mode}
                        options={[
                            { value: 'auto', label: t('options.stageTrackPillMode_auto') },
                            { value: 'always', label: t('options.stageTrackPillMode_always') },
                            { value: 'never', label: t('options.stageTrackPillMode_never') },
                        ]}
                        onChange={card.setMode}
                    />
                </Row>
                <Reveal when={card.mode === 'auto'}>
                    <Row sub option={O.cardTimeout}>
                        <Slider value={card.timeoutSec} min={3} max={60} onChange={card.setTimeoutSec} format={value => `${value}s`} />
                    </Row>
                </Reveal>
                {!homeIsWall && (
                    <Reveal when={card.mode !== 'never'}>
                        <Row option={O.cardOnHome} note={t('options.stageTrackPillOnHomeDesc')}>
                            <Toggle checked={card.onHome} onChange={card.setOnHome} />
                        </Row>
                    </Reveal>
                )}
                <Reveal when={card.mode !== 'never'}>
                    <Row option={O.cardInObs} note={t('options.stageTrackPillInObsDesc')}>
                        <Toggle checked={card.inObs} onChange={card.setInObs} />
                    </Row>
                </Reveal>
                <Row option={O.cardCloseButton} hint={t('options.showOpenPanelCloseButtonDesc')}>
                    <Toggle checked={chrome.cardCloseButton} onChange={chrome.setCardCloseButton} />
                </Row>
            </Group>

            <FoldedGroup def={PLAYER_UI}>
                <Row option={O.hideProgressBar} note={t('options.labHidePlayerUiDesc')}>
                    <Toggle checked={chrome.hideProgressBar} onChange={chrome.setHideProgressBar} />
                </Row>
                <Row option={O.hideSubtitle} hint={t('options.hidePlayerTranslationSubtitleDesc')}>
                    <Toggle checked={hideSubtitle} onChange={setHideSubtitle} />
                </Row>
                <Row option={O.hidePanelButton}>
                    <Toggle checked={chrome.hidePanelButton} onChange={chrome.setHidePanelButton} />
                </Row>
                <Row option={O.alwaysBackButton} hint={t('options.alwaysShowPlayerBackButtonDesc')}>
                    <Toggle checked={chrome.alwaysBackButton} onChange={chrome.setAlwaysBackButton} />
                </Row>
                <Row option={O.alwaysTrackSwitch} note={t('options.alwaysShowTrackSwitchButtonsDesc')}>
                    <Toggle checked={chrome.alwaysTrackSwitch} onChange={chrome.setAlwaysTrackSwitch} />
                </Row>
                {isElectron && (
                    <Row option={O.headerBlur} hint={t('options.playerHeaderBlurDesc')}>
                        <Toggle checked={chrome.headerBlur} onChange={chrome.setHeaderBlur} />
                    </Row>
                )}
            </FoldedGroup>
        </>
    );
};

export default PlayerPage;
