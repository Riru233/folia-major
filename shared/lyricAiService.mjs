import { sendOpenAICompatibleRequest } from './openAICompatibleRequest.mjs';
import { budgetFor, usesToolBoundary } from './ai/aiTasks.mjs';
import { runAttempts } from './ai/attemptRunner.mjs';
import {
  MAX_ERROR_BODY_CHARS,
  attemptsWithTool,
  buildCompatibleBody,
  exhaustedByReasoning,
  readToolArguments,
  withErrorHint,
} from './ai/compatibleBody.mjs';
import { getAiAdapter, resolveAiConnection } from './ai/providerRegistry.mjs';

// shared/lyricAiService.mjs
// Server-side lyric asks, shared by the Vercel edge handler and the Cloudflare Worker. Those two
// runtimes differ only in where the environment comes from, so they are thin adapters over this
// and the prompt modules rather than a third and fourth copy of the plumbing — which is what the
// theme feature ended up with.
//
// Two asks live here now: word segmentation of the lyric lines, and the reading of the leading
// "song info" rows of a lyric file (karaoke style). The request plumbing — provider choice,
// reasoning suppression ladder, timeout, error text — is the same for both, so it is one runner
// taking a task profile (prompts + schema + budget) instead of two copies drifting apart.
//
// The provider is chosen by whichever key the deployment configured, because unlike the desktop
// build there is no user-facing setting here: the web deployment owns the credentials.

import {
  SEGMENTATION_GEMINI_GENERATION_CONFIG,
  SEGMENTATION_JSON_SCHEMA,
  SEGMENTATION_MAX_OUTPUT_TOKENS,
  SEGMENTATION_SCHEMA_NAME,
  buildSegmentationSourcePrompt,
  buildSegmentationSystemPrompt,
  parseSegmentationResponse,
} from './lyricSegmentationPrompt.mjs';
import {
  KARAOKE_CREDITS_GEMINI_GENERATION_CONFIG,
  KARAOKE_CREDITS_JSON_SCHEMA,
  KARAOKE_CREDITS_MAX_LINES,
  KARAOKE_CREDITS_MAX_OUTPUT_TOKENS,
  KARAOKE_CREDITS_SCHEMA_NAME,
  buildKaraokeCreditsSourcePrompt,
  buildKaraokeCreditsSystemPrompt,
  parseKaraokeCreditsResponse,
} from './karaokeCreditsPrompt.mjs';

const DEFAULT_OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_TEMPERATURE = 0.7;
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// An edge function has its own platform deadline, but a request with no signal can still burn the
// whole budget on one stalled upstream and return nothing useful. Failing at a deadline we chose
// produces an error the caller can show.
const DEFAULT_AI_TIMEOUT_MS = 120_000;

const timeoutSignal = (timeoutMs) => (
  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined
);

const isAbort = (error) => error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/** An address without its credentials and query: what a message may show of it. */
const addressForMessage = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'the AI service';
  }
};

/** Thrown with an HTTP status so both adapters can map failures without re-deriving them. */
export class SegmentationRequestError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'SegmentationRequestError';
    this.status = status;
  }
}

const normalizeOpenAIChatCompletionsUrl = (rawUrl) => {
  const trimmedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmedUrl) {
    return DEFAULT_OPENAI_CHAT_COMPLETIONS_URL;
  }

  try {
    const parsed = new URL(trimmedUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');

    if (!normalizedPath || normalizedPath === '/') {
      parsed.pathname = '/v1/chat/completions';
      return parsed.toString();
    }
    if (/\/v\d+$/.test(normalizedPath)) {
      parsed.pathname = `${normalizedPath}/chat/completions`;
      return parsed.toString();
    }
    parsed.pathname = normalizedPath;
    return parsed.toString();
  } catch {
    return trimmedUrl.replace(/\/+$/, '');
  }
};

