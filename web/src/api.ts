import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'x-csrf': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'server_error', data?.issues);
  return data as T;
}

export const GET = <T = any>(p: string) => api<T>('GET', p);
export const POST = <T = any>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const PUT = <T = any>(p: string, b: unknown = {}) => api<T>('PUT', p, b);
export const DEL = <T = any>(p: string) => api<T>('DELETE', p);

/** Loads data for a screen with explicit loading / error / data states. */
export function useApi<T = any>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: !!path });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await GET<T>(path);
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (e) {
      if (n === seq.current) setState((s) => ({ ...s, error: e as ApiError, loading: false }));
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load, setData: (d: T) => setState((s) => ({ ...s, data: d })) };
}

/**
 * Uploads a file to a media record with progress. On failure the server marks the record as
 * failed and the same record can be retried.
 */
export function uploadFile(mediaId: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/media/${mediaId}/file`);
    xhr.setRequestHeader('x-csrf', '1');
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let code = 'upload_failed';
        try {
          code = JSON.parse(xhr.responseText).error ?? code;
        } catch { /* keep default */ }
        reject(new ApiError(xhr.status, code));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'upload_interrupted'));
    xhr.onabort = () => reject(new ApiError(0, 'upload_interrupted'));
    xhr.send(file);
  });
}

export const mediaUrl = (id: string) => `/api/media/${id}/file`;
