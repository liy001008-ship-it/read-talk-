'use client';
import { X, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
export function IconButton({ title, onClick, children, active = false, disabled = false }: {
    title: string;
    onClick: () => void;
    children: ReactNode;
    active?: boolean;
    disabled?: boolean;
}) { return <button type="button" className={'icon-button ' + (active ? 'active' : '')} title={title} aria-label={title} onClick={onClick} disabled={disabled}>{children}</button>; }
export function Modal({ title, kicker, children, onClose, wide = false }: {
    title: string;
    kicker?: string;
    children: ReactNode;
    onClose: () => void;
    wide?: boolean;
}) { return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget)
    onClose(); }} onKeyDown={e => { if (e.key === 'Escape')
    onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className={'modal ' + (wide ? 'wide' : '')}><header><div><span className="eyebrow">{kicker || 'BETWEEN PAGES'}</span><h2>{title}</h2></div><IconButton title="关闭" onClick={onClose}><X size={20}/></IconButton></header><div className="modal-body">{children}</div></section></div>; }
export function Busy({ text = '正在处理…' }: {
    text?: string;
}) { return <span className="busy"><Loader2 size={16} className="spin"/>{text}</span>; }
export function Empty({ children }: {
    children: ReactNode;
}) { return <div className="empty-small">{children}</div>; }
