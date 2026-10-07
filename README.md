# 红果短剧 Mac版

面向 Apple Silicon Mac 的开源短剧桌面工具，基于 Electron、React 和 Node.js。
支持红果与西饭两个独立来源，浏览、搜索、按集下载、播放与本地文件管理。
网页未提供片源的分集会自动尝试本地签名的 App 接口与二次取址。
不依赖第三方签名服务器或账号 Cookie；可用性仍取决于源服务。

这是社区修改版本，**不是红果官方客户端，也未获平台官方背书**。
视频清晰度取决于接口返回的片源，不承诺固定分辨率。

[下载 Mac 安装包](https://github.com/jackotom/hongguo-drama-mac/releases/latest) · [项目源码](https://github.com/jackotom/hongguo-drama-mac) · [修改声明](NOTICE) · [GPL-3.0](LICENSE)

![Mac 浏览界面](docs/screenshots/macos-browse.png)

## 功能

- **浏览**：按分类与题材查看剧集，分页浏览，打开详情查看集数。
- **搜索**：按剧名查找，或粘贴分享链接、剧集 ID 解析。
- **按集下载**：选择单集、多集或区间，管理并发、暂停和失败重试。
- **播放**：在线播放与本地播放，支持连播、进度记录及兼容转码。
- **合并**：编码参数一致时快速拼接；混合 H.264/HEVC 等分集先统一编码再合并。
- **清理**：查看磁盘占用，删除单集、整部剧及转码缓存。
- **代理**：提供跟随系统、手动代理与直连设置。

明文片源按需流式加载；App 加密片源通过内置 FFmpeg 准备，临时文件随后清理。
自动选择 H.264/HEVC 兼容轨道，不使用不受支持的 ByteVC2。分集缓存 60 秒，播放地址缓存 30 秒，同一请求合并处理。
以上是当前代码具备的功能。网络服务与片源状态会变化，实测范围见下文。

## 环境要求

| 用途 | 要求 |
|---|---|
| 运行 Mac 应用 | Apple Silicon（M 系列），macOS 13 或更新版本 |
| 从源码构建 | Node.js 22.12 或更新版本、npm、Apple Command Line Tools、pkg-config |
| 网络功能 | 能访问相关平台接口及媒体地址 |

本分支提供 arm64 构建；尚未提供 Intel Mac 构建。
应用运行时不需要安装 Node.js、Homebrew 或 FFmpeg。

## 本地构建

```sh
git clone https://github.com/jackotom/hongguo-drama-mac.git
cd hongguo-drama-mac
npm ci
npm run build:mac
```

构建会验证已有 FFmpeg / FFprobe 缓存；缺少匹配缓存时，从固定且经过 SHA256 校验的 FFmpeg/x264 源码自行编译，
再生成前端、arm64 应用与 DMG。首次构建需要联网下载依赖与源码，编译耗时数分钟。构建脚本不会自动安装系统依赖。

- 应用：`dist/mac-arm64/红果短剧.app`
- 磁盘映像：`dist/红果短剧-1.1.3-mac-arm64.dmg`
- 仅生成应用：`npm run build:mac:dir`
- 开发模式：`npm run dev`

正式安装包与对应源码见 [Releases](https://github.com/jackotom/hongguo-drama-mac/releases)。具体签名、公证和验收状态见对应版本说明。

## 签名与应用数据

本地默认构建采用 **ad-hoc 签名**，不会自动使用你的 Developer ID 或申请 Apple 公证。
macOS 可能要求在“系统设置 → 隐私与安全性”确认打开。
请先核对来源，无需全局关闭 Gatekeeper。

设置、任务和播放记录保存在：
`~/Library/Application Support/hongguo-downloader/`（通过启动参数指定目录时以指定目录为准）。
视频保存到应用设置中选择的下载目录。

## 1.1.3 更新与验证（2026-10-07）

- 漫画切回真人剧不再被浏览器队列阻塞；新版实际切回显示 24 部，约 82 ms（含目录缓存）。
- 西饭真实目录两页各 30 部、搜索 10 条；目标 80 集保留 2 集锁定，伪造未锁定标志也不能提交下载。
- 西饭首集离屏元信息 1080×1920、50.8 秒，保持暂停；下载 34,081,368 字节完成。
- 混合 H.264/HEVC 实际分集标准化合并，153.525 秒边界无错误解码；未重跑整部 72 集。
- 正式应用 Developer ID 签名、运行时加固、可信时间戳与 Apple 公证通过；公证日志无问题，票据已装订。

## 历史验证范围（1.1.2 及之前）

以下是本次实际检查结果，不代表对所有剧集或全部网络场景的保证。

| 检查 | 结果 |
|---|---|
| 浏览列表 | 返回 24 条剧集 |
| 剧集解析 | 目标剧集解析出 77 集 |
| 首集下载及媒体检查 | 20,627,462 字节；177.37 秒；H.264 / AAC；720 × 1280 |
| Chromium 离屏视频加载 | `readyState = 4`，未执行播放 |
| 搜索 | 返回 10 条，包含目标剧集 |
| VideoToolbox | 静音黑帧转码成功 |
| Mac 回归检查 | 7 项通过 |
| 分集性能对照 | 同一部 77 集，7323 ms → 540 ms；缓存命中不足 1 ms |
| 流式在线播放载入 | 第 3 集准备 346 ms、元信息 641 ms；准备阶段媒体字节为 0，保持暂停 |
| App 源取址 | 同一部网页仅开放前 3 集的剧，第 4、5 集在 Electron 中取得 HEVC 地址与有效密钥 |
| App 源媒体 | 第 4、5 集最终包取址、解密、Chromium 离屏载入通过，均为 720p / HEVC / AAC；载入约 2.82s / 2.44s，保持暂停 |
| 故障回归 | 缓存、Range、取消、断流、任务去重、转码合并、UI竞态及写入中断检查通过 |

最终五页界面已检查；1.1.2 arm64 应用独立启动，内置工具定位正常，ad-hoc 签名与 DMG 校验通过。
离屏加载成功不等于用户已观看验收；本次没有通过播放演示视频进行验证。
Windows 构建配置仍保留，但此分支未重新测试 Windows。

## FFmpeg 与许可证

应用整体保留 **GPL-3.0**。源码沿用两层上游：

1. 原始项目：[327044572/hongguo-downloader](https://github.com/327044572/hongguo-downloader)。
2. 本次移植直接基于：[zhenyong97/hongguo-downloader](https://github.com/zhenyong97/hongguo-downloader)。

本分支自 2026-10-07 增加 Mac 适配；完整修改声明见 [NOTICE](NOTICE)。
Electron、React、axios 等组件许可见 [第三方声明](THIRD-PARTY-NOTICES.md)。

Mac 内置 FFmpeg / FFprobe 由固定 **9.0.2** 源码与 **x264 b35605a** 编译为 arm64，
许可为 GPLv3-or-later，仅静态链接 x264，并保留 VideoToolbox 支持，未启用 `nonfree`。
二进制仅依赖 macOS 系统动态库，不依赖用户的 Homebrew 路径。

- [来源、校验值与源码要求](build/ffmpeg/MACOS-NOTICE.txt)
- [准确构建配置与依赖版本](build/ffmpeg/MACOS-VERSIONS.txt)
- [FFmpeg 许可说明](build/ffmpeg/MACOS-LICENSE.txt)

二进制文件不提交到 Git。向第三方分发编译包前，分发者须按 GPL 要求提供
完整对应源码，包括 FFmpeg、静态链接依赖及构建材料。正式 Release 附有应用源码 ZIP 和 FFmpeg/x264 对应源码包。

## 来源与限制

红果为默认来源；西饭可单独浏览、搜索与下载已开放分集。西饭未开放的集数保留锁定标记，无法选择、播放或下载；本项目不提供解锁功能。
“漫画”是图文阅读；视频类内容请使用“漫剧”。不同来源文件分目录保存，不覆盖同名剧。

## 使用边界

仅处理你有权访问、下载或备份的内容，遵守平台条款与相关法律。
作品版权归原平台及创作者所有，请勿用于未经授权的传播或商业盗版。
平台接口可能调整；某次检查通过不保证后续接口、片源或账号条件保持不变。
