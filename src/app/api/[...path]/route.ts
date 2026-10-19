import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { db, all, one, run, id, now, hash, dataDir, transaction } from '@/lib/db';
import { importBook, listBooks } from '@/lib/importer';
import { publicConfig, saveConfig, config } from '@/lib/settings';
import { chat, generateAnalysis, queryEmbedding } from '@/lib/ai';
import { allowedPassages, retrieve, scopeFor, verifyCitations,readableSummaries } from '@/lib/rag';
import { startJob, resumeJob, cancelJob, recoverJobs } from '@/lib/jobs';
import { speech } from '@/lib/audio';
import { createBackup, restoreBackup } from '@/lib/backup';
import { professors, type Passage, type Scope } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {
    params: Promise<{
        path: string[];
    }>;
};
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' } });
function guard(req: NextRequest) {
    const host = req.headers.get('host') || '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))
        throw new Error('仅支持本机访问');
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== host)
        throw new Error('拒绝跨站请求');
    if (req.headers.get('sec-fetch-site') === 'cross-site')
        throw new Error('拒绝跨站请求');
}
const safeScope = (s: unknown): Scope => ['strict', 'chapter', 'all'].includes(String(s)) ? s as Scope : 'strict';
function sourcesFor(bookId: string, scope: Scope) { const p = allowedPassages(bookId, scope); return { p, ceiling: Math.max(-1, ...p.map(x => x.seq * 1000000 + x.text.length)) }; }
async function handler(req: NextRequest, ctx: Context) {
    try {
        guard(req);
        const parts = (await ctx.params).path;
        const [resource, key, action] = parts;
        const method = req.method;
        const url = req.nextUrl;
        if (resource === 'health')
            return json({ ok: true, schema: one('PRAGMA user_version') });
        if (resource === 'settings') {
            if (method === 'GET')
                return json(publicConfig());
            const b = await req.json();
            if (key === 'test') {
                const c = config();
                if (!c.apiKey)
                    throw new Error('尚未配置 API Key');
                const response = await fetch(c.baseURL + '/models', { headers: { Authorization: `Bearer ${c.apiKey}` }, signal: AbortSignal.timeout(20000) });
                if (!response.ok)
                    throw new Error(`模型连接失败：HTTP ${response.status}`);
                const models = await response.json();
                return json({ ok: true, models: (models.data || []).map((x: {
                        id: string;
                    }) => x.id) });
            }
            if (method === 'POST')
                return json(saveConfig(b));
        }
        if (resource === 'books') {
            if (method === 'GET' && !key)
                return json(listBooks());
            if (method === 'POST' && !key) {
                if (Number(req.headers.get('content-length') || 0) > 210 * 1024 * 1024)
                    throw new Error('单批文件总量上限 200 MB');
                const form = await req.formData();
                const files = form.getAll('files');
                if (!files.length)
                    throw new Error('请选择文件');
                const results = [];
                for (const f of files) {
                    if (!(f instanceof File))
                        continue;
                    try {
                        results.push({ ...await importBook(Buffer.from(await f.arrayBuffer()), f.name), filename: f.name });
                    }
                    catch (e) {
                        results.push({ filename: f.name, error: e instanceof Error ? e.message : '导入失败' });
                    }
                }
                return json(results);
            }
            const book = one<Record<string, any>>('SELECT * FROM books WHERE id=?', key);
            if (!book)
                return json({ error: '找不到书籍' }, 404);
            if (method === 'GET' && action === 'file') {
                const p = path.resolve(dataDir, book.file_path);
                if (!p.startsWith(dataDir + path.sep))
                    throw new Error('文件路径无效');
                return new NextResponse(fs.readFileSync(p), { headers: { 'Content-Type': book.format === 'pdf' ? 'application/pdf' : book.format === 'epub' ? 'application/epub+zip' : 'text/plain', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
            }
            if (method === 'GET' && action === 'chapters')
                return json(all('SELECT * FROM chapters WHERE book_id=? ORDER BY ordinal', key));
            if (method === 'GET' && action === 'passages') {
                const chapterId = url.searchParams.get('chapter');
                const rows = chapterId ? all('SELECT * FROM passages WHERE book_id=? AND chapter_id=? ORDER BY seq', key, chapterId) : all('SELECT * FROM passages WHERE book_id=? ORDER BY seq LIMIT 100', key);
                return json(rows);
            }
            if (method === 'GET' && action === 'progress')
                return json(one('SELECT * FROM reading_progress WHERE book_id=?', key));
            if (method === 'POST' && action === 'progress') {
                const b = await req.json();
                const p = one<Passage>('SELECT * FROM passages WHERE id=? AND book_id=?', String(b.passageId), key);
                if (!p)
                    throw new Error('阅读位置无效');
                const offset = Math.min(p.text.length, Math.max(0, Number(b.offset) || 0));
                run('UPDATE reading_progress SET seq=?,offset=?,chapter_id=?,location=?,updated_at=? WHERE book_id=?', p.seq, offset, p.chapter_id, typeof b.location === 'string' ? b.location.slice(0, 500) : p.location, now(), key);
                run('INSERT INTO reading_history VALUES(?,?,?,?)', id(), key, p.seq, now());
                return json({ ok: true });
            }
            if (method === 'PATCH') {
                const b = await req.json();
                if (typeof b.category === 'string')
                    run('UPDATE books SET category=? WHERE id=?', b.category.slice(0, 100), key);
                if (typeof b.title === 'string' && b.title.trim())
                    run('UPDATE books SET title=? WHERE id=?', b.title.slice(0, 300), key);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                for (const j of all<{
                    id: string;
                }>("SELECT id FROM analysis_jobs WHERE book_id=? AND status='running'", key))
                    cancelJob(j.id);
                run('DELETE FROM books WHERE id=?', key);
                fs.rmSync(path.join(dataDir, book.file_path), { force: true });
                return json({ ok: true });
            }
        }
        if (resource === 'chapters' && method === 'PATCH') {
            const b = await req.json();
            const c = one<{
                book_id: string;
            }>('SELECT book_id FROM chapters WHERE id=?', key);
            if (!c)
                throw new Error('章节不存在');
            if (b.title)
                run('UPDATE chapters SET title=? WHERE id=?', String(b.title).slice(0, 200), key);
            if (b.splitPassageId) {
                const book = one<{
                    format: string;
                }>('SELECT format FROM books WHERE id=?', c.book_id);
                if (book?.format !== 'txt')
                    throw new Error('仅 TXT 支持手动拆分章节');
                const p = one<Passage>('SELECT * FROM passages WHERE id=? AND chapter_id=?', String(b.splitPassageId), key);
                if (!p || p.ordinal === 0)
                    throw new Error('请选择章节中间的段落拆分');
                transaction(() => { const ch = one<{
                    ordinal: number;
                }>('SELECT ordinal FROM chapters WHERE id=?', key)!; for (const n of all<{
                    id: string;
                    ordinal: number;
                }>('SELECT id,ordinal FROM chapters WHERE book_id=? AND ordinal>? ORDER BY ordinal DESC', c.book_id, ch.ordinal))
                    run('UPDATE chapters SET ordinal=? WHERE id=?', n.ordinal + 1, n.id); const newId = id(); run('INSERT INTO chapters(id,book_id,title,ordinal) VALUES(?,?,?,?)', newId, c.book_id, String(b.newTitle || '新章节'), ch.ordinal + 1); run('UPDATE passages SET chapter_id=?,ordinal=ordinal-? WHERE chapter_id=? AND seq>=?', newId, p.ordinal, key, p.seq); run('UPDATE reading_progress SET chapter_id=(SELECT chapter_id FROM passages WHERE book_id=? AND seq=reading_progress.seq) WHERE book_id=?', c.book_id, c.book_id); });
            }
            return json({ ok: true });
        }
        if (resource === 'search' && method === 'POST') {
            const b = await req.json();
            const bookIds = (Array.isArray(b.bookIds) ? b.bookIds : []).slice(0, 20).map(String);
            let v: number[] | undefined;
            if (b.semantic === true)
                v = await queryEmbedding(String(b.query || ''), req.signal);
            return json(retrieve(bookIds, String(b.query || ''), safeScope(b.scope), 30, v, config().embeddingModel));
        }
        if (resource === 'passages' && method === 'GET') {
            const p = one('SELECT * FROM passages WHERE id=?', key);
            return p ? json(p) : json({ error: '原文已删除' }, 404);
        }
        if(resource==='summaries'&&method==='GET')return json(readableSummaries(url.searchParams.get('book')||'',safeScope(url.searchParams.get('scope'))));
        if (resource === 'chat' && method === 'POST')
            return json(await chat(await req.json(), req.signal));
        if (resource === 'conversations') {
            if (method === 'GET' && !key)
                return json(all('SELECT * FROM conversations WHERE book_id=? ORDER BY created_at DESC', url.searchParams.get('book') || ''));
            if (method === 'GET' && key) {
                const c = one<{
                    book_id: string;
                }>('SELECT book_id FROM conversations WHERE id=?', key);
                if (!c)
                    throw new Error('讨论不存在');
                const { p, ceiling } = sourcesFor(c.book_id, safeScope(url.searchParams.get('scope')));
                return json(all<Record<string, any>>('SELECT * FROM messages WHERE conversation_id=? AND ceiling<=? ORDER BY created_at', key, ceiling).filter(m => { const cs = JSON.parse(m.citations); return verifyCitations(cs, p).length === cs.length; }));
            }
            if (method === 'DELETE') {
                run('DELETE FROM conversations WHERE id=?', key);
                return json({ ok: true });
            }
        }
        if (resource === 'notes') {
            if (method === 'GET')
                return json(all(`SELECT n.*,b.title book_title,p.seq FROM notes n LEFT JOIN books b ON b.id=n.book_id LEFT JOIN passages p ON p.id=n.passage_id ${url.searchParams.get('book') ? 'WHERE n.book_id=?' : ''} ORDER BY n.created_at DESC`, ...(url.searchParams.get('book') ? [url.searchParams.get('book')!] : [])));
            if (method === 'POST') {
                const b = await req.json();
                if (!String(b.content || '').trim())
                    throw new Error('笔记不能为空');
                let quote = String(b.quote || '');
                if (b.passageId) {
                    const p = one<Passage>('SELECT * FROM passages WHERE id=?', String(b.passageId));
                    if (!p || p.book_id !== b.bookId)
                        throw new Error('笔记位置无效');
                    if (quote && !p.text.includes(quote))
                        throw new Error('摘录与原文不匹配');
                }
                else
                    quote = '';
                const noteId = id();
                run('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?)', noteId, b.bookId || null, b.passageId || null, ['user', 'ai', 'external', 'research'].includes(b.kind) ? b.kind : 'user', String(b.content).slice(0, 100000), quote, String(b.topic || '').slice(0, 200), now(), now());
                return json({ id: noteId });
            }
            if (method === 'PATCH') {
                const b = await req.json();
                run('UPDATE notes SET content=?,topic=?,updated_at=? WHERE id=?', String(b.content).slice(0, 100000), String(b.topic || ''), now(), key);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                run('DELETE FROM notes WHERE id=?', key);
                return json({ ok: true });
            }
        }
        if (resource === 'bookmarks' || resource === 'highlights') {
            if (method === 'GET')
                return json(all(`SELECT a.*,p.seq FROM ${resource} a JOIN passages p ON p.id=a.passage_id WHERE a.book_id=? ORDER BY a.created_at DESC`, url.searchParams.get('book') || ''));
            if (method === 'DELETE') {
                run(`DELETE FROM ${resource} WHERE id=?`, key);
                return json({ ok: true });
            }
            if (method === 'POST') {
                const b = await req.json();
                const p = one<Passage>('SELECT * FROM passages WHERE id=? AND book_id=?', String(b.passageId), String(b.bookId));
                if (!p)
                    throw new Error('段落位置无效');
                const itemId = id();
                if (resource === 'bookmarks')
                    run('INSERT INTO bookmarks VALUES(?,?,?,?,?,?)', itemId, p.book_id, p.id, String(b.label || p.text.slice(0, 40)), String(b.location || p.location), now());
                else {
                    if (!p.text.includes(String(b.quote || '')) || !b.quote)
                        throw new Error('高亮摘录无效');
                    run('INSERT INTO highlights VALUES(?,?,?,?,?,?)', itemId, p.book_id, p.id, String(b.quote), 'gold', now());
                }
                return json({ id: itemId });
            }
        }
        if (resource === 'vocabulary') {
            if (method === 'GET')
                return json(all('SELECT v.*,b.title book_title FROM vocabulary v LEFT JOIN books b ON b.id=v.book_id ORDER BY v.created_at DESC'));
            if (method === 'POST') {
                const b = await req.json();
                if (!b.word || !b.meaning)
                    throw new Error('请填写单词和释义');
                const p = b.passageId ? one<Passage>('SELECT * FROM passages WHERE id=?', String(b.passageId)) : undefined;
                if (p && p.book_id !== b.bookId)
                    throw new Error('词汇出处无效');
                const vId = id();
                run('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)', vId, b.bookId || null, b.passageId || null, String(b.word), String(b.meaning), p?.text || String(b.example || ''), String(b.note || ''), now());
                return json({ id: vId });
            }
            if (method === 'PATCH') {
                const b = await req.json();
                run('UPDATE vocabulary SET meaning=?,note=? WHERE id=?', String(b.meaning || ''), String(b.note || ''), key);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                run('DELETE FROM vocabulary WHERE id=?', key);
                return json({ ok: true });
            }
        }
        if (resource === 'jobs') {
            if (method === 'GET') {
                recoverJobs();
                return json(all('SELECT j.*,b.title book_title FROM analysis_jobs j JOIN books b ON b.id=j.book_id ORDER BY j.created_at DESC'));
            }
            const b = await req.json();
            if (method === 'POST' && !key) {
                if (b.confirmed !== true)
                    throw new Error('请先确认付费任务范围和预估成本');
                return json({ id: startJob(String(b.bookId), String(b.kind)) });
            }
            if (method === 'POST' && key) {
                if (b.action === 'pause')
                    cancelJob(key);
                else if (b.action === 'resume')
                    resumeJob(key);
                else
                    throw new Error('任务操作无效');
                return json({ ok: true });
            }
        }
        if (resource === 'debates') {
            if (method === 'GET' && !key)
                return json(all('SELECT * FROM debates WHERE book_id=? ORDER BY created_at DESC', url.searchParams.get('book') || ''));
            if (method === 'POST' && !key) {
                const b = await req.json();
                if (!professors[b.a] || !professors[b.b] || b.a === b.b)
                    throw new Error('请选择两个不同的学科');
                if (!b.topic)
                    throw new Error('请输入讨论主题');
                const debateId = id();
                run('INSERT INTO debates VALUES(?,?,?,?,?,?,?,?)', debateId, String(b.bookId), String(b.topic).slice(0, 2000), b.a, b.b, 'paused', safeScope(b.scope), now());
                return json({ id: debateId });
            }
            if (method === 'DELETE') {
                run('DELETE FROM debates WHERE id=?', key);
                return json({ ok: true });
            }
            const d = one<Record<string, any>>('SELECT * FROM debates WHERE id=?', key);
            if (!d)
                throw new Error('辩论不存在');
            const scope = safeScope(url.searchParams.get('scope') || d.scope);
            const { p, ceiling } = sourcesFor(d.book_id, scope);
            const turns = all<Record<string, any>>('SELECT * FROM debate_turns WHERE debate_id=? AND ceiling<=? ORDER BY created_at', key, ceiling).filter(t => { const cs = JSON.parse(t.citations); return verifyCitations(cs, p).length === cs.length; });
            if (method === 'GET')
                return json({ debate: d, turns });
            if (method === 'POST') {
                const b = await req.json();
                const requestedScope = safeScope(b.scope || d.scope);
                if (requestedScope !== scope)
                    throw new Error('请刷新讨论范围后重试');
                if (b.action === 'pause') {
                    run("UPDATE debates SET status='paused' WHERE id=?", key);
                    return json({ ok: true });
                }
                if (b.interjection) {
                    run('INSERT INTO debate_turns VALUES(?,?,?,?,?,?,?,?)', id(), key, 'user', 'user', String(b.interjection).slice(0, 5000), '[]', ceiling, now());
                    return json({ ok: true });
                }
                let sources = retrieve([d.book_id], d.topic, scope, 10);
                if (!sources.length)
                    sources = p.slice(-8);
                if (!sources.length)
                    throw new Error('当前范围没有已读原文');
                const prior = turns.map(t => `${t.professor}: ${t.content}`).join('\n').slice(-15000);
                const summary = b.action === 'summary';
                const professor = summary ? 'interdisciplinary' : turns.filter(t => t.role === 'assistant').length % 2 === 0 ? d.professor_a : d.professor_b;
                run("UPDATE debates SET status='running' WHERE id=?", key);
                try {
                    const result = await generateAnalysis({ question: `主题：${d.topic}\n此前讨论：${prior}`, professor, mode: 'critical', sources, signal: req.signal, instruction: summary ? '整理双方的证据、共同点、真正分歧、未决问题，不虚构冲突。' : '先重构对方最有力的观点，再以自己的学科框架提出有证据的不同解释或质疑，并回应用户插话。若证据支持一致，说明一致的限度，不为争论制造事实。' });
                    run('INSERT INTO debate_turns VALUES(?,?,?,?,?,?,?,?)', id(), key, 'assistant', professor, result.answer, JSON.stringify(result.citations), ceiling, now());
                    if (summary)
                        run('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?)', id(), d.book_id, null, 'ai', result.answer, '', d.topic, now(), now());
                    return json(result);
                }
                finally {
                    run("UPDATE debates SET status='paused' WHERE id=?", key);
                }
            }
        }
        if (resource === 'research') {
            if (method === 'GET')
                return json(all('SELECT d.*,t.book_ids FROM research_documents d JOIN research_topics t ON t.id=d.topic_id ORDER BY d.updated_at DESC'));
            if (method === 'PATCH') {
                const b = await req.json();
                run('UPDATE research_documents SET content=?,updated_at=? WHERE id=?', String(b.content), now(), key);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                run('DELETE FROM research_documents WHERE id=?', key);
                return json({ ok: true });
            }
            if (method === 'POST') {
                const b = await req.json();
                const bookIds = (b.bookIds || []).slice(0, 12).map(String);
                if (!bookIds.length)
                    throw new Error('请选择研究书籍');
                let vector: number[] | undefined;
                if (b.semantic)
                    vector = await queryEmbedding(String(b.topic), req.signal);
                const scope = safeScope(b.scope);
                const sources = retrieve(bookIds, String(b.topic), scope, 18, vector, config().embeddingModel);
                if (!sources.length)
                    throw new Error('允许范围内没有找到相关段落，请换一个关键词或先阅读更多内容');
                const result = await generateAnalysis({ question: String(b.topic), mode: 'research', professor: 'interdisciplinary', sources, signal: req.signal });
                const topicId = id(), docId = id();
                transaction(() => { run('INSERT INTO research_topics VALUES(?,?,?,?)', topicId, String(b.topic), JSON.stringify(bookIds), now()); run('INSERT INTO research_documents VALUES(?,?,?,?,?,?,?)', docId, topicId, String(b.topic), result.answer, JSON.stringify(result.citations), now(), now()); });
                return json({ id: docId, ...result });
            }
        }
        if (resource === 'viewpoints') {
            if (method === 'GET')
                return json(all('SELECT h.*,v.topic,b.title book_title FROM viewpoint_history h JOIN user_viewpoints v ON v.id=h.viewpoint_id LEFT JOIN books b ON b.id=h.book_id ORDER BY h.created_at DESC'));
            if (method === 'POST') {
                const b = await req.json();
                if (!b.topic || !b.content)
                    throw new Error('请填写问题和个人观点');
                let v = one<{
                    id: string;
                }>('SELECT id FROM user_viewpoints WHERE topic=?', String(b.topic));
                if (!v) {
                    v = { id: id() };
                    run('INSERT INTO user_viewpoints VALUES(?,?,?)', v.id, String(b.topic), now());
                }
                run('INSERT INTO viewpoint_history VALUES(?,?,?,?,?)', id(), v.id, b.bookId || null, String(b.content), now());
                return json({ ok: true });
            }
        }
        if (resource === 'memory' && method === 'POST') {
            const b = await req.json();
            const q = String(b.query || '').toLowerCase();
            const words = q.split(/\s+/).filter(Boolean);
            return json(all('SELECT n.*,b.title book_title,p.seq,p.location FROM notes n LEFT JOIN books b ON b.id=n.book_id LEFT JOIN passages p ON p.id=n.passage_id ORDER BY n.created_at DESC').filter(n => words.some(w => String(n.content).toLowerCase().includes(w) || String(n.topic).toLowerCase().includes(w))).slice(0, 50));
        }
        if (resource === 'profile' && method === 'GET')
            return json({ books: listBooks(), notes: all('SELECT kind,count(*) total FROM notes GROUP BY kind'), concepts: all('SELECT * FROM concepts'), history: all('SELECT h.*,b.title FROM reading_history h JOIN books b ON b.id=h.book_id ORDER BY h.created_at DESC LIMIT 100'), topics: all('SELECT * FROM research_topics ORDER BY created_at DESC'), usage: all('SELECT model,sum(input_tokens) input_tokens,sum(output_tokens) output_tokens,count(*) calls FROM usage_log GROUP BY model') });
        if (resource === 'concepts') {
            if (method === 'POST') {
                const b = await req.json();
                const name = String(b.name || '').trim();
                if (!name)
                    throw new Error('概念不能为空');
                let c = one<{
                    id: string;
                }>('SELECT id FROM concepts WHERE name=?', name);
                if (!c) {
                    c = { id: id() };
                    run('INSERT INTO concepts VALUES(?,?)', c.id, name);
                }
                run('INSERT OR IGNORE INTO book_concepts VALUES(?,?)', String(b.bookId), c.id);
                return json({ ok: true });
            }
            if (method === 'GET')
                return json(all('SELECT c.*,b.title book_title,b.id book_id FROM concepts c JOIN book_concepts bc ON bc.concept_id=c.id JOIN books b ON b.id=bc.book_id'));
        }
        if (resource === 'tts' && method === 'POST') {
            const b = await req.json();
            return json({ id: await speech(String(b.text || ''), String(b.voice || 'nova'), b.passageId || null, req.signal) });
        }
        if (resource === 'audio' && method === 'GET') {
            const c = one<{
                file_path: string;
            }>('SELECT file_path FROM audio_cache WHERE id=?', key);
            if (!c)
                return json({ error: '音频不存在' }, 404);
            return new NextResponse(fs.readFileSync(path.join(dataDir, c.file_path)), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private,max-age=86400' } });
        }
        if (resource === 'pdf-worker' && method === 'GET') {
            const worker = path.join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
            return new NextResponse(fs.readFileSync(worker), { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public,max-age=86400' } });
        }
        if (resource === 'backup') {
            if (method === 'GET')
                return new NextResponse(new Uint8Array(await createBackup()), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="between-pages-${new Date().toISOString().slice(0, 10)}.zip"` } });
            if (method === 'POST') {
                if (all("SELECT id FROM analysis_jobs WHERE status='running'").length)
                    throw new Error('请先暂停所有索引任务再恢复');
                const form = await req.formData();
                const f = form.get('file');
                if (!(f instanceof File))
                    throw new Error('请选择 ZIP 备份');
                await restoreBackup(Buffer.from(await f.arrayBuffer()));
                return json({ ok: true });
            }
        }
        if (resource === 'export' && method === 'GET') {
            const notes = all<Record<string, any>>('SELECT n.*,b.title book_title FROM notes n LEFT JOIN books b ON b.id=n.book_id ORDER BY n.created_at');
            const viewpoints = all('SELECT h.*,v.topic FROM viewpoint_history h JOIN user_viewpoints v ON v.id=h.viewpoint_id ORDER BY h.created_at');
            if (url.searchParams.get('format') === 'md') {
                const content = '# 知间 · 个人学术档案\n\n' + notes.map(n => `## ${n.topic || n.book_title || '笔记'}\n\n来源类型：${n.kind} · ${n.created_at}\n\n${n.quote ? '> ' + n.quote + '\n\n' : ''}${n.content}\n`).join('\n') + '\n## 观点演变\n\n' + viewpoints.map(v => `### ${v.topic} · ${v.created_at}\n\n${v.content}\n`).join('\n');
                return new NextResponse(content, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="between-pages.md"' } });
            }
            return new NextResponse(JSON.stringify({ version: 1, books: listBooks(), notes, viewpoints, research: all('SELECT * FROM research_documents'), vocabulary: all('SELECT * FROM vocabulary'), concepts: all('SELECT * FROM concepts') }, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="between-pages.json"' } });
        }
        return json({ error: '接口不存在' }, 404);
    }
    catch (e) {
        let message = e instanceof Error ? e.message : '操作失败';
        const secret = config().apiKey;
        if (secret)
            message = message.replaceAll(secret, '[redacted]');
        return json({ error: message.slice(0, 600) }, 400);
    }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
