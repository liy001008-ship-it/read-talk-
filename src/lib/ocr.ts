/** OCR adapters run locally/on a user-selected service. No OCR is invoked on import. */
export type OcrPage = {
    page: number;
    text: string;
    language?: string;
    confidence?: number;
};
export interface OcrAdapter {
    readonly name: string;
    recognize(pdf: Uint8Array, pages: number[], signal: AbortSignal): AsyncIterable<OcrPage>;
}
// The reading engine can register an adapter here in a future migration that
// versions passage positions. Never silently replace passages bound to notes.
export class OcrNotConfiguredError extends Error {
    constructor() { super('尚未配置 OCR。扫描 PDF 可查看原版；没有文本层的页面不能进行原文分析。'); }
}
