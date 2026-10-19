'use client';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { ArrowUpRight, Send, Plus, BookmarkPlus, Volume2, Square, History, Trash2, MessageCircle, GraduationCap, ScanText, Sparkles, Languages, GitCompare, ArrowRight } from 'lucide-react';
import { api } from '@/lib/client';
import { professors, modes, type Book, type Passage, type Scope, type Citation, type Message } from '@/lib/types';
import { Busy, IconButton } from './ui';
import SourceCards from './SourceCards';
import Debate from './Debate';
import type { AudioRequest } from './AudioBar';
export type Selection = {
    text: string;
    passage: Passage;
    location?: string;
};
export type AnalysisRequest = {
    id: number;
    mode: string;
    question?: string;
};
export default function Assistant({ book, active, selection, scope, onScope, onJump, notify, onSpeak, trigger, hasKey, onSettings,beforeAsk }: {
    book: Book | null;
    active: Passage | null;
    selection: Selection | null;
    scope: Scope;
    onScope: (s: Scope) => void;
    onJump: (c: Citation) => void;
    notify: (s: string) => void;
    onSpeak: (r: AudioRequest) => void;
    trigger: AnalysisRequest | null;
    hasKey: boolean;
    onSettings: () => void;
    beforeAsk:()=>Promise<void>;
}) {
    const [tab, setTab] = useState('professor');
    const [professor, setProfessor] = useState('chinese');
    const [mode, setMode] = useState('quick');
    const [question, setQuestion] = useState('');
    const [style, setStyle] = useState('文学翻译');
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversationId, setConversationId] = useState('');
    const [conversations, setConversations] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [busy, setBusy] = useState(false);
    const abort = useRef<AbortController | null>(null);
    const bottom = useRef<HTMLDivElement>(null);
    async function histories() { if (book)
        setConversations(await api('conversations?book=' + book.id)); }
    useEffect(() => { setMessages([]); setConversationId(''); setShowHistory(false); setProfessor(book?.language.startsWith('en') ? 'english' : /艺术|图像|观看/.test(book?.title || '') ? 'art' : 'chinese'); if (book)
        void histories(); return () => abort.current?.abort(); }, [book?.id]);
    useEffect(() => { if (conversationId)
        void api<Message[]>('conversations/' + conversationId + '?scope=' + scope).then(setMessages); }, [scope]);
    useEffect(() => { if (!messages.length && !busy)
        bottom.current?.parentElement?.scrollTo({ top: 0 });
    else
        bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length, busy]);
    useEffect(() => { if (trigger && book) {
        setTab('professor');
        setMode(trigger.mode);
        void ask(trigger.question || '', trigger.mode);
    } }, [trigger?.id]);
    async function ask(q = question, m = mode) { if (!book || busy)
        return; const text = q.trim() || (m === 'translate' ? `请采用${style}翻译当前选文，并说明重要词汇和修辞。` : m === 'socratic' ? '请就当前原文开始苏格拉底式讨论。' : m === 'question' ? '请提出一个基于当前已读原文的问题。' : `请进行${modes[m]}。`); setBusy(true); setQuestion(''); abort.current = new AbortController(); const user: Message = { id: 'u-' + Date.now(), role: 'user', content: text, citations: '[]', created_at: new Date().toISOString(), professor }; const old = messages; setMessages([...messages, user]); try {
        await beforeAsk();
        const r = await api('chat', { bookId: book.id, professor, mode: m, question: text, passageId: selection?.passage.id || active?.id, selection: selection?.text, scope, conversationId }, undefined, abort.current.signal);
        setConversationId(r.conversationId);
        setMessages(prev => [...prev, { id: 'a-' + Date.now(), role: 'assistant', content: r.answer, citations: JSON.stringify(r.citations), created_at: new Date().toISOString(), professor }]);
        await histories();
    }
    catch (e) {
        setMessages(old);
        if ((e as Error).name !== 'AbortError')
            notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    const p = professors[professor];
    return <aside className="assistant-panel"><div className="assistant-tabs"><button className={tab === 'professor' ? 'active' : ''} onClick={() => setTab('professor')}><GraduationCap size={17}/>AI 教授</button><button className={tab === 'debate' ? 'active' : ''} onClick={() => setTab('debate')}><GitCompare size={16}/>双教授讨论</button></div><div className="scope-control"><span className="scope-dot"/><select aria-label="防剧透范围" value={scope} onChange={e => onScope(e.target.value as Scope)}><option value="strict">严格防剧透 · 仅已读内容</option><option value="chapter">允许当前章节</option><option value="all">允许全书讨论</option></select></div>{tab === 'debate' ? (book ? <div className="assistant-scroll"><Debate bookId={book.id} scope={scope} onJump={onJump} notify={notify} onSpeak={parts => onSpeak({ id: Date.now(), title: '双教授辩论', parts, ai: true })}/></div> : <div className="empty-small">先打开一本书，再让不同视角相遇。</div>) : <><div className="professor-card"><div className="professor-avatar">{p.name.slice(0, 1)}<span /></div><div><select aria-label="选择教授" value={professor} onChange={e => setProfessor(e.target.value)}>{Object.entries(professors).map(([k, p]) => <option key={k} value={k}>{p.name}教授</option>)}</select><small>{p.subtitle}</small></div><IconButton title="历史讨论" onClick={() => { setShowHistory(!showHistory); void histories(); }} active={showHistory}><History size={17}/></IconButton><IconButton title="新建讨论" onClick={() => { abort.current?.abort(); setConversationId(''); setMessages([]); }}><Plus size={18}/></IconButton></div><p className="perspective-caption">模拟学科分析视角 · 优先依据原文</p>{showHistory && <div className="conversation-list">{conversations.map(c => <div key={c.id}><button onClick={async () => { setConversationId(c.id); setMessages(await api('conversations/' + c.id + '?scope=' + scope)); setMode(c.mode); setShowHistory(false); }}>{c.title}</button><button aria-label="删除讨论" onClick={async () => { if (confirm('删除此讨论？')) {
        await api('conversations/' + c.id, undefined, 'DELETE');
        if (c.id === conversationId) {
            setConversationId('');
            setMessages([]);
        }
        await histories();
    } }}><Trash2 size={13}/></button></div>)}{!conversations.length && <small>还没有保存的讨论</small>}</div>}<div className="mode-select"><select aria-label="阅读模式" value={mode} onChange={e => setMode(e.target.value)}>{Object.entries(modes).filter(([k]) => k !== 'research').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{mode === 'translate' && <select aria-label="翻译风格" value={style} onChange={e => setStyle(e.target.value)}>{['直译', '意译', '文学翻译'].map(s => <option key={s}>{s}</option>)}</select>}</div><div className="assistant-scroll">{!messages.length ? <div className="assistant-welcome"><span className="eyebrow">THINK BEYOND THE PAGE</span><h2>在字里行间，<br />遇见新的理解。</h2><p>让一个问题，带你走近文本。<br />选中原文，或从当前段落开始。</p><div className="analysis-actions">{[{ mode: 'close', icon: <ScanText size={19}/>, title: '一起读懂这一段', text: '语言、意象与言外之意' }, { mode: 'socratic', icon: <MessageCircle size={19}/>, title: '用一个好问题开始', text: '循着你的思考，逐步追问' }, { mode: 'critical', icon: <Sparkles size={19}/>, title: '换一种角度看', text: '前提、证据与不同解释' }, { mode: 'chapter', icon: <GraduationCap size={19}/>, title: '梳理章节的脉络', text: '结构、概念与关键论点' }].map(a => <button key={a.mode} onClick={() => { setMode(a.mode); void ask('', a.mode); }} disabled={!book || busy}>{a.icon}<span><strong>{a.title}</strong><small>{a.text}</small></span><ArrowUpRight size={15}/></button>)}</div>{!hasKey && <button className="configure-hint" onClick={onSettings}>配置你的模型，开启教授讲解 <ArrowRight size={14}/></button>}</div> : <div className="analysis-thread">{messages.map(m => <article key={m.id} className={'analysis-entry ' + m.role}>{m.role === 'user' ? <div className="user-question"><span>你的问题</span><p>{m.content}</p></div> : <><div className="analysis-byline"><span>{professors[m.professor]?.name || p.name}视角</span><small>AI 分析</small></div><div className="markdown"><Markdown>{m.content}</Markdown></div><SourceCards citations={JSON.parse(m.citations)} onJump={onJump}/><div className="answer-actions"><button onClick={async () => { if (!book)
        return; await api('notes', { bookId: book.id, kind: 'ai', content: m.content, topic: modes[mode] }); notify('AI 分析已保存到阅读笔记'); }}><BookmarkPlus size={14}/>保存</button><button onClick={() => onSpeak({ id: Date.now(), title: '教授讲解 · ' + p.name, parts: [{ text: m.content }] })}><Volume2 size={14}/>朗读</button></div></>}</article>)}</div>}{busy && <div className="thinking"><Busy text="正在对照原文，组织分析…"/><button onClick={() => abort.current?.abort()}><Square size={12}/>取消</button></div>}<div ref={bottom}/></div>{selection && <div className="selection-preview"><QuoteMark />已选 {selection.text.length} 字 <button onClick={() => setQuestion(`请解释：“${selection.text.slice(0, 100)}”`)}>作为问题</button></div>}<form className="assistant-compose" onSubmit={e => { e.preventDefault(); void ask(); }}><textarea aria-label="向教授提问" value={question} onChange={e => setQuestion(e.target.value)} placeholder={mode === 'socratic' ? '写下你的回答，或要求直接讲解…' : '关于这段文字，你在想什么？'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void ask();
    } }}/><div><small>{mode === 'socratic' ? '可随时要求“直接讲解”或“结束讨论”' : '原文为据，理解由你'}</small><button className="send-button" aria-label="发送问题" disabled={!book || busy}><Send size={17}/></button></div></form></>}</aside>;
}
function QuoteMark() { return <span style={{ fontFamily: 'Georgia', fontSize: 20 }}>“</span>; }
