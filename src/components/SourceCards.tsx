'use client';
import type { Citation } from '@/lib/types';
import { ArrowUpRight } from 'lucide-react';
export default function SourceCards({ citations, onJump }: {
    citations: Citation[];
    onJump: (c: Citation) => void;
}) { if (!citations.length)
    return null; return <div className="sources"><span className="eyebrow">已核验的原文依据</span>{citations.map((c, i) => <button key={i} onClick={() => onJump(c)} className="source-card"><span className="source-number">{i + 1}</span><span><strong>{c.bookTitle} · {c.chapterTitle}</strong><q>{c.quote}</q><small>{c.page ? `PDF 第 ${c.page} 页` : c.location}</small></span><ArrowUpRight size={14}/></button>)}</div>; }
