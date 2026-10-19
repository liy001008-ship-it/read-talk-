import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir, setting, setSetting } from './db';
function key() { const p = path.join(dataDir, '.secret-key'); if (!fs.existsSync(p))
    fs.writeFileSync(p, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' }); return fs.readFileSync(p); }
function encrypt(value: string) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv); return JSON.stringify({ iv: iv.toString('hex'), body: Buffer.concat([c.update(value, 'utf8'), c.final()]).toString('hex'), tag: c.getAuthTag().toString('hex') }); }
function decrypt(value: string) { try {
    const v = JSON.parse(value), d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(v.iv, 'hex'));
    d.setAuthTag(Buffer.from(v.tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(v.body, 'hex')), d.final()]).toString('utf8');
}
catch {
    return '';
} }
export function config() { const encrypted = setting('apiKey'); return { apiKey: encrypted ? decrypt(encrypted) : process.env.OPENAI_API_KEY || '', baseURL: setting('baseURL', process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'), chatModel: setting('chatModel', process.env.CHAT_MODEL || 'gpt-4.1-mini'), embeddingModel: setting('embeddingModel', process.env.EMBEDDING_MODEL || 'text-embedding-3-small'), ttsModel: setting('ttsModel', process.env.TTS_MODEL || 'gpt-4o-mini-tts'), maxTokens: Number(setting('maxTokens', '1800')), inputPrice: Number(setting('inputPrice', '0')), outputPrice: Number(setting('outputPrice', '0')), scope: setting('scope', 'strict'), teaching: setting('teaching', 'off') }; }
export function publicConfig() { const { apiKey, ...rest } = config(); return { ...rest, hasKey: !!apiKey }; }
export function saveConfig(body: Record<string, unknown>) {
    if (typeof body.apiKey === 'string' && body.apiKey.trim())
        setSetting('apiKey', encrypt(body.apiKey.trim()));
    if (body.clearKey === true)
        setSetting('apiKey', '');
    if (typeof body.baseURL === 'string') {
        const u = new URL(body.baseURL);
        if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
            throw new Error('Base URL 无效');
        if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
            throw new Error('非本地 API 请使用 HTTPS');
        setSetting('baseURL', u.toString().replace(/\/$/, ''));
    }
    for (const k of ['chatModel', 'embeddingModel', 'ttsModel', 'scope', 'teaching'])
        if (typeof body[k] === 'string')
            setSetting(k, String(body[k]).slice(0, 200));
    for (const k of ['maxTokens', 'inputPrice', 'outputPrice'])
        if (body[k] !== undefined) {
            const n = Number(body[k]);
            if (!Number.isFinite(n) || n < 0 || (k === 'maxTokens' && (n < 128 || n > 16000)))
                throw new Error('预算数值无效');
            setSetting(k, String(n));
        }
    return publicConfig();
}
