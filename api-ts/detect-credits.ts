import {
    SegmentationRequestError,
    detectKaraokeCredits,
    readCreditLines,
} from '../shared/lyricAiService.mjs';

// 当前文件：Vercel「读歌词开头的歌曲信息」函数的 TypeScript 源文件。
// 和分词那一个端点一样，provider 在 shared/lyricAiService.mjs 内部按部署配置的 env 分支，
// 客户端不需要知道服务端接的是哪家模型。
export const config = {
    runtime: 'edge',
};

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return json({ error: 'Method Not Allowed' }, 405);
    }

    try {
        const lines = readCreditLines(await req.json());
        const credits = await detectKaraokeCredits(lines, process.env);
        return json(credits, 200);
    } catch (error) {
        const status = error instanceof SegmentationRequestError ? error.status : 500;
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error reading song credits:', message);
        return json({ error: message }, status);
    }
}
