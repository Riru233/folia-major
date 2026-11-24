import React from 'react';
import { LogOut, RefreshCw, Crown, User as UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AudioQualityPreference } from '../../types/onlineMusic';
import type { LibraryAccountController, LibraryAccountSnapshot } from '../../library/core/account/account.contract';
import { useLibraryAccountProviders, useLibraryAccountSelector } from '../../library/core/account/useLibraryAccount';
import { canLogoutProvider } from '../../library/core/account/accountRules';
import { omni } from '../../services/onlineMusic/omni';
import { providerDisplayName } from '../../i18n/providerName';
import { openLoginWindow } from '../login/loginWindowStore';
import { PlatformMark } from '../login/PlatformMark';
import { useKitReducedMotion } from '../modal/settings/kit/motion';
import { Segments } from './shell/Segments';
import { selectDisplaySong, usePlaybackStore } from '../../stores/usePlaybackStore';
import { GroupLine } from './shell/GroupLine';
import { PanelButton } from './shell/PanelButton';
import { PanelIconButton } from './shell/PanelIconButton';
import { PanelRow } from './shell/PanelRow';
import { shortAccountId } from '../../utils/accountIdDisplay';
import { PlaybackSignalPathButton } from '../hifi/PlaybackSignalPathButton';
import { useOnlineVideoStore } from '../../stores/useOnlineVideoStore';

// src/components/panelTab/AccountTab.tsx
// The panel's account tab: who is signed in on the active platform (or that nobody is, or that the
// sign-in ran out, with the way to the home page and its sign-in window), the default audio quality as one row with a pick list, and the
// button that syncs the account's data. The platform, its account and the sign-out come from the
// account controller (library/core/account/providerAccountController.service.ts), which asks first.

interface AccountTabProps {
    /** 在线账户 controller：当前平台、它的账号与登出都经它（与登录窗口同一条路）。 */
    accountController: LibraryAccountController;
    audioQuality: AudioQualityPreference;
    onAudioQualityChange: (quality: AudioQualityPreference) => void;
    onSyncData: () => void;
    isSyncing: boolean;
    onNavigateHome: () => void;
}

const AUDIO_QUALITY_OPTIONS: Array<{
    value: AudioQualityPreference;
    labelKey: string;
}> = [
    { value: 'standard', labelKey: 'account.qualityStandard' },
    { value: 'high', labelKey: 'account.qualityExhigh' },
    { value: 'ultra', labelKey: 'account.qualityUltra' },
    { value: 'lossless', labelKey: 'account.qualityLossless' },
    { value: 'hires', labelKey: 'account.qualityHires' },
];

/** 画质档：UI 骨架阶段先放三档占位，和 bilibili 的 360/720/1080 对齐，不接真实画质切换。 */
const VIDEO_QUALITY_OPTIONS = [
    { value: '360', label: '360P' },
    { value: '720', label: '720P' },
    { value: '1080', label: '1080P' },
] as const;
type VideoQualityValue = typeof VIDEO_QUALITY_OPTIONS[number]['value'];

const selectLogoutPending = (snapshot: LibraryAccountSnapshot) => snapshot.logout.status === 'pending';

