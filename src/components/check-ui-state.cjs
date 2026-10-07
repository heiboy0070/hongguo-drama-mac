// Run: node src/components/check-ui-state.cjs. No browser, network or media playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const episode = (n) => ({ vid: `vid${n}`, vid_index: n, status: 'missing' });
const detail = (id) => ({ series_id: id, series_title: id, total: 2, episodes: [episode(1), episode(2)] });
const ok = data => ({ success: true, data });

function mount(file, api, props = {}) {
  const slots = [], effects = [], cleanups = [];
  let cursor = 0, tree, Component;
  const changed = (old, deps) => !old || deps.some((d, i) => !Object.is(d, old[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo: (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback: (fn, deps) => react.useMemo(() => fn, deps),
    useEffect: (fn, deps) => { const i = cursor++; if (changed(slots[i], deps)) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const fallback = () => Promise.resolve({});
  const window = { electronAPI: new Proxy(api, { get: (obj, key) => obj[key] || (key.startsWith('on') ? () => () => {} : fallback) }), addEventListener() {}, removeEventListener() {} };
  const source = transformSync(fs.readFileSync(`${__dirname}/${file}.jsx`, 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
  const context = { module: { exports: {} }, exports: {}, require: name => name === 'react' ? react : name === './useDialogKeyboard' ? () => {} : {}, window, document: { querySelector: () => null }, navigator: {}, crypto: require('node:crypto').webcrypto, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, console };
  context.exports = context.module.exports;
  vm.runInNewContext(source, context);
  Component = context.module.exports.default;
  const render = () => { cursor = 0; tree = Component(props); effects.splice(0).forEach(fn => fn()); return tree; };
  const nodes = () => { const out = []; const walk = n => { if (!n || typeof n !== 'object') return; out.push(n); n.children?.forEach(walk); }; walk(tree); return out; };
  const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : n?.children?.map(text).join('') || '';
  const find = predicate => nodes().find(predicate);
  const button = label => find(n => n.type === 'button' && text(n).includes(label));
  const flush = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); render(); } };
  render();
  return { render, flush, find, button, text: () => text(tree), unmount: () => cleanups.forEach(fn => fn?.()) };
}

(async () => {
  let failures = 0;
  const test = async (name, fn) => { if (process.argv[2] && !name.includes(process.argv[2])) return; try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.error(`FAIL ${name}: ${e.stack}`); } };
  await test('closing a loading detail ignores its late result', async () => {
    const pending = deferred();
    const ui = mount('Browse', { getSeriesList: async () => [], browseCategories: async () => [], browseList: async () => ({ success: true, results: [{ series_id: 'A', series_title: 'A' }] }), searchResolve: () => pending.promise, getSeriesEpisodes: async () => ok(detail('A')) });
    await ui.flush(); ui.find(n => n.props.className === 'browse-card').props.onClick(); ui.render();
    const close = ui.find(n => n.type === 'button' && n.props.title === '关闭');
    assert.equal(!!close.props.disabled, false, 'loading drawer must remain cancellable');
    close.props.onClick(); pending.resolve(ok(detail('A'))); await ui.flush();
    assert.equal(ui.find(n => n.props.role === 'dialog'), undefined, 'closed drawer reopened');
    ui.unmount();
  });
  await test('browse play starts an undownloaded episode', async () => {
    let payload;
    const ui = mount('Browse', { getSeriesList: async () => [], browseCategories: async () => [], browseList: async () => ({ success: true, results: [{ series_id: 'A', series_title: 'A' }] }), searchResolve: async () => ok(detail('A')), getSeriesEpisodes: async () => ok(detail('A')), playSeries: async p => { payload = p; return { success: true }; } });
    await ui.flush(); ui.find(n => n.props.className === 'browse-card').props.onClick(); await ui.flush();
    await ui.button('立即播放').props.onClick(); assert.equal(payload?.vidIndex, 1); ui.unmount();
  });
  await test('late old online prepare cannot replace latest episode, and unmount releases it', async () => {
    const first = deferred(), second = deferred(), released = [], requested = [];
    const ui = mount('Player', { getSeriesList: async () => [{ series_id: 'A' }], getSeriesEpisodes: async () => ok(detail('A')), getPlaybackPosition: async () => null, prepareOnlinePlay: p => { requested.push(p); return requested.length === 1 ? first.promise : second.promise; }, releaseOnlinePlay: async p => released.push(p) });
    await ui.flush(); const firstButton = ui.find(n => n.props['aria-label'] === '第 1 集'); assert.ok(firstButton, ui.text()); firstButton.props.onClick(); ui.render();
    ui.find(n => n.props['aria-label'] === '第 2 集').props.onClick(); ui.render();
    second.resolve({ success: true, url: 'hongguo-stream://new', streamId: 'new' }); await ui.flush();
    first.resolve({ success: true, url: 'hongguo-stream://old', streamId: 'old' }); await ui.flush();
    assert.equal(ui.find(n => n.type === 'video')?.props.src, 'hongguo-stream://new');
    assert.ok(requested.every(p => p.requestId), 'each prepare must be cancellable');
    ui.find(n => n.type === 'video').props.onError({ currentTarget: { error: { code: 2 } } });
    ui.render();
    assert.ok(ui.button('在线播放'), 'network error must offer preparation retry');
    assert.ok(!ui.text().includes('当前片源无法正常解码'), 'network error must not claim decoder failure');
    ui.unmount(); assert.ok(released.some(p => p.streamId === 'old')); assert.ok(released.some(p => p.streamId === 'new'));
  });
  await test('browse navigation prepares the requested missing episode without waiting for a download', async () => {
    const requested = [];
    const ui = mount('Player', { getSeriesList: async () => [{ series_id: 'A' }], getSeriesEpisodes: async () => ok(detail('A')), getPlaybackPosition: async () => null, prepareOnlinePlay: async p => { requested.push(p); return { success: true, url: 'hongguo-stream://target' }; } }, { target: { seriesId: 'A', vidIndex: 2, ts: 123 } });
    await ui.flush(); assert.equal(requested.length, 1); assert.equal(requested[0].vidIndex, 2); ui.unmount();
  });
  await test('download latest parse wins over a late earlier parse', async () => {
    const first = deferred(), second = deferred(); let count = 0;
    const ui = mount('HongguoDownload', { hongguoResolve: () => ++count === 1 ? first.promise : second.promise });
    ui.button('粘贴链接').props.onClick(); ui.render();
    const input = () => ui.find(n => n.props['aria-label'] === '短剧分享链接或剧集 ID');
    input().props.onChange({ target: { value: 'A' } }); ui.render(); input().props.onKeyDown({ key: 'Enter' }); ui.render();
    input().props.onChange({ target: { value: 'B' } }); ui.render(); input().props.onKeyDown({ key: 'Enter' });
    second.resolve(ok(detail('B'))); await ui.flush(); first.resolve(ok(detail('A'))); await ui.flush();
    assert.ok(ui.text().includes('《B》')); assert.ok(!ui.text().includes('《A》')); ui.unmount();
  });
  await test('download ignores search selection after leaving its search panel', async () => {
    const ui = mount('HongguoDownload', { hongguoResolve: async () => ok(detail('B')) });
    const oldSearchResult = ui.find(n => n.props.onSelectSeries).props.onSelectSeries;
    ui.button('粘贴链接').props.onClick(); ui.render();
    ui.find(n => n.props['aria-label'] === '短剧分享链接或剧集 ID').props.onChange({ target: { value: 'B' } }); ui.render();
    ui.button('获取剧集').props.onClick(); await ui.flush(); oldSearchResult(detail('A')); ui.render();
    assert.ok(ui.text().includes('《B》')); assert.ok(!ui.text().includes('《A》')); ui.unmount();
  });
  await test('download includes App fallback episodes by default and bounds enormous ranges', async () => {
    const data = detail('A'); data.web_accessible_episodes = 1; data.episodes[0].web_available = true; data.episodes[1].web_available = false;
    const ui = mount('HongguoDownload', {});
    ui.find(n => n.props.onSelectSeries).props.onSelectSeries(data); ui.render();
    assert.ok(ui.button('下载选中集数 (2/2)'), 'web-unavailable episodes remain selected for the App fallback');
    assert.ok(ui.text().includes('网页源提供前 1 集，后续集数自动尝试 App 片源'));
    ui.find(n => n.props['aria-label'] === '选择集数范围').props.onChange({ target: { value: '1-999999999' } }); ui.render();
    vm.runInNewContext('apply()', { apply: ui.button('应用').props.onClick }, { timeout: 100 }); ui.render();
    assert.ok(ui.button('下载选中集数 (2/2)'), 'manual selection must keep the API fallback available'); ui.unmount();
  });
  await test('reselecting active search tab preserves pending search selection', async () => {
    const ui = mount('HongguoDownload', {});
    const searchResult = ui.find(n => n.props.onSelectSeries).props.onSelectSeries;
    ui.button('搜索剧集').props.onClick();
    // React does not rerender when setTab receives the same value.
    searchResult(detail('A')); ui.render();
    assert.ok(ui.text().includes('《A》')); ui.unmount();
  });
  process.exitCode = failures ? 1 : 0;
})();
