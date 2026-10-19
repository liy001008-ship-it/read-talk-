'use client';
import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/client';
import type { Book } from '@/lib/types';
import { Modal, Busy } from './ui';
export default function Settings({ books, onClose, notify, onChange }: {
    books: Book[];
    onClose: () => void;
    notify: (s: string) => void;
    onChange: () => void;
}) {
    const [settings, setSettings] = useState<any>(null);
    const [key, setKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [models, setModels] = useState<string[]>([]);
    const [jobs, setJobs] = useState<any[]>([]);
    const restore = useRef<HTMLInputElement>(null);
    const [indexBook, setIndexBook] = useState(books[0]?.id || '');
    async function refresh() { setJobs(await api('jobs')); }
    useEffect(() => { void api('settings').then(setSettings).catch(e => notify(e.message)); void refresh(); const timer = setInterval(() => { void refresh(); }, 3000); return () => clearInterval(timer); }, []);
    async function save() { setBusy(true); try {
        const result = await api('settings', { ...settings, apiKey: key });
        setSettings(result);
        setKey('');
        notify('设置已安全保存');
        onChange();
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function index(kind: string) { const book = books.find(b => b.id === indexBook); if (!book)
        return; const tokens = book.total_passages * 450; const price = (tokens / 1000000) * Number(settings.inputPrice || 0); if (!confirm(`将处理《${book.title}》全书（包括未读内容），但不会自动展示或扩大 AI 防剧透范围。\n约 ${book.total_passages} 个段落，粗估 ${tokens.toLocaleString()} 输入 tokens。${price ? `按自填费率约 $${price.toFixed(4)}，另有输出费用。` : '未填写模型费率，无法估价；请查看服务商价格。'}\n这是粗估，实际分词与费用以服务商账单为准。任务可暂停、重试与续跑。确认启动付费任务？`))
        return; try {
        await api('jobs', { bookId: indexBook, kind, confirmed: true });
        await refresh();
        notify('后台任务已启动，阅读不受影响');
    }
    catch (e) {
        notify((e as Error).message);
    } }
    const field = (name: string, label: string, type = 'text') => <label className="field" key={name}>{label}<input type={type} list={name === 'chatModel' ? 'models' : undefined} value={settings[name]} onChange={e => setSettings({ ...settings, [name]: e.target.value })}/></label>;
    return <Modal title="阅读与模型设置" kicker="MAKE IT YOURS" onClose={onClose}>{!settings ? <Busy /> : <><div className="section-label">模型连接</div><p className="muted">密钥保存在本机服务端，以 AES-256-GCM 加密。保存后不会返回浏览器。</p><label className="field">OpenAI API Key {settings.hasKey && <small>已配置</small>}<input type="password" autoComplete="off" placeholder={settings.hasKey ? '留空保留现有密钥' : 'sk-…'} value={key} onChange={e => setKey(e.target.value)}/></label>{field('baseURL', 'Base URL')}{field('chatModel', '聊天模型')}{field('embeddingModel', 'Embedding 模型')}{field('ttsModel', 'TTS 模型')}<datalist id="models">{models.map(m => <option key={m} value={m}/>)}</datalist><div className="button-row"><button className="primary" onClick={save} disabled={busy}>{busy ? <Busy /> : '保存设置'}</button><button onClick={async () => { setBusy(true); try {
        const result = await api('settings/test', {});
        setModels(result.models);
        notify(`连接正常，可用模型 ${result.models.length} 个；尚未进行生成调用`);
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>测试已保存的连接</button>{settings.hasKey && <button className="text-button danger" onClick={async () => { if (confirm('移除保存的 API Key？环境变量配置不受此操作影响。')) {
        setSettings(await api('settings', { clearKey: true }));
        onChange();
    } }}>移除密钥</button>}</div><div className="section-label">阅读与费用</div><label className="field">默认防剧透范围<select value={settings.scope} onChange={e => setSettings({ ...settings, scope: e.target.value })}><option value="strict">严格 · 仅已读原文</option><option value="chapter">允许当前章节</option><option value="all">允许全书讨论</option></select></label><label className="field">主动教学<select value={settings.teaching} onChange={e => setSettings({ ...settings, teaching: e.target.value })}><option value="off">关闭主动提示</option><option value="chapter">章节结束显示提问入口</option><option value="manual">仅手动触发</option></select></label>{field('maxTokens', '每次生成最大输出 tokens', 'number')}<div className="two-fields">{field('inputPrice', '输入价格 · 美元 / 百万 tokens', 'number')}{field('outputPrice', '输出价格 · 美元 / 百万 tokens', 'number')}</div><p className="muted">费率由你填写，不假定不同模型或兼容服务的价格。音频费用未计入 token 估价。</p><div className="section-label">全书知识索引</div><p className="muted">本地全文检索随导入完成。向量索引与分层摘要按需付费生成，导入不会自动调用 API。</p><select aria-label="选择索引书籍" value={indexBook} onChange={e => setIndexBook(e.target.value)}>{books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select><div className="button-row"><button disabled={!indexBook} onClick={() => index('embedding')}>构建向量索引</button><button disabled={!indexBook} onClick={() => index('summary')}>生成分批摘要</button></div>{jobs.map(j => <div className="job" key={j.id}><strong>{j.book_title} · {j.kind === 'embedding' ? '向量' : '摘要'}</strong><span>{j.status} · {j.cursor}/{j.total}</span><progress max={j.total} value={j.cursor}/>{j.error && <small className="error">{j.error}</small>}{j.status !== 'completed' && <button onClick={async () => { try {
        await api('jobs/' + j.id, { action: j.status === 'running' ? 'pause' : 'resume' });
        await refresh();
    }
    catch (e) {
        notify((e as Error).message);
    } }}>{j.status === 'running' ? '暂停 / 取消请求' : '重试并续跑'}</button>}</div>)}<div className="section-label">数据属于你</div><p className="muted">完整 ZIP 含数据库记录、书籍和音频，不含 API Key。恢复前自动备份现有数据。JSON / Markdown 用于个人档案导出。</p><div className="button-row"><a className="button" href="/api/backup">下载完整备份</a><button onClick={() => restore.current?.click()}>恢复备份</button><a className="button" href="/api/export?format=md">Markdown</a><a className="button" href="/api/export">JSON</a></div><input ref={restore} type="file" hidden accept=".zip" onChange={async (e) => { const f = e.target.files?.[0]; if (f && confirm('恢复将替换当前书库及所有阅读记录。继续？')) {
        setBusy(true);
        try {
            const form = new FormData();
            form.append('file', f);
            await api('backup', form);
            location.reload();
        }
        catch (err) {
            notify((err as Error).message);
        }
        finally {
            setBusy(false);
        }
    } }}/></>}</Modal>;
}
