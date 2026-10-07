// Fixed, redistributable GPLv3 arm64 build; provenance: build/ffmpeg/MACOS-NOTICE.txt.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', 'build', 'ffmpeg');
const dest = path.join(root, 'darwin-arm64');
const base = 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2';
const hashes = {
  ffmpeg: {
    zip: 'c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924',
    binary: '2e11c6f90993cdb79fff84d3f90044d28316b310e75b3e030cfc9a54f2c9d384',
  },
  ffprobe: {
    zip: 'fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6',
    binary: '2738aa46a7f9acbc8ab09a6715554c90f7de603171ac403726765685df6a0059',
  },
};
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

try {
  assert.equal(process.platform, 'darwin', '请在 macOS 上准备 Apple Silicon 构建');
  for (const name of ['COPYING.GPLv3', 'MACOS-LICENSE.txt', 'MACOS-NOTICE.txt', 'MACOS-VERSIONS.txt']) {
    assert(fs.existsSync(path.join(root, name)), `缺少许可或来源文件：${name}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const [name, hash] of Object.entries(hashes)) {
    const binary = path.join(dest, name);
    if (!fs.existsSync(binary) || sha256(binary) !== hash.binary) {
      const temp = fs.mkdtempSync(path.join(root, '.macos-'));
      try {
        const zip = path.join(temp, `${name}.zip`);
        execFileSync('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error',
          '--proto', '=https', '--retry', '2', '--connect-timeout', '30', '--max-time', '600',
          '--output', zip, `${base}/${name}.zip`], { stdio: 'inherit' });
        assert.equal(sha256(zip), hash.zip, `${name} 下载校验失败`);
        execFileSync('/usr/bin/unzip', ['-q', '-j', zip, name, '-d', temp]);
        assert.equal(sha256(path.join(temp, name)), hash.binary, `${name} 二进制校验失败`);
        fs.renameSync(path.join(temp, name), binary);
      } finally {
        fs.rmSync(temp, { recursive: true, force: true });
      }
    }
    fs.chmodSync(binary, 0o755);
    execFileSync('/usr/bin/lipo', [binary, '-verify_arch', 'arm64']);
    const deps = execFileSync('/usr/bin/otool', ['-L', binary], { encoding: 'utf8' })
      .trim().split('\n').slice(1);
    assert(deps.length && deps.every((line) => /^\s+\/(usr\/lib|System\/Library)\//.test(line)),
      `${name} 包含非系统动态库依赖`);
    console.log(`${name}: SHA256、arm64 架构与系统库依赖检查通过`);
  }
} catch (error) {
  console.error(`Mac FFmpeg 准备失败：${error.message}`);
  process.exitCode = 1;
}
