// shared/modelJson.cjs
// Electron 主进程是 CJS，拿不到 .mjs，所以这份与 modelJson.mjs 逐字对应。
// test/unit/lyrics/modelJson.test.ts 守住两份的行为一致。

/** 去掉 Markdown 代码围栏（```json / ``` 都算），返回里面的内容。 */
const stripCodeFence = (text) => {
    const trimmed = String(text == null ? '' : text).trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }
    // 只吃掉开围栏那一行的语言标记（json、JSON、空）和它后面的空白：{ 可能和它挤在同一行。
    return trimmed.replace(/^```[A-Za-z0-9_-]*[ \t]*\n?/, '').replace(/\n?```\s*$/, '').trim();
};

/**
 * 解析后的值，或 null（不是 JSON、空回答、只有一段解释）。
 * 能解析出 `null` / `false` 这类合法 JSON 时返回的就是它们本身，调用方按需判断类型。
 */
const readJsonText = (raw) => {
    const text = stripCodeFence(raw);
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        // 落到下面：模型在 JSON 前后各写了一句人话。
    }

    const start = text.search(/[{[]/);
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch {
            return null;
        }
    }
    return null;
};

module.exports = { stripCodeFence, readJsonText };
