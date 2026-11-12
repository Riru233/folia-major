// shared/ai/aiTasks.mjs
// The AI asks and their output-token budgets: room for the answer, plus room for reasoning
// whenever an attempt does not expect reasoning to be switched off.

/** @typedef {'segmentation' | 'theme' | 'test' | 'credits'} AiTask */

/** @type {readonly AiTask[]} */
export const AI_TASKS = Object.freeze(['segmentation', 'theme', 'test', 'credits']);

// Reasoning room on top of the answer when thinking cannot be switched off, or only turned down.
// Segmentation 8192 + 24576 = 32768, the same as the old ladder's x4 last rung; theme 8192 + 16384
// is about OpenAI's suggested 25k starting point for reasoning models; test 512 + 3584 = 4096.
// credits answers a few lines of JSON, so it takes the same small allowance as the test ask.
export const REASONING_ALLOWANCE = Object.freeze({ segmentation: 24576, theme: 16384, test: 3584, credits: 3584 });

/**
 * Tasks whose answer is a small fixed JSON object and is better enforced by the protocol than asked
 * for in the prompt: the first attempt forces a function call whose schema is the answer shape, and
 * an endpoint that refuses `tools` falls back to plain JSON mode. Credits first, because a fenced or
 * annotated answer there is pure noise ("```json { ... }```" is not valid JSON); the other tasks
 * still depend on the prompt and the parser.
 *
 * @type {readonly AiTask[]}
 */
export const TOOL_BOUND_TASKS = Object.freeze(['credits']);

/** @param {AiTask} task */
export const usesToolBoundary = (task) => TOOL_BOUND_TASKS.includes(task);

/**
 * Output-token cap for one attempt, or undefined for "send no cap". An attempt says through
 * `reasoningOff` whether the model is expected to think.
 *
 * @param {AiTask} task
 * @param {number | undefined} answerTokens what the answer itself needs; falsy sends no cap
 * @param {{ reasoningOff: boolean }} attempt
 * @returns {number | undefined}
 */
export const budgetFor = (task, answerTokens, attempt) => {
    if (!answerTokens) {
        return undefined;
    }
    return answerTokens + (attempt.reasoningOff ? 0 : (REASONING_ALLOWANCE[task] ?? 0));
};
