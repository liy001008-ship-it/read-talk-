'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BookOpen, LibraryBig, Search, PanelLeftClose, PanelRightClose, Maximize2, Minimize2, ChevronLeft, ChevronRight, ChevronDown, Bookmark, NotebookPen, FlaskConical, Settings2, Sun, Moon, Check, Plus, X, Highlighter, Languages, Volume2, GraduationCap, ArrowUpRight, List, BookmarkPlus, FileText, FolderOpen, Trash2, Download, AlignLeft } from 'lucide-react';
import { api } from '@/lib/client';
import { usePreferences } from '@/lib/store';
import type { Book, Chapter, Passage, Citation, Scope, Note } from '@/lib/types';
import { IconButton, Modal, Busy, Empty } from './ui';
import Library, { guide } from './Library';
import Settings from './Settings';
import Research from './Research';
import Archive from './Archive';
import ChapterEditor from './ChapterEditor';
import Assistant, { type Selection, type AnalysisRequest } from './Assistant';
import AudioBar, { type AudioRequest } from './AudioBar';
const OriginalView = dynamic(() => import('./OriginalView'), { ssr: false, loading: () => <Busy text="加载阅读引擎…"/> });
export default function ReaderApp() {
    const prefs = usePreferences();
    const [ready, setReady] = useState(false);
    const [books, setBooks] = useState<Book[]>([]);
    const [book, setBook] = useState<Book | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [passages, setPassages] = useState<Passage[]>([]);
    const [active, setActive] = useState<Passage | null>(null);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [scope, setScope] = useState<Scope>('strict');
    const [settings, setSettings] = useState<any>({ hasKey: false, teaching: 'off' });
    const [modal, setModal] = useState('');
    const [sidebarTab, setSidebarTab] = useState('toc');
    const [mobile, setMobile] = useState('');
    const [hideLeft, setHideLeft] = useState(false);
    const [hideRight, setHideRight] = useState(false);
    const [original, setOriginal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState('');
    const [bookmarks, setBookmarks] = useState<any[]>([]);
    const [highlights, setHighlights] = useState<any[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Passage[] | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisRequest | null>(null);
    const [audio, setAudio] = useState<AudioRequest | null>(null);
    const [noteText, setNoteText] = useState('');
    const [noteTopic, setNoteTopic] = useState('');
    const [saved, setSaved] = useState(true);
    const reader = useRef<HTMLDivElement>(null);
    const pendingJump = useRef<string>('');
    const loadVersion = useRef(0);
    const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveBook = useRef<Book | null>(null);
    liveBook.current = book;
    const latestProgress = useRef<{
        bookId: string;
        passageId: string;
        offset: number;
        location?: string;
    } | null>(null);
    const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current)
        clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 6500); }, []);
    const refreshBooks = useCallback(async () => { const items = await api<Book[]>('books'); setBooks(items); const current = liveBook.current; if (current) {
        const b = items.find(b => b.id === current.id);
        if (b)
            setBook(b);
        else {
            setBook(null);
            setChapter(null);
            setPassages([]);
        }
    } }, []);
    async function loadSettings() { const s = await api('settings'); setSettings(s); setScope(['strict', 'chapter', 'all'].includes(s.scope) ? s.scope : 'strict'); }
    async function loadExtras(bookId: string) { const [b, h, n] = await Promise.all([api('bookmarks?book=' + bookId), api('highlights?book=' + bookId), api<Note[]>('notes?book=' + bookId)]); setBookmarks(b); setHighlights(h); setNotes(n); }
    async function openBook(bookId: string, items?: Book[], closePanel = true) { await flushProgress(); const item = (items || books).find(b => b.id === bookId); if (!item)
        return; setLoading(true); const version = ++loadVersion.current; setBook(item); prefs.set({ lastBook: bookId }); if (closePanel) {
        setModal('');
        setMobile('');
    } setSelection(null); setOriginal(false); setSearchResults(null); setQuery(''); try {
        const cs = await api<Chapter[]>('books/' + bookId + '/chapters');
        if (version !== loadVersion.current)
            return;
        setChapters(cs);
        const c = cs.find(c => c.id === item.chapter_id) || cs[0];
        if (c) {
            setChapter(c);
            const ps = await api<Passage[]>('books/' + bookId + '/passages?chapter=' + c.id);
            if (version !== loadVersion.current)
                return;
            setPassages(ps);
            setActive(ps.find(p => p.seq === item.progress_seq) || ps[0] || null);
            pendingJump.current = ps.find(p => p.seq === item.progress_seq)?.id || '';
        }
        await loadExtras(bookId);
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        if (version === loadVersion.current)
            setLoading(false);
    } }
    useEffect(() => { setReady(true); void (async () => { try {
        const items = await api<Book[]>('books');
        setBooks(items);
        await loadSettings();
        const last = usePreferences.getState().lastBook;
        const b = items.find(b => b.id === last) || items[0];
        if (b)
            await openBook(b.id, items, false);
    }
    catch (e) {
        notify((e as Error).message);
    } })(); function unhandled(e: PromiseRejectionEvent) { if (e.reason?.name !== 'AbortError')
        notify(e.reason?.message || '操作失败，请重试'); e.preventDefault(); } window.addEventListener('unhandledrejection', unhandled); return () => { window.removeEventListener('unhandledrejection', unhandled); if (progressTimer.current)
        clearTimeout(progressTimer.current); }; }, []);
    useEffect(() => { if (ready)
        document.documentElement.dataset.theme = prefs.theme; }, [prefs.theme, ready]);
    useEffect(() => { if (!passages.length)
        return; const target = pendingJump.current; requestAnimationFrame(() => { const el = target ? document.getElementById('p-' + target) : null; if (el)
        el.scrollIntoView({ block: 'center' });
    else
        reader.current?.scrollTo({ top: 0 }); pendingJump.current = ''; }); }, [passages]);
    async function flushProgress() { if (progressTimer.current) {
        clearTimeout(progressTimer.current);
        progressTimer.current = null;
    } const p = latestProgress.current; latestProgress.current = null; if (p) {
        try {
            await api('books/' + p.bookId + '/progress', p);
            setSaved(true);
        }
        catch (e) {
            notify((e as Error).message);
            setSaved(false);
        }
    } }
    useEffect(() => { const unload = () => { const p = latestProgress.current; if (p) {
        navigator.sendBeacon('/api/books/' + p.bookId + '/progress', new Blob([JSON.stringify(p)], { type: 'application/json' }));
    } }; window.addEventListener('pagehide', unload); const visibility = () => { if (document.visibilityState === 'hidden')
        void flushProgress(); }; document.addEventListener('visibilitychange', visibility); return () => { window.removeEventListener('pagehide', unload); document.removeEventListener('visibilitychange', visibility); }; }, []);
    function mark(p: Passage, offset = p.text.length, location?: string) { if (!book)
        return; setActive(p); setBook(prev => prev && ({ ...prev, progress_seq: p.seq, progress_offset: offset, chapter_id: p.chapter_id, location: location || p.location, percent: Math.round((p.seq + (offset > 0 ? 1 : 0)) / Math.max(1, prev.total_passages) * 100) })); latestProgress.current = { bookId: p.book_id, passageId: p.id, offset, location }; setSaved(false); if (progressTimer.current)
        clearTimeout(progressTimer.current); progressTimer.current = setTimeout(() => { void flushProgress(); }, 500); }
    async function navigate(c: Chapter) { if (!book)
        return; await flushProgress(); setLoading(true); setSelection(null); setMobile(''); try {
        const ps = await api<Passage[]>('books/' + book.id + '/passages?chapter=' + c.id);
        setChapter(c);
        setPassages(ps);
        setActive(ps[0] || null);
        if (ps[0])
            mark(ps[0], 0);
        pendingJump.current = '';
    }
    catch (e) {
        notify((e as Error).message);
    }
    finally {
        setLoading(false);
    } }
    async function jump(c: Citation) { try {
        const p = await api<Passage>('passages/' + c.passageId);
        await flushProgress();
        const items = await api<Book[]>('books');
        setBooks(items);
        const b = items.find(b => b.id === p.book_id);
        if (!b)
            return;
        const cs = await api<Chapter[]>('books/' + b.id + '/chapters');
        const ch = cs.find(c => c.id === p.chapter_id)!;
        setModal('');
        setMobile('');
        setOriginal(false);
        setBook(b);
        prefs.set({ lastBook: b.id });
        setChapters(cs);
        setChapter(ch);
        pendingJump.current = p.id;
        const ps = await api<Passage[]>('books/' + b.id + '/passages?chapter=' + ch.id);
        setPassages(ps);
        setActive(p);
        setSelection(null);
        await loadExtras(b.id);
        setTimeout(() => document.getElementById('p-' + p.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 70);
    }
    catch (e) {
        notify((e as Error).message);
    } }
    function selected(text: string, p: Passage, location?: string) { if (!text.trim())
        return; const at = p.text.indexOf(text); mark(p, at >= 0 ? at + text.length : p.text.length, location); setSelection({ text, passage: p, location }); }
    function handleSelection() { const s = window.getSelection(); if (!s || s.isCollapsed || !s.toString().trim())
        return; const text = s.toString().trim(); const node = s.anchorNode?.parentElement?.closest('[data-passage]'); const end = s.focusNode?.parentElement?.closest('[data-passage]'); const p = passages.find(p => p.id === node?.getAttribute('data-passage')); if (!p || node !== end) {
        notify('请在同一段落内选择文字，确保摘录能绑定稳定位置');
        return;
    } if (!p.text.includes(text))
        return; selected(text, p); }
    async function trigger(mode: string, question?: string) { await flushProgress(); setAnalysis({ id: Date.now(), mode, question }); setHideRight(false); setMobile('assistant'); }
    async function bookmark() { if (!book || !active) {
        notify('请先点击一个段落');
        return;
    } await api('bookmarks', { bookId: book.id, passageId: active.id, location: book.location, label: active.text.slice(0, 45) }); await loadExtras(book.id); notify('书签已保存'); }
    function resize(side: 'left' | 'right', event: React.PointerEvent) { event.preventDefault(); const startX = event.clientX, initial = side === 'left' ? prefs.leftWidth : prefs.rightWidth; const move = (e: PointerEvent) => { const v = initial + (e.clientX - startX) * (side === 'left' ? 1 : -1); prefs.set(side === 'left' ? { leftWidth: Math.max(190, Math.min(350, v)) } : { rightWidth: Math.max(300, Math.min(500, v)) }); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }
    async function sample() { const form = new FormData(); form.append('files', new File([guide], '知间 · 阅读导引.txt')); const r = await api<any[]>('books', form); await refreshBooks(); const items = await api<Book[]>('books'); await openBook(r[0].id, items); }
    const chapterIndex = chapter ? chapters.findIndex(c => c.id === chapter.id) : -1;
    const showLeft = !prefs.immersive && !hideLeft, showRight = !prefs.immersive && !hideRight;
    return <div className={'app-shell ' + (prefs.immersive ? 'immersive ' : '') + (mobile ? 'mobile-' + mobile : '')} style={{ '--left-width': prefs.leftWidth + 'px', '--right-width': prefs.rightWidth + 'px' } as React.CSSProperties}><header className="topbar"><button className="brand" onClick={() => setModal('library')} aria-label="知间 · 我的书房"><span className="brand-mark"><BookOpen size={22}/></span><strong>知间<span>BETWEEN PAGES</span></strong></button><nav className="main-nav"><button onClick={() => setModal('library')}><LibraryBig size={17}/><span>书房</span></button><button onClick={() => setModal('research')}><FlaskConical size={17}/><span>研究</span></button><button onClick={() => setModal('notes')}><NotebookPen size={17}/><span>笔记</span></button><button onClick={() => setModal('profile')}><FolderOpen size={17}/><span>档案</span></button></nav><div className="topbar-right"><span className="local-status"><span />本地书房</span><IconButton title="切换阅读主题" onClick={() => prefs.set({ theme: prefs.theme === 'paper' ? 'light' : prefs.theme === 'light' ? 'dark' : 'paper' })}>{prefs.theme === 'dark' ? <Moon size={18}/> : <Sun size={18}/>}</IconButton><IconButton title="设置" onClick={() => setModal('settings')}><Settings2 size={18}/></IconButton></div></header><main className={'workspace ' + (!showLeft ? 'no-left ' : '') + (!showRight ? 'no-right ' : '')}><aside className={'book-sidebar ' + (showLeft ? '' : 'desktop-hidden')}><div className="sidebar-top"><span className="eyebrow">THE READING ROOM</span><IconButton title="打开书房" onClick={() => setModal('library')}><Plus size={17}/></IconButton></div><button className="current-book" onClick={() => setModal('library')}><span className={'tiny-cover cover-' + (book?.format || 'txt')}>{book?.cover ? <img src={book.cover} alt=""/> : <BookOpen size={22}/>}</span><span><strong>{book?.title || '一本书，一个新世界'}</strong><small>{book?.author || '选择或导入一本书'}</small></span><ChevronDown size={15}/></button>{book && <div className="sidebar-progress"><div><span>阅读进度</span><strong>{book.percent}%</strong></div><div className="mini-progress"><i style={{ width: book.percent + '%' }}/></div></div>}<div className="sidebar-tabs">{[['toc', '目录'], ['bookmarks', '书签'], ['notes', '笔记']].map(([k, v]) => <button key={k} className={sidebarTab === k ? 'active' : ''} onClick={() => { setSidebarTab(k); if (book)
        void loadExtras(book.id); }}>{v}{k === 'bookmarks' && bookmarks.length > 0 && <small>{bookmarks.length}</small>}</button>)}</div><div className="sidebar-content">{sidebarTab === 'toc' && <>{chapters.length > 5 && <label className="toc-search"><Search size={14}/><input aria-label="搜索目录" placeholder="搜索章节" value={query} onChange={e => setQuery(e.target.value)}/></label>}<ol className="chapter-list">{chapters.filter(c => c.title.toLowerCase().includes(query.toLowerCase())).map(c => <li key={c.id}><button className={chapter?.id === c.id ? 'active' : ''} onClick={() => navigate(c)}><span className="chapter-num">{String(c.ordinal + 1).padStart(2, '0')}</span><span>{c.title}</span>{chapter?.id === c.id && <i />}</button></li>)}</ol>{!book && <Empty>导入书籍后，<br />章节会在这里展开。</Empty>}</>}{sidebarTab === 'bookmarks' && <>{bookmarks.map(b => <div key={b.id} className="sidebar-item"><button onClick={() => jump({ passageId: b.passage_id, bookId: b.book_id, seq: b.seq, bookTitle: '', chapterTitle: '', quote: '', location: b.location, page: null })}><Bookmark size={13}/><span>{b.label}</span></button><IconButton title="删除书签" onClick={async () => { await api('bookmarks/' + b.id, undefined, 'DELETE'); if (book)
        await loadExtras(book.id); }}><X size={12}/></IconButton></div>)}{!bookmarks.length && <Empty>把想再来的地方，<br />留一个书签。</Empty>}</>}{sidebarTab === 'notes' && <>{notes.map(n => <button className="sidebar-note" key={n.id} onClick={() => setModal('notes')}><small>{n.kind === 'ai' ? 'AI 分析' : '个人笔记'}</small><p>{n.content.slice(0, 90)}</p></button>)}{!notes.length && <Empty>选中原文，<br />记下你的第一则思考。</Empty>}<button className="text-button" onClick={() => setModal('notes')}>全部笔记 <ArrowUpRight size={14}/></button></>}</div><div className="sidebar-bottom"><button onClick={() => setModal('library')}><LibraryBig size={16}/>全部藏书 <span>{books.length}</span></button><button onClick={() => setModal('research')}><FlaskConical size={16}/>跨书研究工作台 <ArrowUpRight size={14}/></button></div></aside>{showLeft && <div className="resizer left-resizer" role="separator" aria-label="调整目录宽度" onPointerDown={e => resize('left', e)}/>}<section className="reader-column"><div className="reader-toolbar"><div className="reader-tools-left"><IconButton title={showLeft ? '收起目录' : '展开目录'} active={!showLeft} onClick={() => { setHideLeft(!hideLeft); setMobile(mobile === 'toc' ? '' : 'toc'); }}><PanelLeftClose size={17}/></IconButton><span>{book ? '正在阅读' : '让思想，在阅读中发生'}</span>{book && <span className="format-label">{book.format.toUpperCase()}</span>}</div><div className="reader-tools"><IconButton title="搜索原文" onClick={() => { setModal('search'); setSearchResults(null); setQuery(''); }}><Search size={17}/></IconButton><IconButton title="添加书签" onClick={bookmark}><BookmarkPlus size={17}/></IconButton><IconButton title="阅读排版" onClick={() => setModal('appearance')}><span className="type-icon">Aa</span></IconButton><IconButton title={prefs.immersive ? '退出沉浸阅读' : '沉浸阅读'} active={prefs.immersive} onClick={() => prefs.set({ immersive: !prefs.immersive })}>{prefs.immersive ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</IconButton><IconButton title="切换教授侧栏" active={!showRight} onClick={() => { setHideRight(!hideRight); setMobile(mobile === 'assistant' ? '' : 'assistant'); }}><PanelRightClose size={17}/></IconButton></div></div>{!ready || loading ? <div className="reader-loading"><Busy text="正在展开书页…"/></div> : book && chapter ? <><div className="reading-scroll" ref={reader} onMouseUp={handleSelection} onTouchEnd={() => setTimeout(handleSelection, 100)} onScroll={() => { const box = reader.current; if (!box || original)
        return; const bounds = box.getBoundingClientRect(); const reached = passages.filter(p => { const r = document.getElementById('p-' + p.id)?.getBoundingClientRect(); return r && r.bottom < bounds.top + 100; }).at(-1); if (reached && reached.seq > (active?.seq ?? -1))
        mark(reached); }}><article className="reading-page" style={{ fontSize: prefs.fontSize }}><div className="book-heading"><span className="eyebrow">{book.title}</span><h1>{chapter.title}</h1>{book.author && <p>{book.author}</p>}<div className="chapter-rule"><span />{String(chapter.ordinal + 1).padStart(2, '0')}<span /></div></div>{book.warning && <p className="reader-warning">{book.warning}</p>}{book.format !== 'txt' && <div className="view-toggle"><button className={!original ? 'active' : ''} onClick={() => setOriginal(false)}><AlignLeft size={14}/>文本视图</button><button className={original ? 'active' : ''} onClick={() => setOriginal(true)}><FileText size={14}/>{book.format === 'pdf' ? 'PDF 原版' : 'EPUB 原版'}</button></div>}{original ? <OriginalView book={book} chapter={chapter} passages={passages} onLocation={(p, location) => mark(p, 0, location)} onSelection={selected}/> : <div className="book-text">{passages.map(p => <p key={p.id} id={'p-' + p.id} data-passage={p.id} className={'passage ' + (active?.id === p.id ? 'current ' : '') + (highlights.some(h => h.passage_id === p.id) ? 'highlighted' : '')} onClick={() => { if (!window.getSelection()?.toString())
        mark(p); }}>{renderHighlight(p.text, highlights.filter(h => h.passage_id === p.id).map(h => h.quote))}<span className="paragraph-marker" aria-hidden="true">{p.ordinal + 1}</span></p>)}</div>}<div className="chapter-end"><span>· · ·</span><p>给思考留一点空白。</p><div className="button-row"><button onClick={() => trigger('question')}>带走一个问题 <ArrowUpRight size={14}/></button><button onClick={() => { setNoteText(''); setNoteTopic(chapter.title); setModal('note'); }}>记下我的想法 <NotebookPen size={14}/></button></div>{settings.teaching === 'chapter' && <p className="teaching-hint">章节结束了。你可以手动邀请教授提出一个问题。</p>}</div></article></div>{selection && <div className="selection-toolbar"><span>{selection.text.length} 字</span><button onClick={() => trigger('quick')}><GraduationCap size={15}/>解释</button><button onClick={() => trigger('translate')}><Languages size={15}/>翻译</button><button onClick={async () => { await api('highlights', { bookId: book.id, passageId: selection.passage.id, quote: selection.text }); await loadExtras(book.id); notify('原文高亮已保存'); }}><Highlighter size={15}/>高亮</button><button onClick={() => { setNoteText(''); setNoteTopic(''); setModal('note'); }}><NotebookPen size={15}/>批注</button><button onClick={async () => { const meaning = prompt('单词或词组的释义'); if (meaning) {
        await api('vocabulary', { bookId: book.id, passageId: selection.passage.id, word: selection.text, meaning });
        notify('已保存到个人词汇本');
    } }}>生词</button><IconButton title="取消选文" onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }}><X size={14}/></IconButton></div>}<div className="reading-status"><button disabled={chapterIndex <= 0} onClick={() => navigate(chapters[chapterIndex - 1])}><ChevronLeft size={16}/><span>上一章</span></button><div><span>{saved ? <Check size={12}/> : <span className="saving-dot"/>}{saved ? '进度已保存' : '正在保存'}</span><span>{chapterIndex + 1} / {chapters.length}</span></div><button disabled={chapterIndex >= chapters.length - 1} onClick={() => navigate(chapters[chapterIndex + 1])}><span>下一章</span><ChevronRight size={16}/></button></div></> : <div className="welcome-page"><div className="welcome-illustration"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><BookOpen size={68} strokeWidth={1}/><span>知</span></div><span className="eyebrow">A QUIET PLACE FOR BIG IDEAS</span><h1>阅读之间，<br />万物相连。</h1><p>一本书，一位思考的伙伴，一间属于你的书房。<br />从原文出发，让理解慢慢生长。</p><button className="primary" onClick={() => setModal('library')}><Plus size={17}/>导入第一本书</button><button className="text-button" onClick={sample}>先读一份原创导引 <ArrowUpRight size={15}/></button><small>EPUB · TXT · PDF　/　本地保存　/　离线阅读</small></div>}</section>{showRight && <div className="resizer right-resizer" role="separator" aria-label="调整教授宽度" onPointerDown={e => resize('right', e)}/>}<div className={'assistant-container ' + (showRight ? '' : 'desktop-hidden')}><Assistant key={book?.id||'empty'} beforeAsk={flushProgress} book={book} active={active} selection={selection} scope={scope} onScope={s => { setScope(s); notify(s === 'strict' ? '仅向 AI 提供已读位置之前的原文' : s === 'chapter' ? '已允许访问当前章节' : '已允许全书检索与讨论'); }} onJump={jump} notify={notify} onSpeak={setAudio} trigger={analysis} hasKey={settings.hasKey} onSettings={() => setModal('settings')}/></div></main><div className="reader-voice-shortcut">{book && <button onClick={() => setAudio({ id: Date.now(), title: selection ? '朗读选文' : chapter?.title || book.title, parts: selection ? [{ text: selection.text, passageId: selection.passage.id }] : passages.map(p => ({ text: p.text, passageId: p.id })) })}><Volume2 size={15}/>朗读当前{selection ? '选文' : '章节'}</button>}</div><AudioBar request={audio} notify={notify}/><nav className="mobile-nav"><button className={mobile === 'toc' ? 'active' : ''} onClick={() => setMobile(mobile === 'toc' ? '' : 'toc')}><List size={18}/>目录</button><button onClick={() => { setMobile(''); setModal('library'); }}><LibraryBig size={18}/>书房</button><button className={!mobile ? 'active' : ''} onClick={() => setMobile('')}><BookOpen size={18}/>阅读</button><button className={mobile === 'assistant' ? 'active' : ''} onClick={() => setMobile(mobile === 'assistant' ? '' : 'assistant')}><GraduationCap size={18}/>教授</button><button onClick={() => setModal('notes')}><NotebookPen size={18}/>笔记</button></nav>{mobile && <button className="mobile-scrim" aria-label="关闭侧栏" onClick={() => setMobile('')}/>}<button className="mobile-close" aria-label="收起面板" onClick={() => setMobile('')}><X size={18}/></button>{toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={15}/></button></div>}{modal === 'library' && <Library books={books} onOpen={async (id) => { const items = await api<Book[]>('books'); setBooks(items); await openBook(id, items); }} onRefresh={refreshBooks} onClose={() => setModal('')} notify={notify}/>} {modal === 'settings' && <Settings books={books} onClose={() => setModal('')} notify={notify} onChange={loadSettings}/>} {modal === 'research' && <Research books={books} scope={scope} onClose={() => setModal('')} onJump={jump} notify={notify}/>} {['notes', 'profile', 'vocabulary', 'viewpoints'].includes(modal) && <Archive books={books} currentBook={book?.id} initialTab={modal === 'notes' ? 'notes' : modal} onClose={() => setModal('')} onJump={jump} notify={notify}/>} {modal === 'note' && <Modal title="留下一点自己的思考" kicker="IN YOUR OWN WORDS" onClose={() => setModal('')}>{selection && <blockquote>{selection.text}</blockquote>}<input aria-label="笔记主题" placeholder="主题（可选）" value={noteTopic} onChange={e => setNoteTopic(e.target.value)}/><textarea className="note-editor" aria-label="笔记内容" placeholder="此刻，这段文字让你想到了什么？" value={noteText} onChange={e => setNoteText(e.target.value)}/><button className="primary" disabled={!noteText.trim()} onClick={async () => { await api('notes', { bookId: book?.id, passageId: selection?.passage.id || active?.id, quote: selection?.text || '', content: noteText, topic: noteTopic, kind: 'user' }); if (book)
        await loadExtras(book.id); setModal(''); notify('个人笔记已保存'); }}>保存笔记</button></Modal>} {modal === 'appearance' && <Modal title="把书页调成喜欢的样子" onClose={() => setModal('')}><div className="theme-options">{[['light', '清浅'], ['paper', '暖纸'], ['dark', '夜读']].map(([k, v]) => <button key={k} className={'theme-swatch ' + k + (prefs.theme === k ? ' active' : '')} onClick={() => prefs.set({ theme: k as typeof prefs.theme })}><span>Aa</span>{v}</button>)}</div><label className="field">正文字号 · {prefs.fontSize}px<input type="range" min="16" max="30" value={prefs.fontSize} onChange={e => prefs.set({ fontSize: Number(e.target.value) })}/></label><p className="muted">拖动三栏之间的分隔线可调整宽度。沉浸模式会暂时隐藏两侧面板。</p>{book?.format==='txt'&&chapter&&<ChapterEditor book={book} chapter={chapter} active={active} onEdited={async()=>{if(active)await jump({passageId:active.id,bookId:book.id,seq:active.seq,bookTitle:book.title,chapterTitle:chapter.title,quote:'',location:active.location,page:null});notify('目录已更新，原文位置保持稳定');}}/>}</Modal>} {modal === 'search' && <Modal title="回到原文寻找" onClose={() => setModal('')}><form className="research-query" onSubmit={async (e) => { e.preventDefault(); await flushProgress(); setSearchResults(await api('search', { bookIds: book ? [book.id] : books.map(b => b.id), query, scope })); }}><input aria-label="搜索正文" placeholder="输入词语或概念…" value={query} onChange={e => setQuery(e.target.value)}/><button><Search size={17}/></button></form><p className="muted">遵循当前防剧透范围 · 本地全文检索</p>{searchResults?.map(p => <button className="search-result" key={p.id} onClick={() => jump({ passageId: p.id, bookId: p.book_id, seq: p.seq, bookTitle: p.book_title || '', chapterTitle: p.title || '', quote: p.text, location: p.location, page: p.page })}><small>{p.book_title} · {p.title}</small><p>{p.text}</p></button>)}{searchResults?.length === 0 && <Empty>当前允许的阅读范围内没有匹配段落。</Empty>}</Modal>}</div>;
}
function renderHighlight(text: string, quotes: string[]) { const quote = quotes.find(q => text.includes(q)); if (!quote)
    return text; const at = text.indexOf(quote); return <>{text.slice(0, at)}<mark>{quote}</mark>{text.slice(at + quote.length)}</>; }
