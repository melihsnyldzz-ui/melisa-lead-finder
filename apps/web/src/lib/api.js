const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function createRequestSignal({ signal, timeoutMs } = {}) {
  if (!timeoutMs) return signal;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new Error('Istek zaman asimina ugradi')), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeout),
  };
}

async function parseResponseError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
}

export async function apiGet(path) {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(await parseResponseError(response));
  return response.json();
}

export async function apiPost(path, body, options = {}) {
  const requestSignal = createRequestSignal(options);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: requestSignal?.signal || options.signal,
    });
    if (!response.ok) throw new Error(await parseResponseError(response));
    return response.json();
  } catch (err) {
    if (err.name === 'AbortError' || options.signal?.aborted) {
      throw new Error('Arama zaman asimina ugradi veya durduruldu.');
    }
    throw err;
  } finally {
    requestSignal?.clear?.();
  }
}

export async function apiPatch(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseResponseError(response));
  return response.json();
}

export function exportCsvUrl(query = '') {
  return `${API_URL}/leads/export.csv${query ? `?${query}` : ''}`;
}
