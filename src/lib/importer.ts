import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import path from 'node:path';
import fs from 'node:fs';
import { all, one, run, id, hash, transaction, dataDir } from './db';
type ParsedChapter = {
    title: string;
    href: string;
    page: number | null;
    paragraphs: string[];
};
export type ParsedBook = {
    title: string;
    author: string;
    language: string;
    cover: string | null;
    chapters: ParsedChapter[];
    warning: string;
};
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
const arr = <T>(v: T | T[] | undefined): T[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
const str = (v: unknown): string => typeof v === 'object' && v !== null ? str((v as Record<string, unknown>)['#text']) : String(v ?? '');
export function plain(html: string) { return html.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|h[1-6]|li|blockquote|section)>|<br\s*\/?>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim(); }
export function paragraphs(text: string) { const lines = text.replace(/\r\n?/g, '\n').split(/\n\s*\n|\n/).map(s => s.trim()).filter(Boolean); return lines.flatMap(s => { const out: string[] = []; while (s.length > 1800) {
    let at = s.lastIndexOf('。', 1800);
    if (at < 600)
        at = s.lastIndexOf('. ', 1800);
    if (at < 600)
        at = 1800;
    else
        at++;
    out.push(s.slice(0, at));
    s = s.slice(at);
} if (s)
    out.push(s); return out; }); }
