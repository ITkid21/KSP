const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('ksp_token');
}

function getHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    console.warn('[API] Failed to parse JSON response for', endpoint, err.message, 'raw:', text);
    data = { error: text || 'Invalid JSON response' };
  }
  if (res.status === 401 || res.status === 403) {
    console.warn('[API] Unauthorized response for', endpoint, res.status, data.error || text);
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const auth = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  getUsers: () => request('/auth/users'),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
};

export const crime = {
  getSummary: () => request('/crime/summary'),
  getRecords: (params) => request(`/crime/records?${new URLSearchParams(params)}`),
  getByMonth: (year) => request(`/crime/by-month${year ? `?year=${year}` : ''}`),
  getByCategory: (year, limit) => request(`/crime/by-category?${new URLSearchParams({ ...(year ? { year } : {}), ...(limit ? { limit } : {}) })}`),
  getGrowthTrends: () => request('/crime/growth-trends'),
  getDistrictWise: () => request('/crime/district-wise'),
  getYears: () => request('/crime/years'),
  getMajorHeads: () => request('/crime/major-heads'),
};

export const map = {
  getLocations: (params) => request(`/map/locations?${new URLSearchParams(params || {})}`),
  getHotspots: (params) => request(`/map/hotspots?${new URLSearchParams(params || {})}`),
  getHeatmapData: (crimeType) => request(`/map/heatmap-data${crimeType ? `?crime_type=${crimeType}` : ''}`),
  getClusters: () => request('/map/clusters'),
  getDistricts: () => request('/map/districts'),
  getCrimeTypes: () => request('/map/crime-types'),
};

export const predictions = {
  getAll: (params) => request(`/predictions?${new URLSearchParams(params || {})}`),
  generate: () => request('/predictions/generate', { method: 'POST' }),
  getSummary: () => request('/predictions/summary'),
};

export const analytics = {
  getOverview: () => request('/analytics/overview'),
  getCategoryBreakdown: (year) => request(`/analytics/category-breakdown${year ? `?year=${year}` : ''}`),
  getSeverityAnalysis: () => request('/analytics/severity-analysis'),
  getYearComparison: () => request('/analytics/year-comparison'),
  getAuditLogs: (page) => request(`/analytics/audit-logs?page=${page || 1}`),
};

export const reports = {
  getMonthly: (year, month) => request(`/reports/monthly?year=${year}&month=${month}`),
  getYearly: (year) => request(`/reports/yearly?year=${year}`),
  getDistrict: (district) => request(`/reports/district?district=${district}`),
  getCategory: (category) => request(`/reports/category?category=${encodeURIComponent(category)}`),
};

export const ai = {
  getInsights: () => request('/ai/insights'),
  generateInsights: () => request('/ai/generate-insights', { method: 'POST' }),
};

export const hotspots = {
  getAll:     ()  => request('/hotspots'),
  getSummary: ()  => request('/hotspots/summary'),
  getClusters: () => request('/hotspots/clusters'),
};

// ─── Import API ───────────────────────────────────────────────────────────────
// Does NOT use the shared request() helper for /upload because that helper
// injects Content-Type: application/json, which would corrupt multipart bodies.

async function requestFormData(endpoint, formData) {
  const token = getToken();
  const res   = await fetch(`${API_BASE}${endpoint}`, {
    method:  'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body:    formData,           // browser sets multipart boundary automatically
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    console.warn('[API] Failed to parse JSON response for', endpoint, err.message, 'raw:', text);
    data = { error: text || 'Invalid JSON response' };
  }
  if (res.status === 401 || res.status === 403) {
    console.warn('[API] Unauthorized response for', endpoint, res.status, data.error || text);
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export const importApi = {
  /** Upload a File object to the configured storage backend. Returns { file_id, folder_id, filename, size_bytes }. */
  upload(file) {
    const fd = new FormData();
    fd.append('csv', file);
    return requestFormData('/import/upload', fd);
  },

  /** Validate a previously uploaded CSV. Returns preview + stats. */
  validate(file_id, folder_id) {
    return request('/import/validate', {
      method: 'POST',
      body:   JSON.stringify({ file_id, folder_id }),
    });
  },

  /** Start the import. Returns full summary. */
  start(file_id, folder_id, filename, skip_duplicates = false) {
    return request('/import/start', {
      method: 'POST',
      body:   JSON.stringify({ file_id, folder_id, filename, skip_duplicates }),
    });
  },
};

