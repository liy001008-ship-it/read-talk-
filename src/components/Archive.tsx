'use client';
import { useEffect, useState } from 'react';
import { BookOpen, Quote, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/client';
import type { Book, Note, Citation } from '@/lib/types';
import { Modal, Busy, Empty } from './ui';
export default function Archive({ books, currentBook, onClose, onJump, notify, initialTab = 'notes' }: {
    books: Book[];
    currentBook?: string;
    onClose: () => void;
    onJump: (c: Citation) => void;
    notify: (s: string) => void;
    initialTab?: string;
}) {
    const [tab, setTab] = useState(initialTab);
    const [notes, setNotes] = useState<Note[]>([]);
    const [vocab, setVocab] = useState<any[]>([]);
    const [views, setViews] = useState<any[]>([]);
    const [profile, setProfile] = useState<any>(null);
    const [concepts, setConcepts] = useState<any[]>([]);
    const [query, setQuery] = useState('');
    const [memory, setMemory] = useState<Note[] | null>(null);
    const [topic, setTopic] = useState('');
    const [opinion, setOpinion] = useState('');
    const [editing, setEditing] = useState<Note | null>(null);
    async function refresh() { const [n, v, h, p, c] = await Promise.all([api('notes'), api('vocabulary'), api('viewpoints'), api('profile'), api('concepts')]); setNotes(n); setVocab(v); setViews(h); setProfile(p); setConcepts(c); }
    useEffect(() => { void refresh(); }, []);
    return <Modal title="我的学术档案" kicker="A RECORD OF YOUR THINKING" onClose={onClose} wide><div className="tab-row">{[['notes', '阅读笔记'], ['vocabulary', '词汇本'], ['viewpoints', '观点演变'], ['profile', '阅读档案']].map(([k, v]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{v}</button>)}</div>{tab === 'notes' && <><form className="research-query" onSubmit={async (e) => { e.preventDefault(); setMemory(await api('memory', { query })); }}><input aria-label="检索记忆" placeholder="检索过去的笔记、主题与个人观点…" value={query} onChange={e => { setQuery(e.target.value); if (!e.target.value)
        setMemory(null); }}/><button>检索</button></form><div className="note-grid">{(memory || notes).map(n => <article className="note-card" key={n.id}><div className="note-top"><span className={'origin ' + n.kind}>{({ user: '个人观点', ai: 'AI 分析', external: '外部资料', research: '研究笔记' } as Record<string, string>)[n.kind] || n.kind}</span><small>{new Date(n.created_at).toLocaleDateString()}</small><button aria-label="删除笔记" onClick={async () => { if (confirm('删除此笔记？')) {
        await api('notes/' + n.id, undefined, 'DELETE');
        setMemory(null);
        await refresh();
    } }}><Trash2 size={14}/></button></div>{n.topic && <h3>{n.topic}</h3>}{n.quote && <blockquote>{n.quote}</blockquote>}<p className="note-content">{n.content}</p><footer><span>{n.book_title || '独立研究笔记'}</span><button onClick={() => setEditing(n)}>编辑</button>{n.passage_id && <button aria-label="跳转原文" onClick={() => onJump({ passageId: n.passage_id!, bookId: n.book_id!, seq: n.seq || 0, bookTitle: n.book_title || '', chapterTitle: '', quote: n.quote, location: '', page: null })}><ArrowUpRight size={15}/></button>}</footer></article>)}</div>{!(memory || notes).length && <Empty>保留一处摘录，记下一个自己的问题。笔记会在这里慢慢积累。</Empty>}</>}{tab === 'vocabulary' && <><div className="button-row"><p className="muted">每个词都保留它最初出现的语境。</p><button className="text-button" onClick={async () => { const word = prompt('单词或词组'); if (!word)
        return; const meaning = prompt('释义'); if (meaning) {
        await api('vocabulary', { word, meaning, bookId: currentBook });
        await refresh();
    } }}><Plus size={16}/>添加词汇</button></div>{vocab.map(v => <article className="vocab-card" key={v.id}><div><h3>{v.word}</h3><p>{v.meaning}</p><blockquote>{v.example}</blockquote><small>{v.book_title || '个人词汇'} {v.note && ' · ' + v.note}</small></div><div className="button-row"><button onClick={async () => { const meaning = prompt('编辑释义', v.meaning); if (meaning !== null) {
        const note = prompt('个人备注', v.note) || '';
        await api('vocabulary/' + v.id, { meaning, note }, 'PATCH');
        await refresh();
    } }}>编辑</button><button aria-label="删除词汇" onClick={async () => { await api('vocabulary/' + v.id, undefined, 'DELETE'); await refresh(); }}><Trash2 size={15}/></button></div></article>)}{!vocab.length && <Empty>阅读时选中单词，即可保存到词汇本。</Empty>}</>}{tab === 'viewpoints' && <><div className="viewpoint-compose"><div><span className="eyebrow">LET YOUR IDEAS CHANGE</span><h3>此刻，你如何看待这个问题？</h3><p className="muted">每次记录都是独立版本。原有观点和原始时间始终保留。</p></div><input aria-label="观点主题" value={topic} onChange={e => setTopic(e.target.value)} placeholder="共同的问题 / 主题"/><textarea aria-label="个人观点" value={opinion} onChange={e => setOpinion(e.target.value)} placeholder="记录你自己的判断，以及让你改变想法的依据…"/><button className="primary" disabled={!topic || !opinion} onClick={async () => { await api('viewpoints', { topic, content: opinion, bookId: currentBook }); setOpinion(''); await refresh(); notify('已添加新的观点版本，历史观点未被修改'); }}>记录此刻的观点</button></div><div className="timeline">{views.map(v => <article key={v.id}><time>{new Date(v.created_at).toLocaleString()}</time><h3>{v.topic}</h3><p>{v.content}</p><small>{v.book_title || '独立思考'}</small><button className="text-button" onClick={() => { setTopic(v.topic); setOpinion(''); }}>添加新观点</button></article>)}</div></>}{tab === 'profile' && (!profile ? <Busy /> : <><div className="stat-grid"><div><strong>{books.length}</strong><span>本藏书</span></div><div><strong>{notes.length}</strong><span>则阅读笔记</span></div><div><strong>{views.length}</strong><span>次观点记录</span></div><div><strong>{profile.topics.length}</strong><span>个研究主题</span></div></div><div className="profile-columns"><section><h3>正在阅读</h3>{books.map(b => <p className="profile-book" key={b.id}><BookOpen size={16}/>{b.title}<small>{b.percent}%</small></p>)}<h3>重要概念与书籍关联</h3><div className="concept-list">{concepts.map((c, i) => <span key={i}>{c.name}<small>{c.book_title}</small></span>)}</div><button className="text-button" disabled={!currentBook} onClick={async () => { const name = prompt('将一个重要概念关联到当前书籍'); if (name) {
        await api('concepts', { name, bookId: currentBook });
        await refresh();
    } }}><Plus size={15}/>记录概念</button><h3>实际 API 用量</h3>{profile.usage.map((u: any) => <p className="usage-row" key={u.model}><strong>{u.model}</strong><small>{u.calls} 次 · 输入 {Number(u.input_tokens).toLocaleString()} / 输出 {Number(u.output_tokens).toLocaleString()} tokens</small></p>)}{!profile.usage.length && <p className="muted">尚无实际 API 调用记录。</p>}</section><section><h3>阅读时间线</h3><div className="timeline compact">{profile.history.slice(0, 25).map((h: any) => <article key={h.id}><time>{new Date(h.created_at).toLocaleString()}</time><p>{h.title} · 第 {h.seq + 1} 段</p></article>)}</div></section></div><div className="button-row"><a className="button" href="/api/export?format=md">导出 Markdown</a><a className="button" href="/api/export">导出 JSON</a></div></>)}{editing && <div className="inline-editor"><h3>编辑笔记</h3><input aria-label="笔记主题" value={editing.topic} onChange={e => setEditing({ ...editing, topic: e.target.value })}/><textarea aria-label="笔记正文" value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })}/><div className="button-row"><button className="primary" onClick={async () => { await api('notes/' + editing.id, { content: editing.content, topic: editing.topic }, 'PATCH'); setEditing(null); await refresh(); notify('笔记已保存'); }}>保存</button><button onClick={() => setEditing(null)}>取消</button></div></div>}</Modal>;
}
