import {embedMany} from 'ai';
import {all,one,run,id,now} from './db';
import {config} from './settings';
import {provider,generateAnalysis} from './ai';
import type {Passage,Citation} from './types';
type Job={id:string;book_id:string;kind:string;status:string;cursor:number;total:number;error:string};
type Summary={answer:string;citations:Citation[];ceiling:number};
const globalJobs=globalThis as unknown as {betweenJobs?:Map<string,AbortController>};
const active=globalJobs.betweenJobs ||= new Map<string,AbortController>();
export function recoverJobs(){for(const j of all<Job>("SELECT * FROM analysis_jobs WHERE status='running'"))if(!active.has(j.id))run("UPDATE analysis_jobs SET status='paused',error='应用重启后已暂停，可断点继续' WHERE id=?",j.id);}
export function cancelJob(jobId:string){active.get(jobId)?.abort();run("UPDATE analysis_jobs SET status='paused',updated_at=? WHERE id=?",now(),jobId);}
export function startJob(bookId:string,kind:string){
  provider();if(!['embedding','summary'].includes(kind))throw new Error('未知任务');
  if(all<Job>("SELECT * FROM analysis_jobs WHERE book_id=? AND status='running'",bookId).length)throw new Error('已有运行中的任务，请先暂停');
  const count=one<{n:number}>('SELECT count(*) n FROM passages WHERE book_id=?',bookId)?.n||0;if(!count)throw new Error('书籍不存在');
  const jobId=id();run('INSERT INTO analysis_jobs VALUES(?,?,?,?,?,?,?,?,?)',jobId,bookId,kind,'paused',0,count,'',now(),now());resumeJob(jobId);return jobId;
}
export function resumeJob(jobId:string){
  if(active.has(jobId))return;
  const job=one<Job>('SELECT * FROM analysis_jobs WHERE id=?',jobId);if(!job)throw new Error('任务不存在');
  if(all<Job>("SELECT * FROM analysis_jobs WHERE book_id=? AND status='running' AND id<>?",job.book_id,jobId).length)throw new Error('这本书已有运行中的任务');
  provider();
  if(job.kind==='embedding'&&one('SELECT p.id FROM passages p LEFT JOIN embeddings e ON e.hash=p.hash AND e.model=? WHERE p.book_id=? AND p.seq<? AND e.hash IS NULL LIMIT 1',config().embeddingModel,job.book_id,job.cursor)){job.cursor=0;run('UPDATE analysis_jobs SET cursor=0 WHERE id=?',jobId);}
  const controller=new AbortController();active.set(jobId,controller);run("UPDATE analysis_jobs SET status='running',error='',updated_at=? WHERE id=?",now(),jobId);
  void processJob(job,controller).finally(()=>active.delete(jobId));
}
async function reduceSummaries(job:Job,chapterId:string|null,parts:Summary[],raw:Passage[],signal:AbortSignal):Promise<Summary>{
  let current=parts;let round=0;
  if(!current.length)throw new Error('没有可汇总的片段');
  while(current.length>1){const next:Summary[]=[];
    for(let at=0;at<current.length;at+=5){signal.throwIfAborted();const group=current.slice(at,at+5);const summaryId=`${job.id}:reduce:${chapterId||'book'}:${round}:${at}`;
      const cached=one<{content:string;ceiling:number}>('SELECT content,ceiling FROM summaries WHERE id=?',summaryId);if(cached){next.push({...JSON.parse(cached.content),ceiling:cached.ceiling});continue;}
      const ceiling=Math.max(...group.map(p=>p.ceiling));const ids=new Set(group.flatMap(p=>p.citations.map(c=>c.passageId)));let evidence=raw.filter(p=>ids.has(p.id)).slice(0,12);if(!evidence.length)evidence=raw.filter(p=>p.seq<=ceiling).slice(0,6);
      const result=await generateAnalysis({question:`将以下 AI 片段摘要综合为${chapterId?'章节':'全书'}分析，说明核心论点、结构、概念关系、主要张力和开放问题。草稿不是原文，不可当作直接引文；引用只能来自另附的原文证据。\n${group.map((p,i)=>`片段 ${i+1}：${p.answer.slice(0,2800)}`).join('\n')}`,professor:'interdisciplinary',mode:'chapter',sources:evidence,signal,instruction:'这是有界分层汇总步骤。明确哪些判断来自摘要综合，哪些有直接引文核验。'});
      run('INSERT OR REPLACE INTO summaries VALUES(?,?,?,?,?,?)',summaryId,job.book_id,chapterId,'reduce',ceiling,JSON.stringify(result));next.push({...result,ceiling});
    }
    current=next;round++;
  }
  return current[0];
}
async function processJob(job:Job,controller:AbortController){
  try{
    const c=config();const passages=all<Passage&{hash:string}>('SELECT p.*,c.title,b.title book_title FROM passages p JOIN chapters c ON c.id=p.chapter_id JOIN books b ON b.id=p.book_id WHERE p.book_id=? ORDER BY p.seq',job.book_id);
    for(let at=job.cursor;at<passages.length;){
      controller.signal.throwIfAborted();let batch=passages.slice(at,at+(job.kind==='embedding'?12:8));if(job.kind==='summary')batch=batch.filter(p=>p.chapter_id===batch[0].chapter_id);
      if(job.kind==='embedding'){
        const missing=[...new Map(batch.filter(p=>!one('SELECT hash FROM embeddings WHERE hash=? AND model=?',p.hash,c.embeddingModel)).map(p=>[p.hash,p])).values()];
        if(missing.length){const result=await embedMany({model:provider().embedding(c.embeddingModel),values:missing.map(p=>p.text),abortSignal:controller.signal,maxRetries:1});for(let i=0;i<missing.length;i++)run('INSERT OR REPLACE INTO embeddings VALUES(?,?,?)',missing[i].hash,c.embeddingModel,JSON.stringify(result.embeddings[i]));run('INSERT INTO usage_log VALUES(?,?,?,?,?,?)',id(),'book embedding',c.embeddingModel,result.usage.tokens,0,now());}
      }else{
        const result=await generateAnalysis({question:'概括这些段落的概念、论点、语言特点和关系，保留来源编号；不要超出资料范围。',professor:'interdisciplinary',mode:'chapter',sources:batch,signal:controller.signal});
        run('INSERT OR REPLACE INTO summaries VALUES(?,?,?,?,?,?)',`${job.id}:${at}`,job.book_id,batch[0].chapter_id,'passage',batch[batch.length-1].seq,JSON.stringify(result));
      }
      at+=batch.length;run('UPDATE analysis_jobs SET cursor=?,updated_at=? WHERE id=?',at,now(),job.id);await new Promise(resolve=>setTimeout(resolve,30));
    }
    if(job.kind==='summary'){
      const chapterSummaries:Summary[]=[];
      for(const chapter of all<{id:string}>('SELECT id FROM chapters WHERE book_id=? ORDER BY ordinal',job.book_id)){
        controller.signal.throwIfAborted();const parts=all<{content:string;ceiling:number}>('SELECT content,ceiling FROM summaries WHERE book_id=? AND chapter_id=? AND level=? AND id LIKE ? ORDER BY ceiling',job.book_id,chapter.id,'passage',job.id+':%').map(s=>({...JSON.parse(s.content),ceiling:s.ceiling}));
        if(!parts.length)continue;const result=await reduceSummaries(job,chapter.id,parts,passages.filter(p=>p.chapter_id===chapter.id),controller.signal);
        run('INSERT OR REPLACE INTO summaries VALUES(?,?,?,?,?,?)',`${job.id}:chapter:${chapter.id}`,job.book_id,chapter.id,'chapter',result.ceiling,JSON.stringify(result));chapterSummaries.push(result);
      }
      const full=await reduceSummaries(job,null,chapterSummaries,passages,controller.signal);
      run('INSERT OR REPLACE INTO summaries VALUES(?,?,?,?,?,?)',`${job.id}:book`,job.book_id,null,'book',passages.length-1,JSON.stringify(full));
    }
    run("UPDATE analysis_jobs SET status='completed',updated_at=? WHERE id=?",now(),job.id);
  }catch(e){const cancelled=controller.signal.aborted;run('UPDATE analysis_jobs SET status=?,error=?,updated_at=? WHERE id=?',cancelled?'paused':'failed',cancelled?'已暂停，可继续':e instanceof Error?e.message:'任务失败',now(),job.id);}
}
