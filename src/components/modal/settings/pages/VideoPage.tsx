import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Group, Row, Value, option, type SettingsGroupDef, type SettingsOptionDef } from '../kit';

// src/components/modal/settings/pages/VideoPage.tsx
// 设置里的「视频」分区，只在 Shino 实验室打开「在线视频」后出现。
// 目前是界面骨架：列出「添加在线视频平台」入口与 bilibili 一项，但都不接真实登录或数据。

const PLATFORMS: SettingsGroupDef = { id: 'onlineVideoPlatforms', titleKey: 'options.videoAddPlatform' };

const O = {
    addPlatform: option(PLATFORMS, 'videoAddPlatform', 'options.videoAddPlatform'),
    bilibili: option(PLATFORMS, 'videoPlatformBilibili', 'options.videoPlatformBilibili'),
};

export const OPTIONS: SettingsOptionDef[] = Object.values(O);

const VideoPage: React.FC = () => {
    const { t } = useTranslation();
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
                    <Button disabled onClick={() => undefined}>{t('options.videoPlatformNone')}</Button>
                </Row>
                <Row sub option={O.bilibili} note={t('options.videoPlatformBilibiliDesc')}>
                    <Value>{t('options.videoPlatformBilibiliDesc')}</Value>
                </Row>
            </Group>
        </>
    );
};

export default VideoPage;
