import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { all, db, dataDir, transaction } from './db';
export const tables = ['books', 'chapters', 'passages', 'reading_progress', 'bookmarks', 'highlights', 'notes', 'concepts', 'book_concepts', 'conversations', 'messages', 'debates', 'debate_turns', 'research_topics', 'research_documents', 'vocabulary', 'analysis_jobs', 'embeddings', 'summaries', 'audio_cache', 'user_viewpoints', 'viewpoint_history', 'reading_history', 'app_settings', 'usage_log'];
export async function createBackup() {
    const zip = new JSZip();
    const snapshot = transaction(() => Object.fromEntries(tables.map(t => [t, all(`SELECT * FROM ${t}`).filter(r => t !== 'app_settings' || r.key !== 'apiKey').map(r => t === 'analysis_jobs' && r.status === 'running' ? { ...r, status: 'paused' } : r)])));
    zip.file('manifest.json', JSON.stringify({ version: 1, createdAt: new Date().toISOString(), tables: snapshot }));
    for (const dir of ['books', 'audio'])
        for (const f of fs.readdirSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dataDir, dir)))
            if (/^[a-f0-9-]+\.(txt|epub|pdf|mp3)$/.test(f))
                zip.file(`${dir}/${f}`, fs.readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dataDir, dir, f)));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
export async function restoreBackup(buffer: Buffer) {
    if (buffer.length > 250 * 1024 * 1024)
        throw new Error('备份包上限 250 MB');
    const zip = await JSZip.loadAsync(buffer);
    let total = 0;
    for (const f of Object.values(zip.files)) {
        total += (f as unknown as {
            _data?: {
                uncompressedSize: number;
            };
        })._data?.uncompressedSize || 0;
    }
    if (total > 600 * 1024 * 1024)
        throw new Error('备份解压大小超限');
    const manifest = zip.file('manifest.json');
    if (!manifest)
        throw new Error('备份缺少清单');
    const parsed = JSON.parse(await manifest.async('string'));
    if (parsed.version !== 1 || !parsed.tables || tables.some(t => !Array.isArray(parsed.tables[t])))
        throw new Error('备份版本或数据结构不兼容');
    const files = new Map<string, Buffer>();
    for (const record of [...parsed.tables.books, ...parsed.tables.audio_cache]) {
        const p = record.file_path;
        if (typeof p !== 'string' || !/^(books\/[a-f0-9-]+\.(epub|txt|pdf)|audio\/[a-f0-9-]+\.mp3)$/.test(p) || !zip.file(p))
            throw new Error('备份文件缺失或路径无效');
        files.set(p, await zip.file(p)!.async('nodebuffer'));
    }
    const rollback = await createBackup();
    fs.writeFileSync(path.join(dataDir, 'backups', `before-restore-${Date.now()}.zip`), rollback, { mode: 0o600 });
    const oldFiles = new Map<string, Buffer | null>();
    try {
        transaction(() => {
            db.exec('PRAGMA defer_foreign_keys=ON');
            for (const t of [...tables].reverse())
                if (t === 'app_settings')
                    db.prepare("DELETE FROM app_settings WHERE key<>'apiKey'").run();
                else
                    db.prepare(`DELETE FROM ${t}`).run();
            for (const t of tables) {
                const columns = all<{
                    name: string;
                }>(`PRAGMA table_info(${t})`).map(c => c.name);
                for (const row of parsed.tables[t]) {
                    if (t === 'app_settings' && row.key === 'apiKey')
                        continue;
                    if (columns.some(k => row[k] === undefined))
                        throw new Error(`备份表 ${t} 字段不完整`);
                    const values = columns.map(k => { const v = row[k]; if (v !== null && typeof v !== 'string' && typeof v !== 'number')
                        throw new Error('备份字段类型错误'); return v; });
                    db.prepare(`INSERT INTO ${t} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...values);
                }
            }
            if (db.prepare('PRAGMA foreign_key_check').all().length)
                throw new Error('备份外键校验失败');
            for (const [p, b] of files) {
                const dest = path.join(dataDir, p);
                oldFiles.set(p, fs.existsSync(dest) ? fs.readFileSync(dest) : null);
                fs.writeFileSync(dest, b, { mode: 0o600 });
            }
        });
    }
    catch (e) {
        for (const [p, b] of oldFiles) {
            const dest = path.join(dataDir, p);
            if (b)
                fs.writeFileSync(dest, b);
            else
                fs.rmSync(dest, { force: true });
        }
        throw e;
    }
}
