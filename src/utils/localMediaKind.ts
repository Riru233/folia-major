// src/utils/localMediaKind.ts
// 本地曲目「是音频还是视频（MV）」的唯一判定。
//
// 只看扩展名：库里没有别的信息能先验地回答这件事，而导入时也来不及把每个文件都解码一遍。
// mp4 里只有音轨的文件按视频处理也无害——画面那一层没有视频轨时自己会退回原背景。

export const VIDEO_MEDIA_EXTENSIONS = /\.(mp4|mkv)$/i;

/** 这个文件名是不是一条视频曲目（MV）。 */
export const isVideoMediaFileName = (fileName: string): boolean => VIDEO_MEDIA_EXTENSIONS.test(fileName);

/** 写进本地曲目记录的 `mediaKind`：视频记 'video'，音频留空（缺省即音频）。 */
export const resolveLocalMediaKind = (fileName: string): 'video' | undefined => (
    isVideoMediaFileName(fileName) ? 'video' : undefined
);
