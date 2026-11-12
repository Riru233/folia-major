import {
    SegmentationRequestError,
    detectKaraokeCredits,
    readCreditLines,
} from '../shared/lyricAiService.mjs';

// worker/detect-credits.ts
// Cloudflare Worker adapter for the 「读歌词开头的歌曲信息」ask. Identical in behaviour to the
// Vercel handler; the only difference is that env arrives as an argument instead of on process.env.

export type DetectCreditsEnv = {
    AI_PROVIDER?: string;
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    OPENAI_API_URL?: string;
    OPENAI_API_MODEL?: string;
    OPENAI_API_TEMPERATURE?: string;
};

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export async function handleDetectCredits(request: Request, env: DetectCreditsEnv): Promise<Response> {
    if (request.method !== 'POST') {
        return json({ error: 'Method Not Allowed' }, 405);
    }

    try {
        const lines = readCreditLines(await request.json());
        const credits = await detectKaraokeCredits(lines, env);
        return json(credits, 200);
    } catch (error) {
        const status = error instanceof SegmentationRequestError ? error.status : 500;
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('[worker] detect-credits failed:', message);
        return json({ error: message }, status);
    }
}
