const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
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

  getConfig: () => request('/config'),

  updateConfig: (data) => request('/config', { method: 'PUT', body: JSON.stringify(data) }),
};
