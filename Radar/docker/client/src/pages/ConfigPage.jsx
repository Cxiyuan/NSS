import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useToast } from '../components/ToastContext';

export default function ConfigPage() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [proxyError, setProxyError] = useState('');
  const dirtyRef = useRef(false);
  const addToast = useToast();

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  function handleFieldChange(updater) {
    dirtyRef.current = true;
    setConfig(updater);
  }

  function validateProxyUrl(url) {
    if (!url || !url.trim()) return '';
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:', 'socks5:'].includes(parsed.protocol)) {
        return '仅支持 http / https / socks5 协议';
      }
      if (!parsed.hostname) return '代理地址格式无效';
      return '';
    } catch {
      return '代理 URL 格式不正确';
    }
  }

  function handleProxyUrlChange(e) {
    const val = e.target.value;
    handleFieldChange(c => ({
      ...c,
      proxy: { ...c.proxy, url: val },
    }));
    setProxyError(validateProxyUrl(val));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (config.proxy.enabled) {
      const err = validateProxyUrl(config.proxy.url);
      setProxyError(err);
      if (err) return;
    }
    setSaving(true);
    try {
      const updated = await api.updateConfig(config);
      setConfig(updated);
      dirtyRef.current = false;
      addToast('配置已保存', 'success');
    } catch (err) {
      addToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <div className="config-page"><p>加载中...</p></div>;

  return (
    <div className="config-page">
      <div className="config-page__main">
        <h2>系统配置</h2>

        <form onSubmit={handleSave}>
          {/* 代理设置 */}
          <section className="config-section">
            <h3>代理设置</h3>
            <p className="config-section__desc">
              配置 HTTP/HTTPS 代理，隐藏爬虫真实 IP，绕过基于 IP 的 WAF 封禁。
            </p>

            <div className="config-field">
              <label className="config-field__label" htmlFor="config-proxy-enabled">
                <input
                  id="config-proxy-enabled"
                  type="checkbox"
                  checked={config.proxy.enabled}
                  onChange={e => handleFieldChange(c => ({
                    ...c,
                    proxy: { ...c.proxy, enabled: e.target.checked },
                  }))}
                />
                启用代理
              </label>
            </div>

            {config.proxy.enabled && (
              <div className="config-field">
                <label htmlFor="config-proxy-url">代理地址</label>
                <input
                  id="config-proxy-url"
                  type="text"
                  value={config.proxy.url}
                  onChange={handleProxyUrlChange}
                  placeholder="http://用户名:密码@代理IP:端口"
                  className={proxyError ? 'config-field__input--error' : ''}
                  aria-invalid={!!proxyError}
                  aria-describedby={proxyError ? 'config-proxy-url-error config-proxy-url-hint' : 'config-proxy-url-hint'}
                />
                {proxyError && (
                  <span id="config-proxy-url-error" className="config-field__error">{proxyError}</span>
                )}
                <span id="config-proxy-url-hint" className="config-field__hint">
                  支持 HTTP/SOCKS5，格式: protocol://user:pass@host:port
                </span>
              </div>
            )}
          </section>

          {/* 反检测设置 */}
          <section className="config-section">
            <h3>反检测引擎</h3>
            <p className="config-section__desc">
              模拟真实浏览器行为，轮换 User-Agent，随机延迟，重试机制，规避 WAF 检测。
            </p>

            <div className="config-field">
              <label className="config-field__label" htmlFor="config-ua-rotation">
                <input
                  id="config-ua-rotation"
                  type="checkbox"
                  checked={config.antiDetect.uaRotation}
                  onChange={e => handleFieldChange(c => ({
                    ...c,
                    antiDetect: { ...c.antiDetect, uaRotation: e.target.checked },
                  }))}
                />
                UA 轮换
              </label>
              <span id="config-ua-rotation-hint" className="config-field__hint">
                每次请求随机切换 20+ 个真实浏览器 User-Agent
              </span>
            </div>

            <div className="config-field">
              <label className="config-field__label" htmlFor="config-browser-fallback">
                <input
                  id="config-browser-fallback"
                  type="checkbox"
                  checked={config.antiDetect.browserFallback}
                  onChange={e => handleFieldChange(c => ({
                    ...c,
                    antiDetect: { ...c.antiDetect, browserFallback: e.target.checked },
                  }))}
                />
                Puppeteer 浏览器回退
              </label>
              <span id="config-browser-fallback-hint" className="config-field__hint">
                HTTP 请求返回 403 时自动切换真实浏览器渲染
              </span>
            </div>

            <div className="config-field">
              <span id="config-request-delay-label" className="config-field__label">请求延迟范围（毫秒）</span>
              <div className="config-field__row" role="group" aria-labelledby="config-request-delay-label">
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={config.antiDetect.requestDelay.min}
                  onChange={e => handleFieldChange(c => ({
                    ...c,
                    antiDetect: {
                      ...c.antiDetect,
                      requestDelay: { ...c.antiDetect.requestDelay, min: Number(e.target.value) },
                    },
                  }))}
                  aria-label="最小延迟毫秒"
                />
                <span aria-hidden="true">—</span>
                <input
                  type="number"
                  min={0}
                  max={30000}
                  value={config.antiDetect.requestDelay.max}
                  onChange={e => handleFieldChange(c => ({
                    ...c,
                    antiDetect: {
                      ...c.antiDetect,
                      requestDelay: { ...c.antiDetect.requestDelay, max: Number(e.target.value) },
                    },
                  }))}
                  aria-label="最大延迟毫秒"
                />
                <span aria-hidden="true">ms</span>
              </div>
              <span className="config-field__hint">
                每次请求随机延迟 [min, max] 范围，含 ±20% 抖动。建议 800-2500ms
              </span>
            </div>

            <div className="config-field">
              <label htmlFor="config-max-retries">最大重试次数</label>
              <input
                id="config-max-retries"
                type="number"
                min={0}
                max={10}
                value={config.antiDetect.maxRetries}
                onChange={e => handleFieldChange(c => ({
                  ...c,
                  antiDetect: { ...c.antiDetect, maxRetries: Number(e.target.value) },
                }))}
              />
              <span className="config-field__hint">
                失败后指数退避重试（1s → 2s → 4s ...），0 为不重试
              </span>
            </div>
          </section>

          <button type="submit" className="config-page__save" disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </form>
      </div>
    </div>
  );
}
