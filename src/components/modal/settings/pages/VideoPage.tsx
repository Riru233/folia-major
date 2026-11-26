import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Group, Row, Value, option, type SettingsGroupDef, type SettingsOptionDef } from '../kit';
import { useOnlineVideoStore } from '../../../../stores/useOnlineVideoStore';

// src/components/modal/settings/pages/VideoPage.tsx
// 设置里的「视频」分区，只在 Shino 实验室打开「在线视频」后出现。
// 视频源目前只有 bilibili：这里显示它已接入、以及当前登录状态与登录/登出入口。

const PLATFORMS: SettingsGroupDef = { id: 'onlineVideoPlatforms', titleKey: 'options.videoAddPlatform' };

const O = {
    addPlatform: option(PLATFORMS, 'videoAddPlatform', 'options.videoAddPlatform'),
    bilibili: option(PLATFORMS, 'videoPlatformBilibili', 'options.videoPlatformBilibili'),
};

export const OPTIONS: SettingsOptionDef[] = Object.values(O);

const VideoPage: React.FC = () => {
    const { t } = useTranslation();
    const auth = useOnlineVideoStore(state => state.auth);
    const refreshAuth = useOnlineVideoStore(state => state.refreshAuth);
    const signIn = useOnlineVideoStore(state => state.signIn);
    const signOut = useOnlineVideoStore(state => state.signOut);

    useEffect(() => {
        void refreshAuth();
    }, [refreshAuth]);

    const signedIn = auth.state === 'signed-in';
    const status = !auth.available
        ? t('home.videoDesktopOnly')
        : signedIn
            ? t('home.videoAccountLabel', { name: auth.account?.uname ?? '' })
            : t('home.videoNotSignedIn');

    return (
        <>
            <div
                role="note"
                className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--st-line)] bg-[var(--st-fill)] px-3 py-2.5 text-[12px] leading-5 text-[color:var(--st-t2)]"
            >
                <span>{t('options.shinoLabOnlineVideoDesc')}</span>
            </div>
            <Group def={PLATFORMS}>
                <Row option={O.addPlatform} note={t('options.videoAddPlatformDesc')}>
                    <Value>{t('options.videoPlatformAdded', { count: 1 })}</Value>
                </Row>
                <Row sub option={O.bilibili} note={t('options.videoPlatformBilibiliDesc')}>
                    {auth.available && (
                        <Button
                            onClick={() => {
                                if (signedIn) void signOut();
                                else void signIn();
                            }}
                        >
                            {signedIn ? t('home.videoSignOut') : t('home.videoSignIn')}
                        </Button>
                    )}
                    {!auth.available && <Value>{t('home.videoDesktopOnly')}</Value>}
                </Row>
                {auth.available && (
                    <Row sub label={t('home.videoAccountStatus')}>
                        <Value>{status}</Value>
                    </Row>
                )}
            </Group>
        </>
    );
};

export default VideoPage;