const resolveTemperature = (value) => {
  const temperature = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(temperature) && temperature >= 0 && temperature <= 2
    ? temperature
    : DEFAULT_OPENAI_TEMPERATURE;
};

/** The provider's own message out of a raw error body, or the body itself when it is not JSON. */
const errorDetailOf = (rawText) => {
  try {
    const parsed = JSON.parse(rawText);
    const error = parsed && parsed.error;
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
    if (typeof parsed?.message === 'string') return parsed.message;
  } catch {
    // Leave non-JSON responses as-is.
  }
  return rawText.trim();
};

const readErrorDetail = async (response) => errorDetailOf(await response.text());

const extractContentText = (message) => {
  if (!message) return null;
  if (typeof message.refusal === 'string' && message.refusal.trim()) {
    throw new SegmentationRequestError(`Model refused request: ${message.refusal}`, 502);
  }
  // 强制函数调用时答案在 arguments 里（见 buildCompatibleBody 的 tool），content 是空串，
  // 所以先看有没有函数调用。
  const toolArguments = readToolArguments(message);
  if (toolArguments) return toolArguments;
  if (typeof message.content === 'string' && message.content.trim()) return message.content;
  if (Array.isArray(message.content)) {
    const text = message.content
      .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    return text || null;
  }
  return typeof message.content === 'string' ? message.content : null;
};

// `exhausted` is the runner's verdict (exhaustedByReasoning with the adapter, so a provider's own
// words for a cut-off answer count too), the same one it moved down on.
const describeEmpty = (choice, usage, model, exhausted) => {
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
  if (exhausted) {
    const tokens = typeof reasoningTokens === 'number' ? ` (${reasoningTokens} tokens)` : '';
    const finishReason = choice?.finish_reason;
    const how = finishReason && finishReason !== 'length'
      ? `stopped while still reasoning${tokens} (finish_reason: ${finishReason})`
      : `used its entire output budget on reasoning${tokens}`;
    return `Model "${model}" ${how} and returned no answer. Configure a non-reasoning model for this deployment.`;
  }
  return `Model "${model}" returned an empty response`
    + `${choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ''}.`;
};

/**
 * Sends one request, returning the outcome rather than throwing, so the ladder can decide.
 * Mirrors sendOpenAICompatible in electron/aiTextClient.cjs.
 */
const sendOpenAICompatible = async (apiUrl, apiKey, adapter, body, fetchImpl) => {
  let response;
  try {
    response = await sendOpenAICompatibleRequest({
      apiUrl,
      provider: adapter.id,
      rejectsFormat: adapter.rejectedParameter,
      body,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: timeoutSignal(DEFAULT_AI_TIMEOUT_MS),
      },
      fetchImpl,
    });
  } catch (error) {
    if (isAbort(error)) {
      throw new SegmentationRequestError(`Request to ${addressForMessage(apiUrl)} timed out`, 504);
    }
    throw error;
  }

  if (!response.ok) {
    // errorText is for people; errorBody keeps error.param and error.code for the ladder.
    const rawText = await response.text();
    const detail = errorDetailOf(rawText);
    return {
      ok: false,
      status: response.status,
      errorText: `OpenAI compatible API error (${response.status})${detail ? `: ${detail}` : ''}`,
      errorBody: rawText.slice(0, MAX_ERROR_BODY_CHARS),
    };
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  return { ok: true, choice, usage: data.usage, content: extractContentText(choice && choice.message) };
};

/**
 * One ask, as the runner needs it: which task name the adapters switch on, the two prompts, the
 * response schema, and how much room the answer itself needs.
 *
 * @typedef {{
 *   task: 'segmentation' | 'credits',
 *   systemPrompt: string,
 *   sourcePrompt: string,
 *   schema: object,
 *   schemaName: string,
 *   geminiGenerationConfig: object,
 *   maxOutputTokens: number,
 * }} LyricAiTaskProfile
 */

