'use client';
import {useEffect,useState} from 'react';
import Markdown from 'react-markdown';
import {api} from '@/lib/client';
import type {Scope,Citation} from '@/lib/types';
import SourceCards from './SourceCards';
export default function SummaryBrowser({bookIds,scope,onJump,notify}:{bookIds:string[];scope:Scope;onJump:(c:Citation)=>void;notify:(s:string)=>void}){
  const [items,setItems]=useState<any[]|null>(null);const [busy,setBusy]=useState(false);
  useEffect(()=>setItems(null),[bookIds.join(','),scope]);
  return <details className="summary-browser"><summary>查看已生成的章节 / 全书摘要</summary><p className="muted">只读取已生成并符合当前防剧透范围的摘要。新的付费任务在设置中手动启动。</p><button className="text-button" disabled={busy||!bookIds.length} onClick={async()=>{setBusy(true);try{const rows=await Promise.all(bookIds.map(id=>api<any[]>('summaries?book='+id+'&scope='+scope)));setItems(rows.flat());}catch(e){notify((e as Error).message);}finally{setBusy(false);}}}>{busy?'读取中…':'读取允许范围内的摘要'}</button>{items?.length===0&&<p className="muted">当前范围内暂无完整摘要；请先完成相应阅读，或在设置里生成摘要。</p>}{items?.map(s=><article key={s.id} className="summary-entry"><span className="eyebrow">{s.level==='book'?'全书综合':'章节综合'} · AI 分析</span><div className="markdown"><Markdown>{s.answer}</Markdown></div><SourceCards citations={s.citations} onJump={onJump}/></article>)}</details>;
}
