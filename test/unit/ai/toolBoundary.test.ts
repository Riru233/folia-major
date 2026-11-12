import { describe, expect, it } from 'vitest';
import { usesToolBoundary } from '../../../shared/ai/aiTasks.mjs';
import { runAttempts } from '../../../shared/ai/attemptRunner.mjs';
import {
    TOOL_ATTEMPT,
    attemptsWithTool,
    buildCompatibleBody,
    readToolArguments,
} from '../../../shared/ai/compatibleBody.mjs';
import { openaiAdapter } from '../../../shared/ai/openai.mjs';

// test/unit/ai/toolBoundary.test.ts
// 「回答是固定 JSON」的任务改由强制函数调用兜住结构：请求里带 tools + tool_choice，
// 回答在 tool_calls[0].function.arguments 里；端点不认这两个字段时退回原来的 JSON 模式。
// 这里钉住请求体、回答读取和退回这条链，模型本身不参与。

const TOOL = {
    name: 'lyric_song_credits',
    description: 'Return the answer as the arguments of this function.',
    schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
};

// 请求体的字段随 attempt 而变，测试里按普通对象读就好。
const bodyFor = (attempt: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, any> => buildCompatibleBody(openaiAdapter, {
    task: 'credits',
    model: 'gpt-test',
    attempt: { params: {}, reasoningOff: true, ...attempt },
    systemPrompt: 'system',
    sourcePrompt: 'user',
    schema: TOOL.schema,
    schemaName: TOOL.name,
    tool: TOOL,
    budget: 1024,
    ...extra,
});

describe('usesToolBoundary', () => {
    it('applies to the credits read and nothing else yet', () => {
        expect(usesToolBoundary('credits')).toBe(true);
        expect(usesToolBoundary('segmentation')).toBe(false);
        expect(usesToolBoundary('theme')).toBe(false);
    });
});

describe('attemptsWithTool', () => {
    it('puts the forced call in front of the adapter\'s own rungs, which stay as they were', () => {
        const rungs = openaiAdapter.attempts('credits', 'gpt-test');

        const attempts = attemptsWithTool(rungs);

        expect(attempts[0]).toBe(TOOL_ATTEMPT);
        expect(attempts.slice(1)).toEqual(rungs);
        // 拒绝时按这两个字段的名字判断，所以必须登记在 knobs 里。
        expect([...TOOL_ATTEMPT.knobs]).toEqual(['tools', 'tool_choice']);
    });
});

describe('buildCompatibleBody with a forced call', () => {
    it('sends the schema as the function and forces that call, without a response format', () => {
        const body = bodyFor({ tool: true });

        expect(body.tools).toEqual([{
            type: 'function',
            function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.schema },
        }]);
        expect(body.tool_choice).toEqual({ type: 'function', function: { name: TOOL.name } });
        expect(body.response_format).toBeUndefined();
        // 函数调用的参数是按增量回来的，流式读取器拼不了，所以这一级不流式。
        expect(body.stream).toBeUndefined();
    });

    it('leaves the plain rung alone: response format as before, no tools', () => {
        const body = bodyFor({}, { stream: true });

        expect(body.tools).toBeUndefined();
        expect(body.tool_choice).toBeUndefined();
        expect(body.response_format).toEqual({
            type: 'json_schema',
            json_schema: { name: TOOL.name, strict: true, schema: TOOL.schema },
        });
        expect(body.stream).toBe(true);
    });
});

describe('readToolArguments', () => {
    it('reads the arguments of the first call', () => {
        expect(readToolArguments({
            content: '',
            tool_calls: [
                { function: { name: 'a', arguments: '  ' } },
                { function: { name: 'b', arguments: '{"title":"x"}' } },
            ],
        })).toBe('{"title":"x"}');
    });

    it('reads the singular function_call older endpoints use', () => {
        expect(readToolArguments({ function_call: { name: 'a', arguments: '{"title":"x"}' } }))
            .toBe('{"title":"x"}');
    });

    it('answers null when there is no call to read', () => {
        expect(readToolArguments({ content: '{"title":"x"}' })).toBeNull();
        expect(readToolArguments(null)).toBeNull();
    });
});

describe('a rejected tool request falls back to the plain rung', () => {
    it('moves on when the endpoint names tools as the unsupported parameter', async () => {
        const sent: string[] = [];
        const attempts = attemptsWithTool(openaiAdapter.attempts('credits', 'gpt-test'));

        const text = await runAttempts({
            adapter: openaiAdapter,
            task: 'credits',
            url: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-test',
            attempts: attempts as any,
            cache: null,
            describeEmpty: () => 'empty',
            send: async (attempt: { label: string; tool?: boolean }) => {
                sent.push(attempt.label);
                if (attempt.tool) {
                    return {
                        ok: false,
                        status: 400,
                        errorText: 'OpenAI compatible API error (400): Unsupported parameter: tools',
                        errorBody: '{"error":{"message":"Unsupported parameter: tools","param":"tools"}}',
                    };
                }
                return { ok: true, content: '{"title":"x"}' };
            },
        });

        // 第一个是强制调用，第二个起回到 adapter 自己那套（OpenAI 这里是 reasoning_effort 那一级）。
        expect(sent).toHaveLength(2);
        expect(sent[0]).toBe('tool');
        expect(sent[1]).toBe(openaiAdapter.attempts('credits', 'gpt-test')[0].label);
        expect(text).toBe('{"title":"x"}');
    });
});
