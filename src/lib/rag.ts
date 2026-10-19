import { all, one } from './db';
import type { Passage, Scope, Citation } from './types';
export type Boundary = {
    seq: number;
    offset: number;
    chapter_id: string | null;
};
export function permitted(p: Passage, b: Boundary, scope: Scope) {
    if (scope === 'all')
        return p.text;
    if (scope === 'chapter') {
        return p.seq <= b.seq || p.chapter_id === b.chapter_id ? p.text : '';
    }
    if (p.seq < b.seq)
        return p.text;
    if (p.seq === b.seq)
        return p.text.slice(0, Math.max(0, b.offset));
    return '';
}
export function scopeFor(bookId: string): Boundary { return one<Boundary>('SELECT seq,offset,chapter_id FROM reading_progress WHERE book_id=?', bookId) || { seq: 0, offset: 0, chapter_id: null }; }
export function readableSummaries(bookId:string,scope:Scope){
    const visible=allowedPassages(bookId,scope);
    const boundary=scopeFor(bookId);const current=one<{text:string}>('SELECT text FROM passages WHERE book_id=? AND seq=?',bookId,boundary.seq);
    const ceiling=scope==='strict'?boundary.seq-(current&&boundary.offset>=current.text.length?0:1):(visible.at(-1)?.seq??-1);
    return all<{id:string;level:string;content:string;ceiling:number;chapter_id:string|null}>("SELECT id,level,content,ceiling,chapter_id FROM summaries WHERE book_id=? AND ceiling<=? AND level IN ('chapter','book') ORDER BY CASE level WHEN 'book' THEN 0 ELSE 1 END,rowid DESC LIMIT 30",bookId,ceiling).map(s=>{const result=JSON.parse(s.content);return {...s,answer:String(result.answer||''),citations:verifyCitations(result.citations,visible)};});
}
export function allowedPassages(bookId: string, scope: Scope): Passage[] {
    const b = scopeFor(bookId);
    let sql = 'SELECT p.*,c.title,b.title book_title FROM passages p JOIN chapters c ON c.id=p.chapter_id JOIN books b ON b.id=p.book_id WHERE p.book_id=?';
    const params: (string | number | null)[] = [bookId];
    if (scope === 'strict') {
        sql += ' AND p.seq<=?';
        params.push(b.seq);
    }
    else if (scope === 'chapter') {
        sql += ' AND (p.seq<=? OR p.chapter_id=?)';
        params.push(b.seq, b.chapter_id);
    }
    return all<Passage>(sql + ' ORDER BY seq', ...params).map(p => ({ ...p, text: permitted(p, b, scope) })).filter(p => p.text.trim() && !p.text.startsWith('[此页无可提取文本'));
}
export function tokens(query: string) { const words = query.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{1,}/g) || []; return [...new Set(words.flatMap(w => /[\u4e00-\u9fff]/.test(w) && w.length > 3 ? Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2)) : w))].slice(0, 30); }
export function cosine(a: number[], b: number[]) { if (a.length !== b.length)
    return 0; let d = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
} return aa && bb ? d / Math.sqrt(aa * bb) : 0; }
export function retrieve(bookIds: string[], query: string, scope: Scope, limit = 12, queryVector?: number[], model?: string) {
    const words = tokens(query);
    const candidates: {
        p: Passage;
        score: number;
    }[] = [];
    for (const bookId of bookIds) {
        const boundary = scopeFor(bookId);
        const allowed = allowedPassages(bookId, scope);
        let ftsIds = new Set<string>();
        const ftsWords = words.filter(w => w.length >= 3);
        if (ftsWords.length) {
            try {
                ftsIds = new Set(all<{
                    passage_id: string;
                }>('SELECT passage_id FROM passage_fts WHERE passage_fts MATCH ? LIMIT 150', ftsWords.map(w => '"' + w.replace(/"/g, '""') + '"').join(' OR ')).map(r => r.passage_id));
            }
            catch { /* LIKE-style scoring below handles short queries. */ }
        }
        const vectors = queryVector && model ? new Map(all<{
            hash: string;
            vector: string;
        }>('SELECT e.hash,e.vector FROM embeddings e JOIN passages p ON e.hash=p.hash WHERE p.book_id=? AND e.model=?', bookId, model).map(v => [v.hash, JSON.parse(v.vector) as number[]])) : new Map<string, number[]>();
        for (const p of allowed) {
            let score = words.reduce((n, w) => n + (p.text.toLowerCase().includes(w) ? 2 : 0), 0);
            if (ftsIds.has(p.id))
                score += 2;
            // Never use an embedding of the unread suffix of the boundary paragraph.
            const full = p.seq < boundary.seq || scope === 'all' || scope === 'chapter';
            const digest = (p as Passage & {
                hash?: string;
            }).hash;
            const vector = digest && vectors.get(digest);
            if (full && vector && queryVector)
                score += Math.max(0, cosine(queryVector, vector)) * 8;
            if (score > 0)
                candidates.push({ p, score });
        }
    }
    return candidates.sort((a, b) => b.score - a.score || a.p.seq - b.p.seq).slice(0, limit).map(x => x.p);
}
export function verifyCitations(raw: unknown, sources: Passage[]): Citation[] {
    if (!Array.isArray(raw))
        return [];
    return raw.slice(0, 15).flatMap(c => { if (!c || typeof c.passageId !== 'string' || typeof c.quote !== 'string' || !c.quote.trim())
        return []; const p = sources.find(p => p.id === c.passageId); if (!p || !p.text.includes(c.quote))
        return []; return [{ passageId: p.id, quote: c.quote, bookId: p.book_id, bookTitle: p.book_title || '', chapterTitle: p.title || '', location: p.location, seq: p.seq, page: p.page }]; });
}
