'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Book, Chapter, Passage } from '@/lib/types';
import { Busy } from './ui';
export default function OriginalView({ book, chapter, passages, onLocation, onSelection }: {
    book: Book;
    chapter: Chapter;
    passages: Passage[];
    onLocation: (p: Passage, location: string) => void;
    onSelection: (text: string, p: Passage, location?: string) => void;
}) {
    const host = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const rendition = useRef<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const callbacks = useRef({ onLocation, onSelection, passages });
    callbacks.current = { onLocation, onSelection, passages };
    useEffect(() => {
        let disposed = false;
        let cleanup = () => { };
        setLoading(true);
        setError('');
        async function load() {
            try {
                if (book.format === 'pdf') {
                    const pdfjs = await import('pdfjs-dist');
                    pdfjs.GlobalWorkerOptions.workerSrc = '/api/pdf-worker';
                    const task = pdfjs.getDocument({ url: `/api/books/${book.id}/file` });
                    const pdf = await task.promise;
                    if (disposed) {
                        await pdf.destroy();
                        return;
                    }
                    const page = await pdf.getPage(chapter.page || 1);
                    const base = page.getViewport({ scale: 1 });
                    const width = Math.max(260, (host.current?.clientWidth || 700) - 32);
                    const viewport = page.getViewport({ scale: width / base.width });
                    const target = canvas.current;
                    if (!target)
                        return;
                    const dpr = window.devicePixelRatio || 1;
                    target.width = viewport.width * dpr;
                    target.height = viewport.height * dpr;
                    target.style.width = viewport.width + 'px';
                    target.style.height = viewport.height + 'px';
                    const ctx = target.getContext('2d')!;
                    const render = page.render({ canvasContext: ctx, canvas: target, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
                    await render.promise;
                    cleanup = () => { void pdf.destroy(); };
                }
                else {
                    const ePub = (await import('epubjs')).default;
                    const response = await fetch(`/api/books/${book.id}/file`);
                    const epub = ePub(await response.arrayBuffer());
                    if (disposed) {
                        epub.destroy();
                        return;
                    }
                    const r = epub.renderTo(host.current!, { width: '100%', height: 560, spread: 'none', flow: 'paginated', allowScriptedContent: false });
                    rendition.current = r;
                    r.themes.default({ 'body': { 'font-family': 'Georgia, "Songti SC", serif', 'line-height': '1.9', 'padding': '0 20px !important' }, 'img': { 'max-width': '100%' } });
                    r.on('selected', (cfi: string, contents: any) => { const range = contents.range(cfi); const text = range.toString(); const p = callbacks.current.passages.find(p => p.text.includes(text)); if (p && text)
                        callbacks.current.onSelection(text, p, cfi); });
                    r.on('relocated', async (loc: any) => { if (disposed)
                        return; try {
                        const range = await epub.getRange(loc.start.cfi);
                        const text = range?.startContainer?.textContent?.trim() || '';
                        const p = callbacks.current.passages.find(p => text && p.text.includes(text.slice(0, 35))) || callbacks.current.passages[0];
                        if (p)
                            callbacks.current.onLocation(p, loc.start.cfi);
                    }
                    catch { /* CFI still available on the next relocation. */ } });
                    await epub.ready;
                    const spineTarget=(epub as any).path.relative('/'+chapter.href);
                    await r.display(book.location?.startsWith('epubcfi(') && book.chapter_id === chapter.id ? book.location : spineTarget);
                    cleanup = () => { r.destroy(); epub.destroy(); };
                }
                if (!disposed)
                    setLoading(false);
            }
            catch (e) {
                if (!disposed) {
                    setError(e instanceof Error ? e.message : '原版加载失败');
                    setLoading(false);
                }
            }
        }
        void load();
        return () => { disposed = true; cleanup(); rendition.current = null; };
    }, [book.id, book.format, chapter.id, chapter.href, chapter.page]);
    return <div className="original-view"><div ref={host} className="original-host">{book.format === 'pdf' && <canvas ref={canvas} aria-label={`PDF 第 ${chapter.page} 页`}/>}</div>{loading && <Busy text="正在加载原版…"/>}{error && <p className="error">{error}。可切换到文本视图继续阅读。</p>}{book.format === 'epub' && <div className="original-controls"><button onClick={() => rendition.current?.prev()}><ChevronLeft size={16}/>上一页</button><button onClick={() => rendition.current?.next()}>下一页<ChevronRight size={16}/></button></div>}{book.format === 'pdf' && <p className="muted">PDF 原版 · 第 {chapter.page} 页。选择、批注和文本定位请使用文本视图。</p>}</div>;
}
