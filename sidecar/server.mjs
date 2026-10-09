/**
 * 红果播放边车（最小可用版）
 *
 * 作用：给原生客户端（hongguo-macos / AVPlayer）提供一个可直接播放的 HTTP 流，
 *      替它完成取址、下载、解密这些 Node 侧才能做的事。
 *
 * 设计约束（用户已确认）：
 *   1. **只走 App 通道**。原实现的取址链是先试网页通道、失败才回退 App 通道，
 *      而网页通道对第 4 集起必然 404 —— 等于每次播放都白撞一次失败。这里直接用 App 通道。
 *   2. **解密结果落临时文件**，上限 500MB，超限淘汰最早使用的（LRU）。
 *      落盘而不是常驻内存：用户内存偏紧，且落盘后重看已看过的集能秒开。
 *   3. **ffmpeg 三级解析**：内置路径 → 系统 PATH → 明确报错。
 *      不能只靠 PATH —— 从访达启动的 .app 不继承终端的 PATH。
 *
 * 启动：node sidecar/server.mjs [--port 8787]
 *
 * 依赖内置 ffmpeg（解密第 4 集起的片源必需）。二进制不入库，需先构建再放置：
 *   npm run setup:ffmpeg:mac
 *   cp build/ffmpeg/.source-build/artifacts/bin/ffmpeg sidecar/bin/ffmpeg
 * 该构建的非系统动态依赖为 0，可随 app bundle 分发，不依赖使用者的 Homebrew。
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const hongguo = require('../src/native/hongguo.js');
const appSource = require('../src/native/app-source.js');

// ---------- 配置 ----------
const argPort = (() => {
  const i = process.argv.indexOf('--port');
  return i >= 0 ? Number(process.argv[i + 1]) : NaN;
})();
const PORT = Number.isFinite(argPort) ? argPort : Number(process.env.HONGGUO_SIDECAR_PORT || 8787);
const CACHE_LIMIT_BYTES = 500 * 1024 * 1024;   // 500MB
const CACHE_DIR = path.join(os.tmpdir(), 'hongguo-sidecar-cache');
const UA = hongguo.UA;
const REFERER = hongguo.VIDEO_REFERER;

// ---------- ffmpeg 解析（三级）----------
function resolveFfmpeg() {
  const candidates = [];
  // ① app bundle 内置：随包分发，不依赖用户环境
  candidates.push(path.join(__dirname, 'bin', 'ffmpeg'));
  candidates.push(path.join(__dirname, '..', 'build', 'ffmpeg', 'ffmpeg'));
  // ② 系统 PATH：开发期兜底
  for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(dir, 'ffmpeg'));
  }
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* 继续找 */ }
  }
  return null;
}
const FFMPEG = resolveFfmpeg();

// ---------- LRU 缓存 ----------
/** key -> { file, size, lastUsed } */
const cache = new Map();
let cacheBytes = 0;

async function initCache() {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  // 启动时按 mtime 重建索引：进程重启不该丢掉已有缓存
  let entries = [];
  try { entries = await fsp.readdir(CACHE_DIR); } catch { return; }
  for (const name of entries) {
    if (!name.endsWith('.mp4')) continue;
    const file = path.join(CACHE_DIR, name);
    try {
      const st = await fsp.stat(file);
      cache.set(name.slice(0, -4), { file, size: st.size, lastUsed: st.mtimeMs });
      cacheBytes += st.size;
    } catch { /* 忽略坏文件 */ }
  }
  await evict();
  console.log(`[缓存] 恢复 ${cache.size} 个文件，共 ${mb(cacheBytes)}`);
}

const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';

/** 超限时淘汰最早使用的，直到降到上限以下 */
async function evict() {
  if (cacheBytes <= CACHE_LIMIT_BYTES) return;
  const rows = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [key, entry] of rows) {
    if (cacheBytes <= CACHE_LIMIT_BYTES) break;
    cache.delete(key);
    cacheBytes -= entry.size;
    await fsp.unlink(entry.file).catch(() => {});
    console.log(`[缓存] 淘汰 ${key} (${mb(entry.size)})`);
  }
}

// ---------- 取址 + 解密 ----------
/** 只走 App 通道。返回 { url, contentKey, codec } */
async function resolvePlayUrl(vid) {
  const info = await appSource.fetchAppPlayUrl(String(vid));
  if (!info || !info.url) throw new Error((info && info.error) || '未取到播放地址');
  return info;
}

