export type Scope = 'strict' | 'chapter' | 'all';
export type Book = {
    id: string;
    title: string;
    author: string;
    language: string;
    format: string;
    category: string;
    cover: string | null;
    created_at: string;
    total_passages: number;
    progress_seq: number;
    progress_offset: number;
    chapter_id: string | null;
    location: string;
    warning: string;
    percent: number;
};
export type Chapter = {
    id: string;
    book_id: string;
    title: string;
    ordinal: number;
    href: string;
    page: number | null;
};
export type Passage = {
    id: string;
    book_id: string;
    chapter_id: string;
    seq: number;
    ordinal: number;
    text: string;
    location: string;
    page: number | null;
    title?: string;
    book_title?: string;
};
export type Citation = {
    passageId: string;
    quote: string;
    bookId: string;
    bookTitle: string;
    chapterTitle: string;
    location: string;
    seq: number;
    page: number | null;
};
export type Note = {
    id: string;
    book_id: string | null;
    passage_id: string | null;
    kind: string;
    content: string;
    quote: string;
    topic: string;
    created_at: string;
    updated_at: string;
    book_title?: string;
    seq?: number;
};
export type Message = {
    id: string;
    role: string;
    content: string;
    citations: string;
    created_at: string;
    professor: string;
};
export const professors: Record<string, {
    name: string;
    subtitle: string;
    framework: string;
}> = {
    chinese: { name: '中文文学', subtitle: '语言 · 文本 · 传统', framework: '从字词语境、叙事视角、意象、文体与中国文学传统入手，谨慎辨别历史语义。' },
    english: { name: '英美文学', subtitle: '修辞 · 叙事 · 文化', framework: '从英文措辞、修辞、叙事声音、文化语境与文学形式分析。' },
    philosophy: { name: '哲学', subtitle: '概念 · 论证 · 反例', framework: '重构概念定义、论证前提和推理，提出合理反例，区分事实、解释和价值判断。' },
    history: { name: '历史学', subtitle: '史料 · 语境 · 变迁', framework: '分析历史语境、史料局限、时间变化与权力关系，避免以今度古。' },
    art: { name: '艺术史', subtitle: '形式 · 观看 · 图像', framework: '分析视觉形式、观看方式、艺术制度与图像语境，切勿假装看到了未提供的图像。' },
    media: { name: '媒介理论', subtitle: '技术 · 传播 · 感知', framework: '分析媒介物质性、技术条件、传播机制与感知结构，检视技术决定论。' },
    interdisciplinary: { name: '跨学科', subtitle: '关联 · 比较 · 研究', framework: '整合不同学科，明确学科边界与解释局限，提出可检验的跨学科关联。' }
};
export const modes: Record<string, string> = { quick: '快速解释', close: '逐段精读', chapter: '章节讲解', socratic: '苏格拉底讨论', critical: '批判阅读', translate: '双语翻译', question: '阅读提问', research: '跨书研究' };
