import React, { useState, useRef, useEffect } from 'react';
import './HongguoDownload.css';
import { Film, Download, CheckSquare, Square, RefreshCw, Folder, Link2, Search } from './icons';
import SearchPanel from './SearchPanel';


function HongguoDownload({ onNavigate }) {
  const [tab, setTab] = useState('search'); // 'search' | 'input'
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 短剧解析结果
  const [seriesData, setSeriesData] = useState(null); // { series_id, series_title, cover, total, episodes: [...] }
  const [selectedVids, setSelectedVids] = useState(new Set());
  const [rangeInput, setRangeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const resolveRequest = useRef(0);
  const searchVersion = resolveRequest.current;

  useEffect(() => () => { resolveRequest.current++; }, []);

  const switchTab = (next) => {
    if (next === tab) return;
    resolveRequest.current++;
    setLoading(false);
    setTab(next);
  };

  // 搜索选中一部剧后：复用既有的选集下载界面
  const handleSeriesFromSearch = (data) => {
    if (searchVersion !== resolveRequest.current) return;
    resolveRequest.current++;
    setLoading(false);
    setRangeInput('');
    setErrorMsg('');
    setTab('input');
    setSeriesData(data);
    setSelectedVids(new Set(data.episodes.map((ep) => ep.vid)));
    setSuccessMsg(`已选中《${data.series_title}》共 ${data.total} 集，可直接提交下载`);
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 解析红果短剧
  const handleResolve = async () => {
    if (!inputUrl.trim()) {
      setErrorMsg('请输入红果短剧分享链接或剧集 ID');
      return;
    }
    const request = ++resolveRequest.current;
    setRangeInput('');
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setSeriesData(null);
    setSelectedVids(new Set());

    try {
      const res = await window.electronAPI.hongguoResolve(inputUrl.trim());
      if (request !== resolveRequest.current) return;
      if (res?.success && res.data) {
        setSeriesData(res.data);
        // 默认全选，网页未提供的集数自动尝试 App 片源。
        const allVids = new Set(res.data.episodes.map((ep) => ep.vid));
        setSelectedVids(allVids);
        setSuccessMsg(`解析成功！找到《${res.data.series_title}》共 ${res.data.total} 集`);
      } else {
        setErrorMsg(res?.error || '解析失败，请检查链接或网络');
      }
    } catch (err) {
      if (request === resolveRequest.current) setErrorMsg('解析过程出现错误: ' + err.message);
    } finally {
      if (request === resolveRequest.current) setLoading(false);
    }
  };

  // 勾选/取消勾选单集
  const toggleVid = (vid) => {
    const next = new Set(selectedVids);
    if (next.has(vid)) {
      next.delete(vid);
    } else {
      next.add(vid);
    }
    setSelectedVids(next);
  };

  // 全选
  const handleSelectAll = () => {
    if (!seriesData) return;
    setSelectedVids(new Set(seriesData.episodes.map((ep) => ep.vid)));
  };

  // 反选
  const handleInvertSelect = () => {
    if (!seriesData) return;
    const next = new Set();
    for (const ep of seriesData.episodes) {
      if (!selectedVids.has(ep.vid)) {
        next.add(ep.vid);
      }
    }
    setSelectedVids(next);
  };

  // 清空选择
  const handleDeselectAll = () => {
    setSelectedVids(new Set());
  };

  // 快捷集数选择
  const handleQuickSelect = (type) => {
    if (!seriesData || !seriesData.episodes) return;
    const eps = seriesData.episodes;
    const total = eps.length;
    let targetEps = [];
    if (type === 'first10') {
      targetEps = eps.slice(0, 10);
    } else if (type === 'first30') {
      targetEps = eps.slice(0, 30);
    } else if (type === 'last30') {
      targetEps = eps.slice(Math.max(0, total - 30));
    }
    setSelectedVids(new Set(targetEps.map((ep) => ep.vid)));
  };

  // 根据区间字符串应用筛选 (如 "1-30" 或 "1,5,10-20")
  const handleApplyRange = () => {
    if (!seriesData || !seriesData.episodes || !rangeInput.trim()) return;
    const total = seriesData.episodes.length;
    const nums = new Set();
    const parts = rangeInput.split(',');
    for (let part of parts) {
      part = part.trim();
      if (part.includes('-')) {
        const [a, b] = part.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(a) && !isNaN(b)) {
          for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(total, Math.max(a, b)); i++) {
            nums.add(i);
          }
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n) && n >= 1 && n <= total) nums.add(n);
      }
    }
    const selectedEps = seriesData.episodes.filter((ep) => nums.has(ep.vid_index));
    setSelectedVids(new Set(selectedEps.map((ep) => ep.vid)));
  };

  // 提交批量下载
  const handleBatchDownload = async () => {
    if (!seriesData || selectedVids.size === 0) {
      setErrorMsg('请至少勾选一集欲下载的短剧');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const selectedEps = seriesData.episodes.filter((ep) => selectedVids.has(ep.vid));
      const res = await window.electronAPI.hongguoDownloadBatch({
        seriesId: seriesData.series_id,
        seriesTitle: seriesData.series_title,
        episodes: selectedEps,
      });
      if (res.success) {
        setSuccessMsg(`已成功将 ${res.count} 集提交至下载队列！点击下方按钮跳转至“下载管理”查看实时进度。`);
      } else {
        setErrorMsg(res.error || '提交下载失败');
      }
    } catch (err) {
      setErrorMsg('提交下载异常: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hongguo-container">
      {/* 头部 Banner 区 */}
      <div className="hongguo-hero">
        <div className="hero-icon">
          <Film size={32} />
        </div>
        <div className="hero-text">
          <h2>找到下一部好剧</h2>
          <p>搜一个剧名，或粘贴分享链接。选择喜欢的集数，保存到本地慢慢看。</p>
        </div>
      </div>

      {/* 方式切换 */}
      <div className="mode-tabs">
        <button
          className={`mode-tab ${tab === 'search' ? 'active' : ''}`}
          onClick={() => switchTab('search')}
        >
          <Search size={16} />
          <span>搜索剧集</span>
        </button>
        <button
          className={`mode-tab ${tab === 'input' ? 'active' : ''}`}
          onClick={() => switchTab('input')}
        >
          <Link2 size={16} />
          <span>粘贴链接 / ID</span>
        </button>
      </div>

      {tab === 'search' ? (
        <SearchPanel
          onSelectSeries={handleSeriesFromSearch}
          onSwitchToInput={() => switchTab('input')}
        />
      ) : (
        /* 解析输入卡片 */
        <div className="hongguo-card">
          <div className="card-header-title">
            <Link2 size={18} />
            <span>输入短剧链接或 ID</span>
          </div>
          <div className="input-group">
            <input
              type="text"
              className="input-field"
              aria-label="短剧分享链接或剧集 ID"
              placeholder="粘贴短剧分享链接，或输入剧集 ID"
              value={inputUrl}
              onChange={(e) => { resolveRequest.current++; setLoading(false); setInputUrl(e.target.value); }}
              onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
            />
            <button className="btn btn-primary" onClick={handleResolve} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>解析中...</span>
                </>
              ) : (
                <>
                  <Film size={16} />
                  <span>获取剧集</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && <div className="alert alert-error" role="alert">{errorMsg}</div>}
          {successMsg && <div className="alert alert-success" role="status">{successMsg}</div>}
        </div>
      )}

      {/* 搜索模式下的提示信息（解析卡片被替换了，这里单独显示） */}
      {tab === 'search' && (errorMsg || successMsg) && (
        <div className="hongguo-card" style={{ marginTop: 0 }}>
          {errorMsg && <div className="alert alert-error" role="alert">{errorMsg}</div>}
          {successMsg && <div className="alert alert-success" role="status">{successMsg}</div>}
        </div>
      )}

      {/* 剧集列表与选择控制 */}
      {seriesData && (
        <div className="hongguo-card episode-section">
          {/* 短剧元信息 */}
          <div className="series-header">
            <div className="series-info">
              {seriesData.cover ? (
                <img src={seriesData.cover} alt={seriesData.series_title} className="series-cover" />
              ) : (
                <div className="series-cover-placeholder">
                  <Film size={28} />
                </div>
              )}
              <div className="series-meta">
                <h3 className="series-title">《{seriesData.series_title}》</h3>
                <div className="series-tags">
                  <span className="badge">共 {seriesData.total} 集</span>
                  <span className="badge badge-secondary">已选 {selectedVids.size} 集</span>
                </div>
              </div>
            </div>

            <div className="batch-action-bar">
              <button
                className="btn btn-primary"
                onClick={handleBatchDownload}
                disabled={submitting || selectedVids.size === 0}
              >
                <Download size={16} />
                <span>下载选中集数 ({selectedVids.size}/{seriesData.total})</span>
              </button>
              {onNavigate && (
                <button className="btn btn-outline" onClick={() => onNavigate('manager')}>
                  <Folder size={16} />
                  <span>查看下载管理</span>
                </button>
              )}
            </div>
          </div>

          {seriesData.web_accessible_episodes != null && seriesData.web_accessible_episodes < seriesData.total && (
            <p className="settings-hint">网页源提供前 {seriesData.web_accessible_episodes} 集，后续集数自动尝试 App 片源。</p>
          )}

          {/* 筛选与操作栏 */}
          <div className="controls-row">
            <div className="select-buttons">
              <button className="btn-chip" onClick={handleSelectAll}>全选</button>
              <button className="btn-chip" onClick={handleInvertSelect}>反选</button>
              <button className="btn-chip" onClick={handleDeselectAll}>取消全选</button>
              <span className="divider"></span>
              <button className="btn-chip" onClick={() => handleQuickSelect('first10')}>前 10 集</button>
              <button className="btn-chip" onClick={() => handleQuickSelect('first30')}>前 30 集</button>
              <button className="btn-chip" onClick={() => handleQuickSelect('last30')}>后 30 集</button>
            </div>

            <div className="range-filter">
              <span className="range-label">范围筛选:</span>
              <input
                type="text"
                className="range-input"
                aria-label="选择集数范围"
                placeholder="如 1-30 或 1,5,10"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyRange()}
              />
              <button className="btn-chip btn-chip-primary" onClick={handleApplyRange}>应用</button>
            </div>
          </div>

          {/* 剧集网格列表 */}
          <div className="episode-grid">
            {seriesData.episodes.map((ep) => {
              const isChecked = selectedVids.has(ep.vid);
              return (
                <button
                  type="button"
                  aria-pressed={isChecked}
                  key={ep.vid}
                  className={`episode-card ${isChecked ? 'selected' : ''}`}
                  onClick={() => toggleVid(ep.vid)}
                >
                  <div className="checkbox-icon">
                    {isChecked ? <CheckSquare size={18} className="icon-checked" /> : <Square size={18} className="icon-unchecked" />}
                  </div>
                  <div className="episode-info">
                    <span className="episode-num">第 {String(ep.vid_index).padStart(2, '0')} 集</span>
                    {ep.title && <span className="episode-title">{ep.title}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default HongguoDownload;
