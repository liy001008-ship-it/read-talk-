'use client';
import {api} from '@/lib/client';
import type {Book,Chapter,Passage} from '@/lib/types';
export default function ChapterEditor({book,chapter,active,onEdited}:{book:Book;chapter:Chapter;active:Passage|null;onEdited:()=>Promise<void>}){
  return <><div className="section-label">TXT 目录整理</div><p className="muted">先点击需要调整的正文段落，再在这里拆分章节。已有笔记和引用位置会保留。</p><div className="button-row"><button onClick={async()=>{const title=prompt('章节标题',chapter.title);if(title?.trim()){await api('chapters/'+chapter.id,{title},'PATCH');await onEdited();}}}>重命名当前章节</button><button disabled={!active||active.ordinal===0} onClick={async()=>{const newTitle=prompt('在当前段落前新建章节，章节名称');if(newTitle?.trim()&&active){await api('chapters/'+chapter.id,{splitPassageId:active.id,newTitle},'PATCH');await onEdited();}}}>在当前段落前拆章</button></div></>;
}
