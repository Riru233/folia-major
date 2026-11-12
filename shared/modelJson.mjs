// shared/modelJson.mjs
// 从模型回答里取出 JSON。这件事原先散在几个提示词模块里各写一份，写法和容忍度都不一样：
// 分词那份会拆 ``` 围栏，歌曲信息那份直接 JSON.parse，于是模型一旦把答案包进 Markdown 代码块
// （不少兼容端点会无视 response_format 这么做），用户看到的就是
// `Unexpected token '`', "```json { "... is not valid JSON`。
//
// 所以统一放这里：先拆围栏，还不行就从第一个 { / [ 取到最后一个 } / ]，把「这是 JSON，前面那句
// 解释别管」这种常见输出也接住。取不出来返回 null，由各调用方用自己的措辞报错。
// （分词那份在 lyricSegmentationPrompt 里还有一份等价的 stripCodeFence，它只拆围栏，先不动它。）

/** 去掉 Markdown 代码围栏（```json / ``` 都算），返回里面的内容。 */
export const stripCodeFence = (text) => {
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
export const readJsonText = (raw) => {
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
