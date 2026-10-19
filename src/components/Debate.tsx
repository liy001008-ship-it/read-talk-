'use client';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Play, Pause, Send, ScrollText, Plus } from 'lucide-react';
import { api } from '@/lib/client';
import { professors, type Scope, type Citation } from '@/lib/types';
import { Busy, Empty } from './ui';
import SourceCards from './SourceCards';
export default function Debate({ bookId, scope, onJump, notify, onSpeak }: {
    bookId: string;
    scope: Scope;
    onJump: (c: Citation) => void;
    notify: (s: string) => void;
    onSpeak: (parts: {
        text: string;
        voice: string;
    }[]) => void;
}) {
    const [list, setList] = useState<any[]>([]);
    const [debateId, setDebateId] = useState('');
    const [topic, setTopic] = useState('');
    const [a, setA] = useState('chinese');
    const [b, setB] = useState('philosophy');
    const [turns, setTurns] = useState<any[]>([]);
    const [busy, setBusy] = useState(false);
    const [interjection, setInterjection] = useState('');
    const abort = useRef<AbortController | null>(null);
    const running = useRef(false);
    async function refresh() { setList(await api('debates?book=' + bookId)); }
    async function load(id: string) { const r = await api('debates/' + id + '?scope=' + scope); setTurns(r.turns); return r; }
    useEffect(() => { setDebateId(''); setTurns([]); void refresh(); return () => { running.current = false; abort.current?.abort(); }; }, [bookId]);
    useEffect(() => { if (debateId)
        void load(debateId); }, [scope]);
    async function create() { try {
        const r = await api('debates', { bookId, topic, a, b, scope });
        setDebateId(r.id);
        setTurns([]);
        await refresh();
        return r.id;
    }
    catch (e) {
        notify((e as Error).message);
        return '';
    } }
    async function step(summary = false) { const id = debateId || await create(); if (!id)
        return; setBusy(true); abort.current = new AbortController(); try {
        await api('debates/' + id + '?scope=' + scope, { action: summary ? 'summary' : 'next', scope }, undefined, abort.current.signal);
        await load(id);
        if (summary)
            notify('辩论纪要已保存为 AI 笔记');
    }
    catch (e) {
        if ((e as Error).name !== 'AbortError')
            notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function play() { const id = debateId || await create(); if (!id)
        return; setBusy(true); running.current = true; try {
        for (let i = 0; i < 4 && running.current; i++) {
            abort.current = new AbortController();
            await api('debates/' + id + '?scope=' + scope, { action: 'next', scope }, undefined, abort.current.signal);
            await load(id);
        }
    }
    catch (e) {
        if ((e as Error).name !== 'AbortError')
            notify((e as Error).message);
    }
    finally {
        running.current = false;
        setBusy(false);
    } }
    function pause() { running.current = false; abort.current?.abort(); if (debateId)
        void api('debates/' + debateId + '?scope=' + scope, { action: 'pause' }); setBusy(false); }
    const select = (value: string, set: (s: string) => void) => <select aria-label={set === setA ? '教授 A' : '教授 B'} value={value} onChange={e => set(e.target.value)}>{Object.entries(professors).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}</select>;
    return <div className="debate-panel"><div className="section-label">两种视角，一个问题</div><p className="muted">模拟学科框架，以原文为依据。每次自动讨论最多 4 轮。</p><div className="debate-select">{select(a, setA)}<span>×</span>{select(b, setB)}</div><textarea aria-label="辩论主题" placeholder="你希望两位教授讨论什么？" value={topic} onChange={e => setTopic(e.target.value)}/><div className="button-row"><button className="primary" disabled={busy || (!debateId && !topic)} onClick={play}><Play size={14}/>开始 / 继续</button><button disabled={!busy} onClick={pause}><Pause size={14}/>暂停</button><button disabled={busy || !topic} onClick={async () => { setDebateId(''); setTurns([]); await create(); }}><Plus size={14}/>新讨论</button></div>{list.length > 0 && <select aria-label="历史辩论" value={debateId} onChange={async (e) => { pause(); setDebateId(e.target.value); if (e.target.value) {
        const r = await load(e.target.value);
        setTopic(r.debate.topic);
        setA(r.debate.professor_a);
        setB(r.debate.professor_b);
    } }}><option value="">选择历史讨论</option>{list.map(d => <option key={d.id} value={d.id}>{d.topic}</option>)}</select>}<div className="debate-turns">{turns.map((t, i) => <article className={'debate-turn voice-' + (i % 2)} key={t.id}><div className="turn-speaker"><i>{t.role === 'user' ? '我' : professors[t.professor]?.name.slice(0, 1)}</i><strong>{t.role === 'user' ? '你的观点' : professors[t.professor]?.name + '视角'}</strong></div><div className="markdown"><Markdown>{t.content}</Markdown></div><SourceCards citations={JSON.parse(t.citations)} onJump={onJump}/></article>)}{!turns.length && !busy && <Empty>分歧并非终点，它让前提显现。</Empty>}{busy && <Busy text="教授正在回应原文与此前观点…"/>}</div><form onSubmit={async (e) => { e.preventDefault(); if (!interjection || !debateId)
        return; await api('debates/' + debateId + '?scope=' + scope, { interjection, scope }); setInterjection(''); await load(debateId); }} className="debate-interject"><input aria-label="参与辩论" value={interjection} onChange={e => setInterjection(e.target.value)} placeholder="加入你的观点…"/><button aria-label="发送插话" disabled={!debateId || busy || !interjection}><Send size={15}/></button></form><div className="button-row"><button disabled={busy || !debateId} onClick={() => step()}>下一位回应</button><button disabled={busy || !turns.length} onClick={() => step(true)}><ScrollText size={14}/>保存纪要</button><button disabled={!turns.length || busy} onClick={() => onSpeak(turns.filter(t => t.role === 'assistant').map(t => ({ text: t.content, voice: t.professor === a ? 'nova' : 'onyx' })))}>双人语音</button></div></div>;
}
