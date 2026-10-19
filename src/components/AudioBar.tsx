'use client';
import { useEffect, useRef, useState } from 'react';
import { Headphones, Play, Pause, Square, SkipForward, Volume2 } from 'lucide-react';
import { api } from '@/lib/client';
import { IconButton } from './ui';
export type AudioRequest = {
    id: number;
    title: string;
    parts: {
        text: string;
        voice?: string;
        passageId?: string;
    }[];
    ai?: boolean;
};
export default function AudioBar({ request, notify }: {
    request: AudioRequest | null;
    notify: (s: string) => void;
}) {
    const [engine, setEngine] = useState('system');
    const [voice, setVoice] = useState('nova');
    const [speed, setSpeed] = useState(1);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('等待一段值得倾听的文字');
    const [title, setTitle] = useState('原文朗读与教授讲解');
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const audio = useRef<HTMLAudioElement | null>(null);
    const abort = useRef<AbortController | null>(null);
    const queue = useRef<{
        text: string;
        voice?: string;
        passageId?: string;
    }[]>([]);
    const index = useRef(0);
    const session = useRef(0);
    const rate = useRef(1);
    rate.current = speed;
    const activeEngine = useRef('system');
    const paused = useRef(false);
    const currentTitle = useRef('');
    useEffect(() => { function update() { setVoices(window.speechSynthesis?.getVoices() || []); } update(); window.speechSynthesis?.addEventListener('voiceschanged', update); return () => { stop(); window.speechSynthesis?.removeEventListener('voiceschanged', update); }; }, []);
    function stop() { session.current++; abort.current?.abort(); window.speechSynthesis?.cancel(); if (audio.current) {
        audio.current.pause();
        audio.current.src = '';
    } paused.current = false; setPlaying(false); }
    async function playChunk(token: number) {
        if (token !== session.current)
            return;
        if (index.current >= queue.current.length) {
            setProgress(100);
            setPlaying(false);
            setStatus('播放完成');
            return;
        }
        const p = queue.current[index.current];
        setProgress(index.current / queue.current.length * 100);
        setPlaying(true);
        if (activeEngine.current === 'ai') {
            setStatus(`生成 / 读取缓存 · ${index.current + 1}/${queue.current.length}`);
            abort.current = new AbortController();
            try {
                const r = await api('tts', { text: p.text, voice: p.voice || voice, passageId: p.passageId }, undefined, abort.current.signal);
                if (token !== session.current)
                    return;
                const a = new Audio('/api/audio/' + r.id);
                audio.current = a;
                a.playbackRate = rate.current;
                a.ontimeupdate = () => { if (a.duration)
                    setProgress((index.current + a.currentTime / a.duration) / queue.current.length * 100); };
                a.onended = () => { index.current++; void playChunk(token); };
                a.onerror = () => { notify('音频播放失败，可重新播放缓存'); setPlaying(false); };
                setStatus(`AI 语音 · ${index.current + 1}/${queue.current.length}`);
                if (!paused.current)
                    await a.play();
                else
                    setPlaying(false);
            }
            catch (e) {
                if ((e as Error).name !== 'AbortError') {
                    notify((e as Error).message);
                    setStatus('语音生成失败，可重新尝试');
                }
                setPlaying(false);
            }
        }
        else {
            if (!('speechSynthesis' in window)) {
                notify('浏览器不支持系统朗读，请切换 AI 语音');
                setPlaying(false);
                return;
            }
            const utterance = new SpeechSynthesisUtterance(p.text);
            utterance.lang = /[\u4e00-\u9fff]/.test(p.text) ? 'zh-CN' : 'en-US';
            utterance.rate = rate.current;
            const desired = voices.find(v => v.name === voice) || voices.find(v => v.lang.startsWith(utterance.lang.slice(0, 2)));
            if (desired)
                utterance.voice = desired;
            utterance.onend = () => { if (token === session.current) {
                index.current++;
                void playChunk(token);
            } };
            utterance.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted') {
                notify('系统朗读失败：' + e.error);
                setPlaying(false);
            } };
            setStatus(`系统朗读 · ${index.current + 1}/${queue.current.length}`);
            window.speechSynthesis.speak(utterance);
        }
    }
    function start(r: AudioRequest) { stop(); const token = session.current; queue.current = r.parts.flatMap(p => { const chunks = []; let s = p.text.replace(/[#*_`|]/g, ''); while (s.length) {
        let n = 800;
        if (s.length > 800) {
            const at = Math.max(s.lastIndexOf('。', 800), s.lastIndexOf('. ', 800));
            if (at > 200)
                n = at + 1;
        }
        chunks.push({ ...p, text: s.slice(0, n) });
        s = s.slice(n);
    } return chunks; }); index.current = 0; activeEngine.current = r.ai ? 'ai' : engine; currentTitle.current = r.title; setTitle(r.title); setProgress(0); paused.current = false; void playChunk(token); }
    useEffect(() => { if (request)
        start(request); }, [request?.id]);
    function toggle() { if (!queue.current.length) {
        notify('请先点击正文朗读或教授回答的“朗读”');
        return;
    } if (playing) {
        paused.current = true;
        window.speechSynthesis?.pause();
        audio.current?.pause();
        setPlaying(false);
        setStatus('已暂停');
    }
    else {
        paused.current = false;
        if (activeEngine.current === 'system' && window.speechSynthesis?.paused)
            window.speechSynthesis.resume();
        else if (audio.current?.src && audio.current.paused)
            void audio.current.play();
        else
            void playChunk(session.current);
        setPlaying(true);
    } }
    return <footer className="audio-bar"><div className="audio-label"><div className="audio-symbol"><Headphones size={20}/></div><div><strong>{title}</strong><small>{status}</small></div></div><div className="playback-controls"><IconButton title={playing ? '暂停朗读' : '继续朗读'} onClick={toggle}>{playing ? <Pause size={18}/> : <Play size={18}/>}</IconButton><IconButton title="停止朗读并取消生成" onClick={() => { stop(); queue.current = []; setStatus('已停止'); }}><Square size={14}/></IconButton><IconButton title="下一段" onClick={() => { if (!queue.current.length)
        return; stop(); index.current++; void playChunk(session.current); }}><SkipForward size={17}/></IconButton></div><div className="audio-progress"><input aria-label="音频段落进度" type="range" min="0" max="100" value={progress} onChange={e => { if (!queue.current.length)
        return; stop(); index.current = Math.min(queue.current.length - 1, Math.floor(Number(e.target.value) / 100 * queue.current.length)); void playChunk(session.current); }}/><small>{Math.round(progress)}%</small></div><div className="audio-options"><select aria-label="语音引擎" value={engine} onChange={e => setEngine(e.target.value)}><option value="system">系统朗读 · 免费</option><option value="ai">AI 语音 · 可缓存</option></select><select aria-label="语音声音" value={voice} onChange={e => setVoice(e.target.value)}>{engine === 'system' ? <><option value="nova">自动中英声音</option>{voices.map((v, i) => <option key={i} value={v.name}>{v.name}</option>)}</> : ['nova', 'onyx', 'alloy', 'echo', 'fable', 'shimmer'].map(v => <option key={v}>{v}</option>)}</select><select aria-label="播放速度" value={speed} onChange={e => { const n = Number(e.target.value); setSpeed(n); if (audio.current)
        audio.current.playbackRate = n; }}>{[0.75, 1, 1.25, 1.5, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select></div></footer>;
}
