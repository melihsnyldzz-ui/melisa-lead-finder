const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function apiGet(path) {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiPatch(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function exportCsvUrl(query = '') {
  return `${API_URL}/leads/export.csv${query ? `?${query}` : ''}`;
}