export function parseTxt(buffer: Buffer, filename: string): ParsedBook {
    let text = new TextDecoder('utf-8').decode(buffer);
    if ((text.match(/\uFFFD/g) || []).length > 5)
        text = new TextDecoder('gb18030').decode(buffer);
    if (text.startsWith('\uFEFF'))
        text = text.slice(1);
    let title=path.parse(filename).name,author='';
    const header=text.split(/\r?\n/).slice(0,12);
    for(const line of header){const t=line.match(/^\s*书名\s*[:：]\s*(.+)\s*$/);const a=line.match(/^\s*作者\s*[:：]\s*(.+)\s*$/);if(t)title=t[1].trim();if(a)author=a[1].trim();}
    const chapters: ParsedChapter[] = [];
    let current: ParsedChapter = { title: '正文', href: '', page: null, paragraphs: [] };
    for (const [lineIndex,line] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
        const s = line.trim();
        if (!s)
            continue;
        if(lineIndex<12&&(/^(书名|作者)\s*[:：]/.test(s)||(s===title&&lineIndex<2)))continue;
        if (s.length < 100 && /^(第[〇零一二三四五六七八九十百千万\d]+[章节卷部篇回]|chapter\s+[\divxlc]+\b|prologue\b|epilogue\b|序言|前言|后记|序章)/i.test(s)) {
            if (current.paragraphs.length)
                chapters.push(current);
            current = { title: s, href: '', page: null, paragraphs: [] };
        }
        else
            current.paragraphs.push(...paragraphs(s));
    }
    if (current.paragraphs.length)
        chapters.push(current);
    return { title, author, language: /[\u4e00-\u9fff]/.test(text.slice(0, 1000)) ? 'zh' : 'en', cover: null, chapters, warning: '' };
}
export async function parseEpub(buffer: Buffer, filename: string): Promise<ParsedBook> {
    const zip = await JSZip.loadAsync(buffer);
    let expanded = 0;
    for (const entry of Object.values(zip.files)) {
        const size = (entry as unknown as {
            _data?: {
                uncompressedSize: number;
            };
        })._data?.uncompressedSize || 0;
        expanded += size;
        if (expanded > 250 * 1024 * 1024)
            throw new Error('EPUB 解压后超过 250 MB，请拆分文件');
    }
    const container = zip.file('META-INF/container.xml');
    if (!container)
        throw new Error('无效 EPUB：缺少 container.xml');
    const root = arr(xml.parse(await container.async('string')).container?.rootfiles?.rootfile)[0] as Record<string, string> | undefined;
    const opfPath = root?.['@_full-path'];
    if (!opfPath || !zip.file(opfPath))
        throw new Error('无效 EPUB：找不到 OPF');
    const pkg = xml.parse(await zip.file(opfPath)!.async('string')).package;
    const base = path.posix.dirname(opfPath);
    const resolve = (href: string) => path.posix.normalize(path.posix.join(base, decodeURIComponent(href.split('#')[0])));
    const items = arr(pkg.manifest?.item) as Record<string, string>[];
    const map = new Map(items.map(x => [x['@_id'], x]));
    const labels = new Map<string, string>();
    const ncx = items.find(x => x['@_media-type'] === 'application/x-dtbncx+xml');
    if (ncx && zip.file(resolve(ncx['@_href']))) {
        const doc = xml.parse(await zip.file(resolve(ncx['@_href']))!.async('string'));
        const visit = (nodes: unknown) => { for (const n of arr(nodes) as Record<string, any>[]) {
            if (n.content?.['@_src'])
                labels.set(resolve(n.content['@_src']), str(n.navLabel?.text));
            if (n.navPoint)
                visit(n.navPoint);
        } };
        visit(doc.ncx?.navMap?.navPoint);
    }
    const chapters: ParsedChapter[] = [];
    for (const ref of arr(pkg.spine?.itemref) as Record<string, string>[]) {
        const item = map.get(ref['@_idref']);
        if (!item || ref['@_linear'] === 'no')
            continue;
        const p = resolve(item['@_href']);
        const f = zip.file(p);
        if (!f)
            continue;
        const html = await f.async('string');
        const text = plain(html);
        if (!text)
            continue;
        const heading = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
        chapters.push({ title: labels.get(p) || (heading ? plain(heading[1]) : `第 ${chapters.length + 1} 节`), href: p, page: null, paragraphs: paragraphs(text) });
    }
    let cover: string | null = null;
    const coverId = (arr(pkg.metadata?.meta) as Record<string, string>[]).find(x => x['@_name'] === 'cover')?.['@_content'];
    const c = items.find(x => x['@_properties']?.includes('cover-image')) || map.get(coverId || '');
    if (c && /^image\/(jpeg|png|webp|gif)$/.test(c['@_media-type']) && zip.file(resolve(c['@_href']))) {
        const b = await zip.file(resolve(c['@_href']))!.async('nodebuffer');
        if (b.length < 3 * 1024 * 1024)
            cover = `data:${c['@_media-type']};base64,${b.toString('base64')}`;
    }
    return { title: str(arr(pkg.metadata?.title)[0]) || path.parse(filename).name, author: arr(pkg.metadata?.creator).map(str).join('、'), language: str(arr(pkg.metadata?.language)[0]) || 'zh', cover, chapters, warning: '' };
}
export async function parsePdf(buffer: Buffer, filename: string): Promise<ParsedBook> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    const metadata = await doc.getMetadata().catch(() => null);
    const info = (metadata?.info || {}) as Record<string, string>;
    const chapters: ParsedChapter[] = [];
    let empty = 0;
    try {
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            let text = '';
            for (const item of content.items) {
                if ('str' in item)
                    text += item.str + (item.hasEOL ? '\n' : ' ');
            }
            const ps = paragraphs(text);
            if (!ps.length)
                empty++;
            chapters.push({ title: `第 ${i} 页`, href: '', page: i, paragraphs: ps.length ? ps : ['[此页无可提取文本：请使用原版视图。扫描页面需配置 OCR 扩展。]'] });
            page.cleanup();
        }
    }
    finally {
        await doc.destroy();
    }
    return { title: info.Title || path.parse(filename).name, author: info.Author || '', language: 'und', cover: null, chapters, warning: empty ? `${empty} 页没有文本层，尚未配置 OCR；可浏览原始 PDF，无法分析这些扫描页。` : '' };
}
export async function importBook(buffer: Buffer, filename: string) {
    if (buffer.length > 100 * 1024 * 1024)
        throw new Error('单个文件上限为 100 MB');
    const digest = hash(buffer);
    const existing = one<{
        id: string;
        title: string;
    }>('SELECT id,title FROM books WHERE hash=?', digest);
    if (existing)
        return { ...existing, duplicate: true };
    const format = path.extname(filename).slice(1).toLowerCase();
    if (!['txt', 'epub', 'pdf'].includes(format))
        throw new Error('仅支持 EPUB、TXT 和 PDF');
    const parsed = format === 'epub' ? await parseEpub(buffer, filename) : format === 'pdf' ? await parsePdf(buffer, filename) : parseTxt(buffer, filename);
    if (!parsed.chapters.length)
        throw new Error('没有可阅读的正文');
    const bookId = id(), filePath = path.join('books', `${bookId}.${format}`);
    fs.writeFileSync(path.join(dataDir, filePath), buffer, { mode: 0o600 });
    try {
        transaction(() => { run('INSERT INTO books(id,title,author,language,format,cover,hash,file_path,warning) VALUES(?,?,?,?,?,?,?,?,?)', bookId, parsed.title, parsed.author, parsed.language, format, parsed.cover, digest, filePath, parsed.warning); let seq = 0; for (const [ci, c] of parsed.chapters.entries()) {
            const chapterId = id();
            run('INSERT INTO chapters(id,book_id,title,ordinal,href,page) VALUES(?,?,?,?,?,?)', chapterId, bookId, c.title, ci, c.href, c.page);
            for (const [pi, p] of c.paragraphs.entries()) {
                run('INSERT INTO passages(id,book_id,chapter_id,seq,ordinal,text,location,page,hash) VALUES(?,?,?,?,?,?,?,?,?)', id(), bookId, chapterId, seq++, pi, p, format === 'pdf' ? `page:${c.page}:paragraph:${pi + 1}` : `chapter:${ci + 1}:paragraph:${pi + 1}`, c.page, hash(p));
            }
        } run('INSERT INTO reading_progress(book_id,chapter_id) VALUES(?,?)', bookId, one<{
            id: string;
        }>('SELECT id FROM chapters WHERE book_id=? ORDER BY ordinal LIMIT 1', bookId)!.id); });
    }
    catch (e) {
        fs.unlinkSync(path.join(dataDir, filePath));
        throw e;
    }
    return { id: bookId, title: parsed.title, duplicate: false, warning: parsed.warning };
}
export function listBooks() { return all(`SELECT b.*,COALESCE(p.seq,0) progress_seq,COALESCE(p.offset,0) progress_offset,p.chapter_id,COALESCE(p.location,'') location,(SELECT count(*) FROM passages WHERE book_id=b.id) total_passages FROM books b LEFT JOIN reading_progress p ON p.book_id=b.id ORDER BY b.created_at DESC`).map(({ file_path, hash, ...b }) => ({ ...b, percent: Math.round(100 * (Number(b.progress_seq) + (Number(b.progress_offset) > 0 ? 1 : 0)) / Math.max(1, Number(b.total_passages))) })); }