const AccountTab: React.FC<AccountTabProps> = ({
    accountController,
    audioQuality,
    onAudioQualityChange,
    onSyncData,
    isSyncing,
    onNavigateHome,
}) => {
    const { t } = useTranslation();
    const reduced = useKitReducedMotion();
    // 同一行按当前播放类型切换：音频是音质档，视频是画质档。画质和在线视频播放器共用一份偏好，
    // 改档会重新解析播放地址，不只是界面上的选中态。
    const song = usePlaybackStore(selectDisplaySong);
    const isVideoPlaying = song?.isVideo === true;
    const videoQuality = String(useOnlineVideoStore(state => state.quality)) as VideoQualityValue;
    const setVideoQuality = (value: VideoQualityValue) => {
        useOnlineVideoStore.getState().setQuality(Number(value) as 360 | 720 | 1080);
    };
    // 当前平台取 controller 快照里回落过的那个，账号是它自己的（不拿别的平台的账号顶上）。
    const { providers, activeProviderId } = useLibraryAccountProviders(accountController);
    const activeSummary = providers.find(provider => provider.providerId === activeProviderId);
    const activeUser = activeSummary?.user || null;
    // 登出按钮只在 controller 会接受时可用（账号已经显示、平台却还没确认登录着的那一会儿不可用），登出进行中同样不可用。
    const logoutPending = useLibraryAccountSelector(accountController, selectLogoutPending);
    const canLogout = !logoutPending && canLogoutProvider(activeSummary);
    // Only the levels the active provider tells apart are offered. The stored preference is one
    // value for every provider: where this one does not list it, the level it stands for here is lit.
    const qualityLevels = omni.getAudioQualityLevels(activeProviderId);
    const qualityOptions = AUDIO_QUALITY_OPTIONS.filter(option => qualityLevels.includes(option.value));
    const litQuality = omni.resolveAudioQuality(activeProviderId, audioQuality);
    // A provider whose sound the preference does not choose now (its own player has its own setting) says where it is set.
    const qualityNoticeKey = omni.audioQualityNoticeKey(activeProviderId);

    const handleLogout = () => accountController.logout(activeProviderId);
    // The sign-in of the platform in use ran out: the account has left, and the row says so.
    const ranOut = !activeUser && activeSummary?.error === 'auth-required';
    // To the home page, with the sign-in window open there: on that platform when its sign-in ran out.
    const signInOnHome = () => {
        openLoginWindow(ranOut ? activeProviderId : null);
        onNavigateHome();
    };

    return (
        <div>
            {activeUser ? (
                <div className="flex min-h-14 items-center gap-3 py-1 pl-1">
                    <span className="relative shrink-0">
                        {activeUser.avatarUrl ? (
                            <img
                                src={activeUser.avatarUrl.replace('http:', 'https:')}
                                className="h-10 w-10 rounded-full bg-[var(--st-fill)] object-cover"
                                alt={activeUser.nickname}
                            />
                        ) : (
                            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--st-fill)] text-[color:var(--st-t3)]">
                                <UserIcon size={18} />
                            </span>
                        )}
                        {/* The platform's mark, on the corner of the picture. */}
                        <span className="absolute -bottom-[3px] -right-[3px] inline-flex rounded-full shadow-[0_0_0_2px_var(--st-win)]">
                            <PlatformMark providerId={activeProviderId} size={16} />
                        </span>
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold leading-5">
                            <span className="truncate">{activeUser.nickname}</span>
                            {Boolean(activeUser.vipType && activeUser.vipType !== 0) && (
                                <Crown size={14} className="shrink-0 text-[color:var(--st-warn)]" />
                            )}
                        </div>
                        <div className="truncate text-xs leading-[18px] text-[color:var(--st-t2)]">
                            {activeSummary ? providerDisplayName(t, activeSummary, activeProviderId) : activeProviderId} · ID: {shortAccountId(String(activeUser.id))}
                        </div>
                    </div>
                    <PanelIconButton label={t('account.logout')} disabled={!canLogout} onClick={() => void handleLogout()}>
                        <LogOut size={17} />
                    </PanelIconButton>
                </div>
            ) : (
                <PanelRow label={ranOut ? t('status.loginExpired') : t('account.guestMode')}>
                    <PanelButton onClick={signInOnHome}>{t('account.loginOnHome')}</PanelButton>
                </PanelRow>
            )}

            <GroupLine />

            {/* 同一个位置按播放类型切换：音频是音质、视频是画质。都走 Segments 的分段布局，
                选中块在同一组里滑动；画质档和在线视频播放器共用同一份偏好。 */}
            <PanelRow label={isVideoPlaying ? t('home.videoQuality') : t('account.audioQuality')}>
                {isVideoPlaying ? (
                    <Segments
                        kind="video"
                        value={videoQuality}
                        options={VIDEO_QUALITY_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
                        onChange={setVideoQuality}
                        size="s"
                    />
                ) : qualityNoticeKey ? (
                    <span className="text-right text-xs leading-[18px] text-[color:var(--st-t2)]">{t(qualityNoticeKey)}</span>
                ) : (
                    <Segments
                        kind="audio"
                        value={litQuality}
                        options={qualityOptions.map(option => ({ value: option.value, label: t(option.labelKey) }))}
                        // 亮着的档就是当前平台已经存着的偏好：选它不改变任何东西，也不能拉低别的平台存的值。
                        onChange={(quality) => { if (quality !== litQuality) onAudioQualityChange(quality); }}
                        size="s"
                    />
                )}
            </PanelRow>

            <PlaybackSignalPathButton />

            {activeUser && (
                <div className="flex px-1 py-2">
                    <PanelButton grow disabled={isSyncing} onClick={onSyncData}>
                        <RefreshCw size={14} className={isSyncing && !reduced ? 'animate-spin' : undefined} />
                        {isSyncing ? t('account.syncing') : t('account.syncData')}
                    </PanelButton>
                </div>
            )}
        </div>
    );
};

export default AccountTab;
