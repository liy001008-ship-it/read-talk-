import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
for (const d of ['books', 'audio', 'backups'])
    fs.mkdirSync(path.join(/* turbopackIgnore: true */ dataDir, d), { recursive: true, mode: 0o700 });
const globalDb = globalThis as unknown as {
    betweenDb?: DatabaseSync;
};
export const db = globalDb.betweenDb ||= new DatabaseSync(path.join(dataDir, 'between-pages.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
const version = (db.prepare('PRAGMA user_version').get() as {
    user_version: number;
}).user_version;
if (version < 1) {
    db.exec(fs.readFileSync(path.join(process.cwd(), "migrations/001_initial.sql"), "utf8"));
}
export function all<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T[] { return db.prepare(sql).all(...params) as T[]; }
export function one<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T | undefined { return db.prepare(sql).get(...params) as T | undefined; }
export function run(sql: string, ...params: (string | number | null)[]) { return db.prepare(sql).run(...params); }
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const hash = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
export function transaction<T>(fn: () => T): T { db.exec('BEGIN IMMEDIATE'); try {
    const result = fn();
    db.exec('COMMIT');
    return result;
}
catch (e) {
    db.exec('ROLLBACK');
    throw e;
} }
export function setting(key: string, fallback = '') { return one<{
    value: string;
}>('SELECT value FROM app_settings WHERE key=?', key)?.value ?? fallback; }
export function setSetting(key: string, value: string) { run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value); }
