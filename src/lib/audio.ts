import fs from 'node:fs';
import path from 'node:path';
import { config } from './settings';
import { dataDir, hash, run, one, id, now } from './db';
export async function speech(text: string, voice: string, passageId: string | null, signal: AbortSignal) {
    const c = config();
    if (!c.apiKey)
        throw new Error('AI 语音需要 API Key；也可使用阅读器的系统朗读');
    if (!text.trim() || text.length > 1800)
        throw new Error('单段音频需要 1–1800 个字符');
    if (!['alloy', 'nova', 'onyx', 'shimmer', 'echo', 'fable'].includes(voice))
        throw new Error('无效声音');
    const digest = hash(JSON.stringify([text, voice, c.ttsModel, c.baseURL]));
    const cached = one<{
        id: string;
        file_path: string;
    }>('SELECT id,file_path FROM audio_cache WHERE text_hash=?', digest);
    if (cached && fs.existsSync(path.join(dataDir, cached.file_path)))
        return cached.id;
    const res = await fetch(c.baseURL + '/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: c.ttsModel, input: text, voice, response_format: 'mp3' }), signal });
    if (!res.ok)
        throw new Error(`语音服务错误 ${res.status}，请检查模型、额度和设置`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const audioId = id(), filePath = `audio/${audioId}.mp3`;
    fs.writeFileSync(path.join(dataDir, filePath), buffer, { mode: 0o600 });
    run('INSERT INTO audio_cache VALUES(?,?,?,?,?,?,?)', audioId, digest, voice, c.ttsModel, filePath, passageId, now());
    return audioId;
}
