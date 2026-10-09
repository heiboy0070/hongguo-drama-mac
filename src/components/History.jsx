import React, { useState, useEffect, useCallback } from 'react';
import './History.css';
import { Film } from './icons';

/**
 * 观看历史。
 *
 * 形态对齐原生版 hongguo-macos 的 LibraryListView(kind: .history):
 * 海报网格 + 「观看历史 / N 部」头部,每张卡片带「第 N 集」备注。
 * 数据取自主进程持久化的播放进度(含标题与封面)。
 */
export default function History() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await window.electronAPI.recentWatched?.(200);
      if (res?.success) setItems(res.items || []);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const play = (item) => {
    window.electronAPI.playSeries({ seriesId: item.series_id, vidIndex: item.vid_index });
  };

  if (loading) {
    return (
      <div className="history-container">
        <p className="history-loading">正在读取观看记录…</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="history-container">
        <div className="history-empty" role="alert">
          <Film size={34} />
          <h3>暂时读不到观看记录</h3>
          <p>这不影响看剧。稍后可以重新载入试试。</p>
          <button className="btn btn-primary" onClick={load}>重新载入</button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="history-container">
        <div className="history-empty">
          <Film size={34} />
          <h3>还没有观看记录</h3>
          <p>看过的剧会自动出现在这里，方便接着上次的位置继续。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-container">
      <div className="history-header">
        <h2>观看历史</h2>
        <span className="history-count">{items.length} 部</span>
      </div>
      <div className="history-grid">
        {items.map((item) => (
          <button
            key={item.series_id}
            className="poster-card history-card"
            title={`${item.title} · 第 ${item.vid_index} 集`}
            onClick={() => play(item)}
          >
            <span className="history-cover">
              {item.cover ? <img src={item.cover} alt="" loading="lazy" /> : <Film size={22} />}
            </span>
            <span className="history-title">{item.title}</span>
            <span className="history-remark">第 {item.vid_index} 集</span>
          </button>
        ))}
      </div>
    </div>
  );
}
