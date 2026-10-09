import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Film, Download, Settings, Play, Home, Search, Clock } from './components/icons';
import HongguoDownload from './components/HongguoDownload';
import DownloadManager from './components/DownloadManager';
import SettingsPage from './components/Settings';
import Player from './components/Player';
import Browse from './components/Browse';
import History from './components/History';
import { formatAccel, bossKeyWarning } from './bossKey';
import { readThemePreference, applyTheme, watchSystemTheme } from './theme';

// 导航项。player 用 hidden 标记:它仍然是一个可路由的页面(点"立即播放"或
// 侧栏最近观看会切过去),但**不作为导航项出现** —— 播放是内容区的一个状态,
// 不是用户主动要去的目的地。
const MENU = [
  { id: 'browse', label: '发现短剧', icon: Home },
  { id: 'download', label: '搜索与下载', icon: Search },
  { id: 'manager', label: '下载管理', icon: Download },
  { id: 'history', label: '历史', icon: Clock },
  { id: 'player', label: '播放', icon: Play, hidden: true },
  { id: 'settings', label: '设置', icon: Settings },
];

const NAV_ITEMS = MENU.filter((item) => !item.hidden && item.id !== 'settings');

export default function App() {
  // 导航状态记忆:回到上次所在的页面。用同步的 localStorage 读,
  // 避免先渲染首页再跳走造成的闪烁。
  const [page, setPage] = useState(() => {
    try { return localStorage.getItem('hongguo.page') || 'browse'; } catch { return 'browse'; }
  });
  const [visited, setVisited] = useState(['browse']);
  const [storageError, setStorageError] = useState('');
  const [appInfo, setAppInfo] = useState(null); // { version, brand, appName }
  const [bossKey, setBossKey] = useState(null); // 老板键注册状态
  const [bossKeyDismissed, setBossKeyDismissed] = useState(false);
  const [playerTarget, setPlayerTarget] = useState(null); // 浏览页点播 -> 播放页选中
  // 过渡方向:菜单里往下走 = +1,往上走 = -1。让进出方向跟着导航意图走,
  // 观感才是“连贯”的,而不是每次都用同一个方向。
  const [dir, setDir] = useState(1);
  // 由历史页指定要打开的剧:切到发现页并让 Browse 打开它的详情
  const [detailTarget, setDetailTarget] = useState(null);

  const indexOfPage = (id) => MENU.findIndex((item) => item.id === id);

  // 用 ref 记住当前页,让 goTo 既能被点击调用、也能被主进程事件调用,
  // 且不必把 page 放进 effect 依赖(否则每次切页都要重新订阅 IPC)。
  const pageRef = useRef('browse');
  const goTo = useCallback((nextPage) => {
    const from = pageRef.current;
    if (!nextPage || nextPage === from) return;
    pageRef.current = nextPage;
    try { localStorage.setItem('hongguo.page', nextPage); } catch { /* 存不下只影响本次会话 */ }
    setDir(indexOfPage(nextPage) >= indexOfPage(from) ? 1 : -1);
    setVisited((pages) => pages.includes(nextPage) ? pages : [...pages, nextPage]);
    setPage(nextPage);
  }, []);

  // 主题:首帧前先落一次,再在"跟随系统"时订阅系统变化
  useEffect(() => {
    const preference = readThemePreference();
    applyTheme(preference);
    return watchSystemTheme(preference, () => {});
  }, []);

  useEffect(() => {
    window.electronAPI.getAppInfo().then((info) => {
      setAppInfo(info);
    });
  }, []);

  // 老板键状态:注册失败必须让用户看见,否则表现就是"按了没反应"且毫无线索
  useEffect(() => {
    window.electronAPI.bossKeyStatus?.().then((s) => setBossKey(s)).catch(() => {});
  }, []);

  useEffect(() => window.electronAPI.onStorageError?.((data) => {
    setStorageError(data?.error || '数据保存失败，请检查磁盘空间和目录权限后重试。');
  }), []);

  // 主进程发来的导航指令（例如浏览页点「立即播放」）
  useEffect(() => {
    if (!window.electronAPI.onNavigate) return undefined;
    return window.electronAPI.onNavigate((data) => {
      if (!data || !data.page) return;
      if (data.payload) setPlayerTarget({ ...data.payload, ts: Date.now() });
      goTo(data.page);
    });
  }, [goTo]);

  const navigate = goTo;

  const renderPage = (id) => {
    switch (id) {
      case 'browse':
        return <Browse active={page === id} onNavigate={navigate} target={detailTarget} />;
      case 'player':
        return <Player active={page === id} target={playerTarget} onNavigate={navigate} />;
      case 'manager':
        return <DownloadManager active={page === id} onNavigate={navigate} />;
      case 'history':
        return (
          <History
            onOpen={(item) => {
              setDetailTarget({ seriesId: item.series_id, ts: Date.now() });
              goTo('browse');
            }}
          />
        );
      case 'settings':
        return <SettingsPage active={page === id} />;
      case 'download':
      default:
        return <HongguoDownload active={page === id} onNavigate={navigate} />;
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
          {NAV_ITEMS.map((item) => {
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
        {storageError && <div className="app-storage-error" role="alert"><span>{storageError}</span><button className="btn btn-outline btn-sm" onClick={() => setStorageError('')}>关闭提示</button></div>}
        {bossKey?.failed?.length > 0 && !bossKeyDismissed && (
          <div className="app-storage-error app-boss-warning" role="alert">
            <span>{bossKeyWarning(bossKey)}</span>
            <button className="btn btn-outline btn-sm" onClick={() => setBossKeyDismissed(true)}>知道了</button>
          </div>
        )}
        {/* 页面栈:所有访问过的页面常驻挂载(保留各自的滚动位置与内部状态),
            只切换 data-active 做交叉过渡。原先用 hidden 属性切换 = display:none,
            元素被移出布局,过渡无从发生,所以是硬切。 */}
        <div className="page-stack" style={{ '--page-enter-y': `${dir * 10}px` }}>
          {visited.map((id) => (
            <main
              className="main-content"
              data-page={id}
              data-active={page === id ? 'true' : 'false'}
              aria-hidden={page === id ? undefined : 'true'}
              key={id}
            >
              {renderPage(id)}
            </main>
          ))}
        </div>
      </div>
    </div>
  );
}
