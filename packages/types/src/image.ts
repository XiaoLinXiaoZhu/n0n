/**
 * 图片数据类型 — 用于 exec 产出图片等场景
 *
 * 纯数据记录，与传输协议无关。
 * 各 LLM Client 负责将 ImageData 转为对应 provider 的 API 格式。
 */

export type ImageMediaType =
	| "image/png"
	| "image/jpeg"
	| "image/webp"
	| "image/gif";

export interface ImageData {
	/** MIME 类型 */
	mediaType: ImageMediaType;
	/** 原始文件名（不含路径） */
	filename: string;
	/** base64 编码的图片数据 */
	base64: string;
}
