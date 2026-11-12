// src/utils/localMediaKind.ts
// 本地曲目「是音频还是视频（MV）」的唯一判定。
//
// 只看扩展名：库里没有别的信息能先验地回答这件事，而导入时也来不及把每个文件都解码一遍。
// 视频容器能不能进曲库还受 Shino 实验室「视频播放」开关控制，见 isImportableVideoFileName。
// 按视频标记、实际却没有视频轨的文件（只有音轨的 mp4）也无害：画面那一层在元数据到手时
// 会发现 videoWidth === 0，自己退回原来的背景（见 VideoLayer 的 degradeToSettings）。

/** 浏览器自己就能解的容器：mp4（H.264/AAC）。 */
export const BROWSER_VIDEO_EXTENSIONS = /\.mp4$/i;
/** 容器要主进程的 FFmpeg 转封装/转码才拿得到音轨的：mkv。 */
export const ELECTRON_VIDEO_EXTENSIONS = /\.mkv$/i;

/** 所有按「视频曲目」对待的容器（判断一条记录是不是 MV 时用这个，不看运行时能力）。 */
export const VIDEO_MEDIA_EXTENSIONS = /\.(mp4|mkv)$/i;

/** 这个文件名是不是一条视频曲目（MV）。 */
export const isVideoMediaFileName = (fileName: string): boolean => VIDEO_MEDIA_EXTENSIONS.test(fileName);

/** 写进本地曲目记录的 `mediaKind`：视频记 'video'，音频留空（缺省即音频）。 */
export const resolveLocalMediaKind = (fileName: string): 'video' | undefined => (
    isVideoMediaFileName(fileName) ? 'video' : undefined
);

/**
 * 视频容器算不算「可以进曲库的媒体」。mp4/mkv 是 Shino 实验室「视频播放」带来的能力：
 * 实验关着时本地曲库根本不识别它们，打开后才导入；mkv 还额外要求主进程转码回退可用。
 * 做成纯函数，扫描/导入的服务层不必为了一个扩展名判断去碰 React 或 zustand。
 */
export const isImportableVideoFileName = (
    fileName: string,
    flags: { videoPlaybackEnabled: boolean; canTranscodeFallback: boolean },
): boolean => {
    if (!flags.videoPlaybackEnabled) return false;
    if (BROWSER_VIDEO_EXTENSIONS.test(fileName)) return true;
    return flags.canTranscodeFallback && ELECTRON_VIDEO_EXTENSIONS.test(fileName);
};
