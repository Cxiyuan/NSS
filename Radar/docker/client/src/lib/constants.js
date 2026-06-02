export const LINK_TYPE_LABELS = {
  url: 'URL',
  domain: 'Domain',
  ip: 'IP Address',
  cidr: 'CIDR Range',
  asn: 'ASN',
};

export const STATUS_LABELS = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  paused: 'Paused',
};

export const STATUS_COLORS = {
  pending: '#f59e0b',
  running: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
  cancelled: '#6b7280',
  paused: '#8b5cf6',
};

export const EMPTY_STATS = {
  total: 0,
  scanned: 0,
  matched: 0,
  errors: 0,
};
