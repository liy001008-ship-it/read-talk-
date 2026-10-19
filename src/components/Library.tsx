'use client';
import { useRef, useState } from 'react';
import { Upload, BookOpen, Search, Trash2, ArrowUpRight, FileText, Plus } from 'lucide-react';
import { api } from '@/lib/client';
import type { Book } from '@/lib/types';
import { Modal, Busy, IconButton } from './ui';
export const guide = `知间 · 阅读导引\n\n第一章 让问题发生\n\n一本书并不因读完最后一页而被真正理解。理解常常发生在停顿之中：某一句话让我们迟疑，某一个概念改变了我们提问的方式。阅读的进度因此不只是一条向前延伸的线，也是一张不断被重新连接的网。\n\n我们可以从一个很小的问题开始：作者在这里究竟说了什么？当这个问题被仔细追问，语言的选择、论证的前提，以及那些未曾明言的价值判断就会逐渐显现。\n\n“知间”把原文放在中心。点击一段文字，系统便把它记录为你当前读到的位置；选中一个句子，可以保存摘录、提出问题，或者邀请一个模拟的学科视角加入讨论。\n\n第二章 不同的观看方式\n\n文学阅读关注一个叙述怎样被组织，哲学阅读追问一个论断凭什么成立，历史阅读则试图理解它在什么条件下出现。这些方法并不互相替代。它们照亮同一段文字的不同部分，也让各自的盲点变得可见。\n\n当两个视角产生分歧，真正值得保存的未必是胜负，而是分歧背后的前提。一个有价值的讨论可以让我们更清楚地知道：哪些判断有原文依据，哪些只是解释，哪些问题仍然没有答案。\n\nChapter 3 A margin for thought\n\nTo read attentively is to leave a margin for uncertainty. A sentence may offer an answer, yet the question we carry into it changes what we are able to see.\n\nKeep a record of your own response before asking for an explanation. Return to that response after another chapter, or another book. The difference between those two moments is part of what you have learned.\n\n后记 关于这份样章\n\n这是一份为本应用原创的操作导引，不是公开出版物。AI 功能需要在设置中填写你自己的 API Key；没有密钥时，阅读、书签、笔记、全文检索与导出仍然可用。`;
export default function Library({ books, onOpen, onRefresh, onClose, notify }: {
    books: Book[];
    onOpen: (id: string) => void;
    onRefresh: () => Promise<void>;
    onClose: () => void;
    notify: (s: string) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('全部');
    const [drag, setDrag] = useState(false);
    async function upload(files: File[]) { if (!files.length)
        return; setBusy(true); try {
        const form = new FormData();
        files.forEach(f => form.append('files', f));
        const result = await api<any[]>('books', form);
        await onRefresh();
        notify(result.map(r => r.error ? `${r.filename}：${r.error}` : r.duplicate ? `已在书架：${r.title}` : `已导入：${r.title}`).join('；'));
        const first = result.find(r => r.id && !r.error);
        if (first)
            onOpen(first.id);
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title="我的书房" kicker="YOUR PERSONAL LIBRARY" onClose={onClose} wide><div className="library-toolbar"><label className="search-field"><Search size={17}/><input aria-label="搜索书架" placeholder="搜索书名、作者…" value={query} onChange={e => setQuery(e.target.value)}/></label><button className="primary" onClick={() => input.current?.click()} disabled={busy}><Plus size={17}/>导入书籍</button><input ref={input} type="file" accept=".txt,.epub,.pdf" multiple hidden onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ''; }}/></div><div className={'drop-zone ' + (drag ? 'drag' : '')} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void upload(Array.from(e.dataTransfer.files)); }}>{busy ? <Busy text="解析书籍并建立本地全文索引…"/> : <><Upload size={22}/><span>把书放进来，让思想走出去</span><small>拖入 EPUB、TXT 或 PDF · 支持批量导入 · 单本不超过 100 MB</small></>}</div><div className="category-row">{['全部', ...new Set(books.map(b => b.category))].map(c => <button className={c === category ? 'selected' : ''} key={c} onClick={() => setCategory(c)}>{c}</button>)}<span>{books.length} 本藏书</span></div><div className="book-grid">{books.filter(b => (category === '全部' || b.category === category) && (b.title + b.author).toLowerCase().includes(query.toLowerCase())).map(b => <article className="book-card" key={b.id}><button className={'book-cover cover-' + b.format} onClick={() => onOpen(b.id)}>{b.cover ? <img src={b.cover} alt={b.title}/> : <><span>{b.format.toUpperCase()}</span><strong>{b.title}</strong><i>{b.author || '私人藏书'}</i><BookOpen size={24}/></>}</button><div><button className="book-title-button" onClick={() => onOpen(b.id)}>{b.title}<ArrowUpRight size={14}/></button><p>{b.author || '作者未标注'}</p><div className="mini-progress"><i style={{ width: b.percent + '%' }}/></div><div className="book-meta"><button onClick={async () => { const category = prompt('书籍分类', b.category); if (category !== null) {
        await api('books/' + b.id, { category }, 'PATCH');
        await onRefresh();
    } }}>{b.category}</button><span>{b.percent}%</span><IconButton title={`删除《${b.title}》`} onClick={async () => { if (confirm(`删除《${b.title}》及关联讨论、进度和高亮？笔记将保留，出处会解除关联。`)) {
        await api('books/' + b.id, undefined, 'DELETE');
        await onRefresh();
        notify('书籍已删除');
    } }}><Trash2 size={14}/></IconButton></div></div></article>)}</div>{!books.length && <div className="empty-small"><FileText size={27}/><p>第一本书，会从哪里开始？</p><button className="text-button" onClick={() => upload([new File([guide], '知间 · 阅读导引.txt', { type: 'text/plain' })])}>打开原创导读样章 <ArrowUpRight size={14}/></button></div>}</Modal>;
}
