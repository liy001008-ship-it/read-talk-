import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { db, all, one, run, dataDir } from '../src/lib/db';
import { parseTxt, parseEpub, parsePdf, importBook } from '../src/lib/importer';
import { permitted, allowedPassages, retrieve, verifyCitations, cosine,readableSummaries } from '../src/lib/rag';
import { saveConfig, publicConfig, config } from '../src/lib/settings';
import { createBackup, restoreBackup } from '../src/lib/backup';
import { GET, POST, PATCH, DELETE } from '../src/app/api/[...path]/route';
import { txtFixture, epubFixture, pdfFixture } from './fixtures';
import type { Passage } from '../src/lib/types';
let bookId = '', passages: Passage[] = [];
async function call(route: string, body?: any, method = 'POST', headers: Record<string, string> = {}) { const url = 'http://127.0.0.1:3000/api/' + route; const req = new NextRequest(url, { method, headers: { host: '127.0.0.1:3000', ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const handler = ({ GET, POST, PATCH, DELETE } as Record<string, typeof GET>)[method]; const response = await handler(req, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) }); return { status: response.status, body: await response.json() }; }
beforeAll(async () => { bookId = (await importBook(Buffer.from(txtFixture), '研究测试.txt')).id; passages = all<Passage>('SELECT * FROM passages WHERE book_id=? ORDER BY seq', bookId); });
describe('real document parsing', () => {
    it('detects Chinese and English TXT chapters', () => { const p = parseTxt(Buffer.from(txtFixture), 'test.txt'); expect(p.chapters).toHaveLength(3); expect(p.chapters[1].title).toContain('未读'); });
    it('parses a complete EPUB ZIP, metadata and spine', async () => { const p = await parseEpub(await epubFixture(), 'test.epub'); expect(p.title).toContain('EPUB fixture'); expect(p.author).toBe('Between Pages Test'); expect(p.chapters).toHaveLength(2); expect(p.chapters[0].href).toBe('OEBPS/one.xhtml'); expect(p.chapters[0].paragraphs.join('')).toContain('Memory'); });
    it('extracts actual PDF pages and text', async () => { const p = await parsePdf(pdfFixture(), 'test.pdf'); expect(p.chapters).toHaveLength(2); expect(p.chapters[0].paragraphs.join('')).toContain('Memory and identity'); expect(p.chapters[1].page).toBe(2); });
    it('detects duplicates without losing progress', async () => { const r = await importBook(Buffer.from(txtFixture), 'renamed.txt'); expect(r.duplicate).toBe(true); expect(r.id).toBe(bookId); });
    it('rejects invalid EPUB files atomically', async () => { await expect(importBook(Buffer.from('not a zip'), 'bad.epub')).rejects.toThrow(); expect(all('PRAGMA foreign_key_check')).toHaveLength(0); });
});
describe('spoiler boundaries and validated evidence', () => {
    it('keeps full-paragraph summaries hidden until the entire boundary is read',()=>{
        const p=passages[0];run('INSERT INTO summaries VALUES(?,?,?,?,?,?)','summary-boundary-test',bookId,p.chapter_id,'chapter',p.seq,JSON.stringify({answer:'测试摘要，不是模型输出',citations:[]}));
        run('UPDATE reading_progress SET seq=0,offset=2 WHERE book_id=?',bookId);
        expect(readableSummaries(bookId,'strict')).toHaveLength(0);
        run('UPDATE reading_progress SET offset=? WHERE book_id=?',p.text.length,bookId);
        expect(readableSummaries(bookId,'strict')).toHaveLength(1);
        run('DELETE FROM summaries WHERE id=?','summary-boundary-test');
    });
    it('cuts within a paragraph, not just the chapter', () => { const p = passages[0]; expect(permitted(p, { seq: 0, offset: 2, chapter_id: p.chapter_id }, 'strict')).toBe(p.text.slice(0, 2)); expect(permitted(passages[2], { seq: 0, offset: 2, chapter_id: p.chapter_id }, 'strict')).toBe(''); });
    it('filters keyword and semantic candidates before ranking', () => { run('UPDATE reading_progress SET seq=0,offset=? WHERE book_id=?', passages[0].text.length, bookId); expect(retrieve([bookId], '秘密结局', 'strict')).toHaveLength(0); expect(retrieve([bookId], '秘密结局', 'all').length).toBeGreaterThan(0); expect(retrieve([bookId], '身份', 'strict')[0].id).toBe(passages[0].id); });
    it('only expands the active chapter on explicit request', () => { expect(allowedPassages(bookId, 'chapter').every(p => p.chapter_id === passages[0].chapter_id)).toBe(true); });
    it('rejects fake quotations, IDs and unread quotes', () => { const sources = allowedPassages(bookId, 'strict'); const quotes = verifyCitations([{ passageId: passages[0].id, quote: '记忆塑造身份' }, { passageId: passages[0].id, quote: '编造的句子' }, { passageId: passages[2].id, quote: '秘密结局' }], sources); expect(quotes).toHaveLength(1); expect(quotes[0].bookId).toBe(bookId); });
    it('handles vectors safely', () => { expect(cosine([1, 0], [1, 0])).toBe(1); expect(cosine([0, 0], [1, 0])).toBe(0); expect(cosine([1], [1, 0])).toBe(0); });
});
describe('local API and persistence', () => {
    it('migrates all required tables and enables foreign keys', () => { expect(one<{
        user_version: number;
    }>('PRAGMA user_version')?.user_version).toBe(1); expect(all("SELECT name FROM sqlite_master WHERE type='table'").length).toBeGreaterThan(25); expect(one<{
        foreign_keys: number;
    }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1); });
    it('persists and restores exact reading progress', async () => { const p = passages[1]; expect((await call(`books/${bookId}/progress`, { passageId: p.id, offset: 5, location: p.location })).status).toBe(200); const r = await call(`books/${bookId}/progress`, undefined, 'GET'); expect(r.body.offset).toBe(5); expect(r.body.seq).toBe(1); });
    it('saves notes, bookmarks, highlights and vocabulary', async () => { const p = passages[0]; for (const [route, payload] of [['notes', { kind: 'user', content: '我的想法', quote: '记忆' }], ['bookmarks', { label: '再读这里' }], ['highlights', { quote: '记忆' }], ['vocabulary', { word: 'memory', meaning: '记忆' }]] as const) {
        const r = await call(route, { bookId, passageId: p.id, ...payload });
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        expect(r.body.id).toBeTruthy();
    } expect(all('SELECT * FROM notes')).toHaveLength(1); });
    it('refuses false note quotations and cross-book associations', async () => { const r = await call('notes', { bookId, passageId: passages[0].id, content: '分析', quote: '不存在的引文' }); expect(r.status).toBe(400); });
    it('keeps viewpoints append-only', async () => { await call('viewpoints', { bookId, topic: '身份', content: '观点 A' }); await call('viewpoints', { bookId, topic: '身份', content: '观点 B' }); const r = await call('viewpoints', undefined, 'GET'); expect(r.body).toHaveLength(2); expect(new Set(r.body.map((v: any) => v.content))).toEqual(new Set(['观点 A', '观点 B'])); });
    it('creates a debate, persists user participation and rejects identical professors', async () => { const r = await call('debates', { bookId, topic: '记忆与身份', a: 'chinese', b: 'philosophy', scope: 'strict' }); expect(r.status, JSON.stringify(r.body)).toBe(200); const user = await call('debates/' + r.body.id, { interjection: '我认为记忆也会变化' }); expect(user.status).toBe(200); expect(all('SELECT * FROM debate_turns')).toHaveLength(1); expect((await call('debates', { bookId, topic: 'test', a: 'art', b: 'art' })).status).toBe(400); });
    it('shows real missing-key errors for AI, speech and indexing', async () => { for (const [route, payload] of [['chat', { bookId, question: '解释身份', scope: 'all' }], ['tts', { text: 'hello', voice: 'nova' }], ['jobs', { bookId, kind: 'embedding', confirmed: true }]] as const) {
        const r = await call(route, payload);
        expect(r.status).toBe(400);
        expect(r.body.error).toContain('API Key');
    } });
    it('prevents cross-origin mutation and DNS rebinding', async () => { expect((await call('settings', {}, 'POST', { origin: 'https://evil.example' })).status).toBe(400); expect((await call('health', undefined, 'GET', { host: 'evil.example' })).status).toBe(400); });
    it('encrypts a key, excludes it from responses and restores configuration', () => { saveConfig({ apiKey: 'test-private-key', maxTokens: 1500 }); expect(publicConfig().hasKey).toBe(true); expect(JSON.stringify(publicConfig())).not.toContain('test-private-key'); expect(one<{
        value: string;
    }>("SELECT value FROM app_settings WHERE key='apiKey'")!.value).not.toContain('test-private-key'); expect(config().apiKey).toBe('test-private-key'); expect(fs.statSync(path.join(dataDir, '.secret-key')).mode & 0o777).toBe(0o600); saveConfig({ clearKey: true }); });
    it('omits saved credentials and encryption keys from a real ZIP backup',async()=>{
        saveConfig({apiKey:'not-a-real-key'});
        try{const JSZip=(await import('jszip')).default;const zip=await JSZip.loadAsync(await createBackup());const manifest=JSON.parse(await zip.file('manifest.json')!.async('string'));expect(manifest.tables.app_settings.some((r:any)=>r.key==='apiKey')).toBe(false);expect(Object.keys(zip.files).some(f=>f.includes('.secret-key'))).toBe(false);}finally{saveConfig({clearKey:true});}
    });
    it('round-trips a complete ZIP backup and restores FTS indexes', async () => { const buffer = await createBackup(); const before = all('SELECT * FROM notes'); run('DELETE FROM notes'); await restoreBackup(buffer); expect(all('SELECT * FROM notes')).toEqual(before); expect(all('PRAGMA foreign_key_check')).toHaveLength(0); expect(retrieve([bookId], '身份', 'all').length).toBeGreaterThan(0); });
    it('does not accept invalid restore files', async () => { await expect(restoreBackup(Buffer.from('bad'))).rejects.toThrow(); expect(all('SELECT * FROM books')).toHaveLength(1); });
    it('supports manual chapter split without invalidating passage IDs', async () => { const p = passages[1]; const r = await call('chapters/' + p.chapter_id, { splitPassageId: p.id, newTitle: '新的小节' }, 'PATCH'); expect(r.status, JSON.stringify(r.body)).toBe(200); expect(one<Passage>('SELECT * FROM passages WHERE id=?', p.id)?.id).toBe(p.id); expect(all('SELECT * FROM chapters WHERE book_id=?', bookId)).toHaveLength(4); });
});