/**
 * Walks the provider adapter's attempts instead of assuming what the deployment configured. The
 * base URL and model are env, so they can name anything: the provider is inferred from the URL's
 * host (only OpenAI-compatible ones here; anything else is the custom adapter, whose attempts are
 * the generic REASONING_SUPPRESSION_ATTEMPTS ladder), and the working shape is discovered and then
 * remembered by the shared runner. See the ladder's definition for the measurements behind it.
 *
 * @param {LyricAiTaskProfile} profile
 */
const runOpenAICompatible = async (profile, env, fetchImpl) => {
  const connection = resolveAiConnection({ ...env, AI_PROVIDER: 'openai' }, { protocols: ['openai'] });
  const adapter = getAiAdapter(connection.adapterId);
  const apiUrl = normalizeOpenAIChatCompletionsUrl(connection.apiUrl);
  const { model } = connection;
  const temperature = resolveTemperature(env.OPENAI_API_TEMPERATURE);
  // 回答是固定几个字段的任务，前面多一级「强制函数调用」：结构由协议钉住，而不是靠提示词求。
  // 端点不认 tools 时会被 400/422 按名字打回，runner 自动退到 adapter 原来的那几级。
  const tool = usesToolBoundary(profile.task) && profile.schema && profile.schemaName
    ? { name: profile.schemaName, description: 'Return the answer as the arguments of this function.', schema: profile.schema }
    : undefined;

  return runAttempts({
    adapter,
    task: profile.task,
    url: apiUrl,
    model,
    attempts: tool ? attemptsWithTool(adapter.attempts(profile.task, model)) : adapter.attempts(profile.task, model),
    describeEmpty: (result) => describeEmpty(result.choice, result.usage, model, result.exhausted),
    fail: (message) => new SegmentationRequestError(message, 502),
    send: async (attempt) => {
      const body = buildCompatibleBody(adapter, {
        task: profile.task,
        model,
        attempt,
        systemPrompt: profile.systemPrompt,
        sourcePrompt: profile.sourcePrompt,
        schema: profile.schema,
        schemaName: profile.schemaName,
        tool,
        budget: budgetFor(profile.task, profile.maxOutputTokens, attempt),
        temperature,
      });
      const result = await sendOpenAICompatible(apiUrl, env.OPENAI_API_KEY, adapter, body, fetchImpl);
      return result.ok ? { ...result, exhausted: exhaustedByReasoning(result.choice, result.usage, adapter) } : withErrorHint(adapter, result);
    },
  });
};

