import React, { useState, useEffect } from 'react';
import { Film, Download, Settings, Play, Home, Search } from './components/icons';
import HongguoDownload from './components/HongguoDownload';
import DownloadManager from './components/DownloadManager';
import SettingsPage from './components/Settings';
import Player from './components/Player';
import Browse from './components/Browse';

const MENU = [
  { id: 'browse', label: '发现短剧', icon: Home },
  { id: 'download', label: '搜索与下载', icon: Search },
  { id: 'player', label: '我的剧库', icon: Play },
  { id: 'manager', label: '下载管理', icon: Download },
  { id: 'settings', label: '设置', icon: Settings },
];

export default function App() {
  const [page, setPage] = useState('browse');
  const [appInfo, setAppInfo] = useState(null); // { version, brand, appName }
  const [playerTarget, setPlayerTarget] = useState(null); // 浏览页点播 -> 播放页选中

  useEffect(() => {
    window.electronAPI.getAppInfo().then((info) => {
      setAppInfo(info);
    });
  }, []);

  // 主进程发来的导航指令（例如浏览页点「立即播放」）
  useEffect(() => {
    if (!window.electronAPI.onNavigate) return undefined;
    return window.electronAPI.onNavigate((data) => {
      if (!data || !data.page) return;
      if (data.payload) setPlayerTarget({ ...data.payload, ts: Date.now() });
      setPage(data.page);
    });
  }, []);

  const navigate = (nextPage) => {
    setPlayerTarget(null);
    setPage(nextPage);
  };

  const renderPage = () => {
    switch (page) {
      case 'browse':
        return <Browse onNavigate={navigate} />;
      case 'player':
        return <Player target={playerTarget} onNavigate={navigate} />;
      case 'manager':
        return <DownloadManager onNavigate={navigate} />;
      case 'settings':
        return <SettingsPage />;
      case 'download':
      default:
        return <HongguoDownload onNavigate={navigate} />;
    }
  };

  const isMac = appInfo?.platform === 'darwin' || (!appInfo?.platform && /Mac/.test(navigator.platform));
  const currentPage = MENU.find((item) => item.id === page);

  return (
    <div className={`app-layout ${isMac ? 'platform-mac' : ''}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-window-drag" aria-hidden="true" />
        <div className="sidebar-brand">
          <div className="logo"><Play size={21} /></div>
          <div><div className="brand-text">红果短剧</div><div className="brand-sub">每一集，都值得期待</div></div>
        </div>
        <nav className="sidebar-menu">
          <div className="sidebar-group-label">内容</div>
          {MENU.filter((item) => item.id !== 'settings').map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`sidebar-item ${page === item.id ? 'active' : ''}`}
                aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
                <Icon size={19} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button className={`sidebar-item ${page === 'settings' ? 'active' : ''}`}
            aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
            <Settings size={19} /><span>设置</span>
          </button>
          <div className="footer-note"><span>红果短剧</span><span>{appInfo?.version ? `v${appInfo.version}` : ''}</span></div>
        </div>
      </aside>
      <div className="main-wrapper">
        <header className="window-toolbar">
          <span className="toolbar-location">{currentPage?.label}</span>
          <span className="toolbar-caption">红果短剧</span>
        </header>
        <main className="main-content" key={page}>{renderPage()}</main>
      </div>
    </div>
  );
}
