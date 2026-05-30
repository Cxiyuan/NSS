import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function ConfigPage() {
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    try {
      const updated = await api.updateConfig(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
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
              <label className="config-field__label">
                <input
                  type="checkbox"
                  checked={config.proxy.enabled}
                  onChange={e => setConfig(c => ({
                    ...c,
                    proxy: { ...c.proxy, enabled: e.target.checked },
                  }))}
                />
                启用代理
              </label>
            </div>

            {config.proxy.enabled && (
              <div className="config-field">
                <label>代理地址</label>
                <input
                  type="text"
                  value={config.proxy.url}
                  onChange={e => setConfig(c => ({
                    ...c,
                    proxy: { ...c.proxy, url: e.target.value },
                  }))}
                  placeholder="http://用户名:密码@代理IP:端口"
                />
                <span className="config-field__hint">
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
              <label className="config-field__label">
                <input
                  type="checkbox"
                  checked={config.antiDetect.uaRotation}
                  onChange={e => setConfig(c => ({
                    ...c,
                    antiDetect: { ...c.antiDetect, uaRotation: e.target.checked },
                  }))}
                />
                UA 轮换
              </label>
              <span className="config-field__hint">
                每次请求随机切换 20+ 个真实浏览器 User-Agent
              </span>
            </div>

            <div className="config-field">
              <label className="config-field__label">
                <input
                  type="checkbox"
                  checked={config.antiDetect.browserFallback}
                  onChange={e => setConfig(c => ({
                    ...c,
                    antiDetect: { ...c.antiDetect, browserFallback: e.target.checked },
                  }))}
                />
                Puppeteer 浏览器回退
              </label>
              <span className="config-field__hint">
                HTTP 请求返回 403 时自动切换真实浏览器渲染
              </span>
            </div>

            <div className="config-field">
              <label>请求延迟范围（毫秒）</label>
              <div className="config-field__row">
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={config.antiDetect.requestDelay.min}
                  onChange={e => setConfig(c => ({
                    ...c,
                    antiDetect: {
                      ...c.antiDetect,
                      requestDelay: { ...c.antiDetect.requestDelay, min: Number(e.target.value) },
                    },
                  }))}
                />
                <span>—</span>
                <input
                  type="number"
                  min={0}
                  max={30000}
                  value={config.antiDetect.requestDelay.max}
                  onChange={e => setConfig(c => ({
                    ...c,
                    antiDetect: {
                      ...c.antiDetect,
                      requestDelay: { ...c.antiDetect.requestDelay, max: Number(e.target.value) },
                    },
                  }))}
                />
                <span>ms</span>
              </div>
              <span className="config-field__hint">
                每次请求随机延迟 [min, max] 范围，含 ±20% 抖动。建议 800-2500ms
              </span>
            </div>

            <div className="config-field">
              <label>最大重试次数</label>
              <input
                type="number"
                min={0}
                max={10}
                value={config.antiDetect.maxRetries}
                onChange={e => setConfig(c => ({
                  ...c,
                  antiDetect: { ...c.antiDetect, maxRetries: Number(e.target.value) },
                }))}
              />
              <span className="config-field__hint">
                失败后指数退避重试（1s → 2s → 4s ...），0 为不重试
              </span>
            </div>
          </section>

          <button type="submit" className="config-page__save">
            {saved ? '已保存' : '保存配置'}
          </button>
        </form>
      </div>
    </div>
  );
}
