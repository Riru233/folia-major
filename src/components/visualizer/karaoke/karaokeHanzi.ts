import * as OpenCC from 'opencc-js';

// src/components/visualizer/karaoke/karaokeHanzi.ts
// 卡拉OK 的「繁体字形」：把中文歌词换成繁体再显示。不是换字体，是换字——歌词源大多是简体，
// 想看繁体就得先转。opencc-js 仓库里已有（歌词匹配用它做繁转简归一化），这里用的是反方向。
//
// 转换按整句做，不按字块：简繁不是一一对应，「头发」要成「頭髮」、「干杯」要成「乾杯」，
// 只有把整句交给 OpenCC 的词典，它才能按词挑字。所以下面两个函数都作用于整句，
// 分段留给 karaokeSegments 在转换后的文本上做。
//
// 有一条例外是 OpenCC 不做的：「你」在繁体里写成「妳」。那是书写习惯不是字形，词典不会动它，
// 所以转完再强制替换一遍（见 toFeminineYou）。

/**
 * cn → tw（繁体中文，台湾标准字形）。模块级建一次：Converter() 会把词典读进来，
 * 每次渲染都建一遍受不了。用 'tw' 而不是 'twp'：后者还会换词（软件 → 軟體），
 * 歌词要的是字形不是用词。
 */
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

/** 汉字。`\p{Script=Han}` 覆盖扩展 A 到扩展 G 和兼容区，比手写码段稳。 */
const HAN = /\p{Script=Han}/u;
/** 平假名、片假名，以及片假名语音扩展。 */
const KANA = /[\u3040-\u30ff\u31f0-\u31ff\u{1b100}-\u{1b16f}]/u;
/** 谚文（含字母、兼容字母、音节）。 */
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;

/**
 * 这一句是不是中文。日文、韩文里也有汉字，把它们一起转成繁体就成了「日文写成繁体中文」，
 * 比不转更难看，所以只要句子里出现假名或谚文就整句放过。
 */
export const isChineseText = (text: string): boolean => (
    HAN.test(text) && !KANA.test(text) && !HANGUL.test(text)
);

/**
 * 繁体里「你」写成「妳」。OpenCC 的 cn → tw 只管字形，不动这个代词（大陆简体里男女都是「你」），
 * 所以转换之后再补一次强制替换，跟「繁体字形」这套书写习惯对齐。
 */
const toFeminineYou = (text: string): string => text.replace(/你/g, '妳');

/**
 * 一句歌词的显示文字：开了「繁体字形」的中文句子转成繁体，其余原样返回。
 * 只在中文句子上动手，是「仅限中文」这条的落点；标点符号和 ASCII 由 OpenCC 原样保留。
 * 转完再过一遍「你 → 妳」：这一条 OpenCC 不管，得自己补。
 */
export const toTraditionalLyrics = (text: string): string => (
    isChineseText(text) ? toFeminineYou(toTraditional(text)) : text
);
