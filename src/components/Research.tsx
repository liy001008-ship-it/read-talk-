'use client';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Search, ArrowRight, Save, Square, Trash2 } from 'lucide-react';
import { api, download } from '@/lib/client';
import type { Book, Passage, Citation, Scope } from '@/lib/types';
import { Modal, Busy, Empty } from './ui';
import SourceCards from './SourceCards';
import SummaryBrowser from './SummaryBrowser';
export default function Research({ books, scope, onJump, onClose, notify }: {
    books: Book[];
    scope: Scope;
    onJump: (c: Citation) => void;
    onClose: () => void;
    notify: (s: string) => void;
}) {
    const [selected, setSelected] = useState<string[]>(books.slice(0, 2).map(b => b.id));
    const [topic, setTopic] = useState('');
    const [results, setResults] = useState<Passage[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);
    const [doc, setDoc] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const [semantic, setSemantic] = useState(false);
    const [edit, setEdit] = useState(false);
    const abort = useRef<AbortController | null>(null);
    async function refresh() { setDocuments(await api('research')); }
    useEffect(() => { void refresh(); return () => abort.current?.abort(); }, []);
    async function work(report: boolean) { setBusy(true); abort.current = new AbortController(); try {
        if (report) {
            const result = await api('research', { bookIds: selected, topic, scope, semantic }, undefined, abort.current.signal);
            setDoc({ ...result, title: topic, content: result.answer, citations: JSON.stringify(result.citations) });
            await refresh();
        }
        else
            setResults(await api('search', { bookIds: selected, query: topic, scope, semantic }, undefined, abort.current.signal));
    }
    catch (e) {
        if ((e as Error).name !== 'AbortError')
            notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title="跨书研究工作台" kicker="FOLLOW AN IDEA, ACROSS BOOKS" onClose={onClose} wide><div className="research-layout"><aside><div className="section-label">研究书目</div>{books.map(b => <label className="check-row" key={b.id}><input type="checkbox" checked={selected.includes(b.id)} onChange={() => setSelected(selected.includes(b.id) ? selected.filter(x => x !== b.id) : [...selected, b.id])}/>{b.title}</label>)}<p className="muted">检索范围：{scope === 'strict' ? '各书已读位置之前' : scope === 'chapter' ? '各书已读内容与当前章节' : '全书'}。在主阅读器调整。</p><div className="section-label">持续的研究</div>{documents.map(d => <button key={d.id} className={'document-link ' + (doc?.id === d.id ? 'active' : '')} onClick={() => { setDoc(d); setEdit(false); }}>{d.title}<small>{new Date(d.updated_at).toLocaleDateString()}</small></button>)}</aside><section><SummaryBrowser bookIds={selected} scope={scope} onJump={onJump} notify={notify}/><div className="research-query"><input aria-label="研究问题" value={topic} onChange={e => setTopic(e.target.value)} placeholder="一个想追问的概念，例如：记忆与身份"/><button title="全文检索" disabled={!topic || !selected.length || busy} onClick={() => work(false)}><Search size={18}/></button></div><div className="button-row"><label className="check-row"><input type="checkbox" checked={semantic} onChange={e => setSemantic(e.target.checked)}/>语义检索（调用 Embedding API）</label><button className="primary" disabled={!topic || !selected.length || busy} onClick={() => work(true)}>生成研究报告 <ArrowRight size={16}/></button>{busy && <button onClick={() => abort.current?.abort()}><Square size={13}/>取消</button>}</div>{busy && <Busy text="正在检索与分析原文…"/>}{results.length > 0 && <div className="research-results"><h3>相关原文 · {results.length} 段</h3>{results.map(p => <button key={p.id} onClick={() => onJump({ passageId: p.id, bookId: p.book_id, bookTitle: p.book_title || '', chapterTitle: p.title || '', quote: p.text, location: p.location, seq: p.seq, page: p.page })}><small>{p.book_title} / {p.title}</small><p>{p.text}</p></button>)}</div>}{doc ? <article className="research-document"><div className="document-top"><h2>{doc.title}</h2><div className="button-row"><button onClick={() => setEdit(!edit)}>{edit ? '预览' : '编辑'}</button><button onClick={() => download(`# ${doc.title}\n\n${doc.content}`, `${doc.title}.md`)}>导出</button><button title="删除报告" onClick={async () => { if (confirm('删除这份研究报告？')) {
        await api('research/' + doc.id, undefined, 'DELETE');
        setDoc(null);
        await refresh();
    } }}><Trash2 size={14}/></button></div></div>{edit ? <><textarea className="document-editor" value={doc.content} onChange={e => setDoc({ ...doc, content: e.target.value })}/><button className="primary" onClick={async () => { await api('research/' + doc.id, { content: doc.content }, 'PATCH'); await refresh(); notify('研究报告已保存'); }}><Save size={15}/>保存修改</button></> : <div className="markdown"><Markdown>{doc.content}</Markdown></div>}<SourceCards citations={JSON.parse(doc.citations || '[]')} onJump={onJump}/><button className="text-button" onClick={() => { setTopic(`继续研究：${doc.title}。请进一步考察：`); setSelected(JSON.parse(doc.book_ids || JSON.stringify(selected))); }}>以此主题继续研究 <ArrowRight size={14}/></button></article> : !results.length && <Empty>选几本书，把一个问题带进它们之间。<br />全文检索离线可用；研究报告需要模型连接。</Empty>}</section></div></Modal>;
}
