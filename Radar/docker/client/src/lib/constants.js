export const LINK_TYPE_LABELS = {
  a: '超链接',
  img: '图片',
  link: '资源引用',
  iframe: '内嵌框架',
  form: '表单',
  meta: '页面跳转',
  script: '脚本',
  js_dynamic: 'JS动态',
  css: '样式表',
  comment: '注释',
  keyword_match: '关键词匹配',
};

export const STATUS_LABELS = {
  pending: '等待中',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
  error: '错误',
  failed: '错误',
  cancelled: '已取消',
};

export const STATUS_COLORS = {
  pending: '#f59e0b',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
  failed: '#ef4444',
  cancelled: '#6b7280',
  paused: '#8b5cf6',
};

export const RISK_LABELS = {
  'free-tld': { label: '免费域名', color: '#f59e0b', icon: '⚠' },
  'bare-ip': { label: 'IP直连', color: '#f59e0b', icon: '⚠' },
  'porn:1': { label: '涉黄', color: '#dc2626', icon: '🔴' },
  'gambling:1': { label: '涉赌', color: '#dc2626', icon: '🔴' },
  'drugs:1': { label: '涉毒', color: '#dc2626', icon: '🔴' },
  'blackhat:1': { label: '黑产', color: '#dc2626', icon: '🔴' },
  'no-icp': { label: '未备案', color: '#f59e0b', icon: '⚠' },
};

export const EMPTY_STATS = {
  crawled: 0,
  total: 0,
  external: 0,
  depth: 0,
  filtered: 0,
};