/** @param {LyricAiTaskProfile} profile */
const runGemini = async (profile, env, fetchImpl) => {
  let response;
  try {
    response = await fetchImpl(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: profile.systemPrompt }] },
        contents: [{ parts: [{ text: profile.sourcePrompt }] }],
        generationConfig: profile.geminiGenerationConfig,
      }),
      signal: timeoutSignal(DEFAULT_AI_TIMEOUT_MS),
    });
  } catch (error) {
    if (isAbort(error)) {
      throw new SegmentationRequestError('Request to Gemini timed out', 504);
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new SegmentationRequestError(
      `Gemini API error (${response.status})${detail ? `: ${detail}` : ''}`,
      502,
    );
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const jsonText = Array.isArray(parts)
    ? parts.find((part) => part && typeof part.text === 'string')?.text
    : null;
  if (!jsonText) {
    throw new SegmentationRequestError('Model returned an empty response', 502);
  }
  return jsonText;
};

/**
 * Sends one ask with whichever provider the deployment configured and returns the raw JSON text.
 * Parsing is the caller's: each ask validates against its own contract.
 *
 * @param {LyricAiTaskProfile} profile
 */
const runAiTask = async (profile, env, fetchImpl = fetch) => {
  const preferOpenAI = env.AI_PROVIDER === 'openai' || (!env.GEMINI_API_KEY && env.OPENAI_API_KEY);

  if (preferOpenAI && !env.OPENAI_API_KEY) {
    throw new SegmentationRequestError('OPENAI_API_KEY is not configured', 500);
  }
  if (!preferOpenAI && !env.GEMINI_API_KEY) {
    throw new SegmentationRequestError('GEMINI_API_KEY is not configured', 500);
  }

  return preferOpenAI
    ? runOpenAICompatible(profile, env, fetchImpl)
    : runGemini(profile, env, fetchImpl);
};

/** @param {string[]} lines */
const segmentationProfile = (lines) => ({
  task: 'segmentation',
  systemPrompt: buildSegmentationSystemPrompt(),
  sourcePrompt: buildSegmentationSourcePrompt(lines),
  schema: SEGMENTATION_JSON_SCHEMA,
  schemaName: SEGMENTATION_SCHEMA_NAME,
  geminiGenerationConfig: SEGMENTATION_GEMINI_GENERATION_CONFIG,
  maxOutputTokens: SEGMENTATION_MAX_OUTPUT_TOKENS,
});

/** @param {string[]} lines */
const creditsProfile = (lines) => ({
  task: 'credits',
  systemPrompt: buildKaraokeCreditsSystemPrompt(),
  sourcePrompt: buildKaraokeCreditsSourcePrompt(lines),
  schema: KARAOKE_CREDITS_JSON_SCHEMA,
  schemaName: KARAOKE_CREDITS_SCHEMA_NAME,
  geminiGenerationConfig: KARAOKE_CREDITS_GEMINI_GENERATION_CONFIG,
  maxOutputTokens: KARAOKE_CREDITS_MAX_OUTPUT_TOKENS,
});

/** Guards the request body before any credential or network work happens. */
export const readSegmentationLines = (body) => {
  const lines = body && body.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new SegmentationRequestError('Missing lines', 400);
  }
  if (lines.length > 400) {
    throw new SegmentationRequestError('Too many lines', 400);
  }
  return lines.map((line) => String(line ?? ''));
};

/**
 * Segments the lines with whichever provider the deployment configured. Returns one boundary array
 * per input line, already validated to reproduce the input exactly.
 */
export const segmentLyricLines = async (lines, env, fetchImpl = fetch) => {
  const raw = await runAiTask(segmentationProfile(lines), env, fetchImpl);

  try {
    const { boundaries, rejections } = parseSegmentationResponse(raw, lines);
    if (rejections.length > 0) {
      console.warn(`[segment-lyrics] ${rejections.length}/${lines.length} lines rejected; first: ${rejections[0]}`);
    }
    return boundaries;
  } catch (error) {
    // The response is the only evidence of why a run was rejected, and it is gone once this
    // throws. Server logs are the one place a deployment can see it.
    console.error('[segment-lyrics] rejected model response:', String(raw).slice(0, 4000));
    throw new SegmentationRequestError(error instanceof Error ? error.message : String(error), 502);
  }
};

/** Guards the request body of the credits ask: a handful of leading lines, no more. */
export const readCreditLines = (body) => {
  const lines = body && body.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new SegmentationRequestError('Missing lines', 400);
  }
  if (lines.length > KARAOKE_CREDITS_MAX_LINES) {
    throw new SegmentationRequestError('Too many lines', 400);
  }
  return lines.map((line) => String(line ?? ''));
};

/**
 * Reads the leading song-info rows of a lyric file with whichever provider the deployment
 * configured. Returns the 0-based indexes of those rows plus whatever title / lyricist / composer
 * the model could name; empty strings stand for "not found".
 */
export const detectKaraokeCredits = async (lines, env, fetchImpl = fetch) => {
  const raw = await runAiTask(creditsProfile(lines), env, fetchImpl);

  try {
    return parseKaraokeCreditsResponse(raw, lines);
  } catch (error) {
    console.error('[detect-credits] rejected model response:', String(raw).slice(0, 4000));
    throw new SegmentationRequestError(error instanceof Error ? error.message : String(error), 502);
  }
};