async function httpGet(url) {
  // 请求头的顺序是有讲究的，照搬主进程里能跑通的那套：
  //   第一次只带 User-Agent + Accept-Encoding: identity；
  //   **只有**收到 403 才重试并补上 Referer。
  // 反过来（第一次就带 Referer）会被 CDN 直接拒 —— 实测 403。
  // Accept-Encoding: identity 也不能省，否则可能拿到被压缩的字节，解密必然失败。
  const base = { 'User-Agent': UA, 'Accept-Encoding': 'identity' };
  let res = await fetch(url, { headers: base });
  if (res.status === 403) {
    res = await fetch(url, { headers: { ...base, Referer: REFERER } });
  }
  if (!res.ok) throw new Error(`下载片源失败（HTTP ${res.status}）`);
  return res;
}

async function decryptWithFfmpeg(input, output, contentKey) {
  if (!FFMPEG) throw new Error('未找到 FFmpeg，无法解密该片源');
  await new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
      '-decryption_key', contentKey,
      '-i', input, '-map', '0:v:0', '-map', '0:a?',
      '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString().slice(0, 400); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`解密失败（ffmpeg 退出码 ${code}）`)));
  });
}

/**
 * 准备一集：命中缓存直接返回；否则下载（必要时解密）到缓存目录。
 * 返回 { file, size }
 */
async function prepare(vid) {
  const key = String(vid);
  const hit = cache.get(key);
  if (hit) {
    try {
      await fsp.access(hit.file);
      hit.lastUsed = Date.now();
      return { file: hit.file, size: hit.size, cached: true };
    } catch { cache.delete(key); cacheBytes -= hit.size; }
  }

  const info = await resolvePlayUrl(key);
  const target = path.join(CACHE_DIR, `${key}.mp4`);

  if (!info.contentKey) {
    // 无密钥：直接落盘
    const res = await httpGet(info.url);
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.writeFile(target, buf);
  } else {
    // 有密钥：先下加密体到临时文件，再让 ffmpeg 解密输出
    const enc = path.join(CACHE_DIR, `${key}.enc`);
    const res = await httpGet(info.url);
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.writeFile(enc, buf);
    try {
      await decryptWithFfmpeg(enc, target, info.contentKey);
    } finally {
      await fsp.unlink(enc).catch(() => {});
    }
  }

  const st = await fsp.stat(target);
  cache.set(key, { file: target, size: st.size, lastUsed: Date.now() });
  cacheBytes += st.size;
  await evict();
  return { file: target, size: st.size, cached: false };
}

// ---------- HTTP ----------
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return false;
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return false;
  return { start, end };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    // 健康检查
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true, ffmpeg: FFMPEG, cacheFiles: cache.size, cacheBytes, cacheLimit: CACHE_LIMIT_BYTES,
      }));
    }

    // 剧集列表
    if (url.pathname === '/detail') {
      const sid = url.searchParams.get('sid');
      if (!sid) { res.writeHead(400); return res.end('missing sid'); }
      const data = await hongguo.fetchEpisodeList(String(sid));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, data }));
    }

    // 播放：/play/<vid>
    const m = /^\/play\/(.+)$/.exec(url.pathname);
    if (m) {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      const vid = decodeURIComponent(m[1]);
      let entry;
      try {
        entry = await prepare(vid);
      } catch (e) {
        console.error(`[播放] ${vid} 失败: ${e.message}`);
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(e.message);
      }
      const size = entry.size;
      const range = parseRange(req.headers.range, size);
      if (range === false) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      const start = range ? range.start : 0;
      const end = range ? range.end : size - 1;
      const status = range ? 206 : 200;
      const headers = {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Cache-Control': 'no-store',
      };
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      res.writeHead(status, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(entry.file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('not found');
  } catch (e) {
    console.error('[边车] 请求失败:', e.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e.message || 'error'));
  }
});

await initCache();
if (!FFMPEG) console.warn('[警告] 未找到 ffmpeg —— 需要解密的剧集将无法播放（第 4 集起）');
else console.log(`[ffmpeg] ${FFMPEG}`);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[边车] 监听 http://127.0.0.1:${PORT}`);
  console.log(`[边车] 缓存目录 ${CACHE_DIR}  上限 ${mb(CACHE_LIMIT_BYTES)}`);
});
