export async function api<T = any>(url: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch('/api/' + url, { method: method || (body ? 'POST' : 'GET'), headers: body instanceof FormData ? undefined : body ? { 'Content-Type': 'application/json' } : undefined, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal });
    const result = await response.json();
    if (!response.ok)
        throw new Error(result.error || '请求失败');
    return result;
}
export function download(text: string, filename: string, type = 'text/markdown') { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
