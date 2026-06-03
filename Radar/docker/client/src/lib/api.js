const BASE = '/api';

function getToken() {
  try { return localStorage.getItem('radar_token') || ''; } catch { return ''; }
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const t = getToken();
  if (t) headers['Authorization'] = 'Bearer ' + t;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: (path) => request(path),

  // 下载二进制 blob（用于 PDF 导出等）
  getBlob: async (path) => {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),

  listTasks: (limit, offset) => request(`/tasks?limit=${limit || 20}&offset=${offset || 0}`),

  getTask: (id) => request(`/tasks/${id}`),

  getResults: (id, { domain, page, limit } = {}) => {
    const params = new URLSearchParams();
    if (domain) params.set('domain', domain);
    if (page) params.set('page', page);
    if (limit) params.set('limit', limit);
    return request(`/tasks/${id}/results?${params}`);
  },

  pauseTask: (id) => request(`/tasks/${id}/pause`, { method: 'POST' }),
  resumeTask: (id) => request(`/tasks/${id}/resume`, { method: 'POST' }),
  cancelTask: (id) => request(`/tasks/${id}/cancel`, { method: 'POST' }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  addFilter: (taskId, domain) => request(`/tasks/${taskId}/filters`, { method: 'POST', body: JSON.stringify({ domain }) }),

  getTopDomains: (id, limit = 5) => request(`/tasks/${id}/stats/top-domains?limit=${limit}`),

  getTopUrls: (id, limit = 5) => request(`/tasks/${id}/stats/top-urls?limit=${limit}`),

  getConfig: () => request('/config'),

  updateConfig: (data) => request('/config', { method: 'PUT', body: JSON.stringify(data) }),
};
