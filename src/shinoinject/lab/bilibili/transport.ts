import type { BilibiliBridgeResponse } from '../../../types/bilibili';

// src/shinoinject/lab/bilibili/transport.ts
// 一次 bilibili 请求该从哪儿出去。
//
// 浏览器版没有可能：api.bilibili.com 不给任意来源 CORS 头，直连一定被拦下。桌面版走主进程
// （electron/bilibili.cjs）：那边用的是带 cookies 的独立 session，能补 Referer、能带登录态，
// 而且视频直链需要的 Referer 也在主进程的 webRequest 里补上了。
//
// 这层只负责「把请求发出去、把响应文本拿回来」，解析和业务判定在 api.ts。

export interface BilibiliTransportResponse {
    ok: boolean;
    status: number;
    bodyText: string;
}

/** 网页版的失败标记：调用方据此说「仅桌面版」，而不是把跨域错误当成网络故障。 */
export const DESKTOP_ONLY_CODE = -2;
const DESKTOP_UNAVAILABLE = 'bilibili requests need the desktop app';

export const isBilibiliAvailable = (): boolean => Boolean(
    typeof window !== 'undefined' && window.electron?.bilibili,
);

export const requestBilibiliUrl = async (
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<BilibiliTransportResponse> => {
    const bridge = typeof window === 'undefined' ? undefined : window.electron?.bilibili;
    if (bridge) {
        return bridge.request({ url, ...init }) as Promise<BilibiliBridgeResponse>;
    }

    // 网页版：试着直连，失败时把话说清楚，不要把一个跨域错误伪装成「没找到 MV」。
    try {
        const response = await fetch(url, {
            method: init.method ?? 'GET',
            body: init.body,
            headers: init.headers,
            credentials: 'include',
            mode: 'cors',
        });
        return { ok: response.ok, status: response.status, bodyText: await response.text() };
    } catch (error) {
        console.warn('[Bilibili] Direct request blocked:', error);
        return {
            ok: false,
            status: 0,
            bodyText: JSON.stringify({ code: DESKTOP_ONLY_CODE, message: DESKTOP_UNAVAILABLE }),
        };
    }
};
