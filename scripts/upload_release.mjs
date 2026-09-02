import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OWNER = 'Simon-yyy';
const REPO = 'Codex-Harness-DeskTop';
const TAG = 'v1.0.1';

function getToken() {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['credential', 'fill']);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', code => {
      const match = out.match(/password=(.*)/);
      if (match) resolve(match[1].trim());
      else reject(new Error('未能获取 git token: ' + out));
    });
    proc.stdin.write('protocol=https\nhost=github.com\n\n');
    proc.stdin.end();
  });
}

async function fetchWithRetry(url, options, retries = 5, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`[重试 ${i + 1}/${retries}] 网络请求超时或异常，${delayMs / 1000}s 后重试... (${err.message})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function upload() {
  const token = await getToken();
  const headers = {
    'Authorization': `token ${token}`,
    'User-Agent': 'Node-Uploader',
    'Accept': 'application/vnd.github.v3+json'
  };

  console.log('1. 查询当前 Release 信息...');
  const relRes = await fetchWithRetry(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, { headers });
  if (!relRes.ok) {
    throw new Error(`获取 Release 失败: ${relRes.status} ${await relRes.text()}`);
  }
  const release = await relRes.json();
  console.log(`✓ 找到 Release: ${release.name} (ID: ${release.id})`);
  console.log(`   已有资产数: ${release.assets.length}`);

  const existingNames = new Set(release.assets.map(a => a.name));

  // 本地要上传的文件
  const releaseFolder = path.resolve('release', 'v1.0.1');
  const filesToUpload = [
    {
      filePath: path.join(releaseFolder, 'Codex Desktop Setup 1.0.1.exe'),
      name: 'Codex.Desktop.Setup.1.0.1.exe',
      contentType: 'application/octet-stream'
    },
    {
      filePath: path.join(releaseFolder, 'Codex Desktop Setup 1.0.1.exe.blockmap'),
      name: 'Codex.Desktop.Setup.1.0.1.exe.blockmap',
      contentType: 'application/octet-stream'
    }
  ];

  const uploadUrlTemplate = release.upload_url.replace(/\{(\?.*)?\}$/, '');

  for (const item of filesToUpload) {
    if (existingNames.has(item.name)) {
      console.log(`✓ 资产已存在，跳过: ${item.name}`);
      continue;
    }

    if (!fs.existsSync(item.filePath)) {
      console.error(`文件不存在: ${item.filePath}`);
      continue;
    }

    const stat = fs.statSync(item.filePath);
    const stream = fs.readFileSync(item.filePath);
    const targetUrl = `${uploadUrlTemplate}?name=${encodeURIComponent(item.name)}`;

    console.log(`2. 上传资产: ${item.name} (${(stat.size / 1024 / 1024).toFixed(2)} MB)...`);
    const upRes = await fetchWithRetry(targetUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': item.contentType,
        'Content-Length': stat.size.toString()
      },
      body: stream
    }, 5, 4000);

    if (!upRes.ok) {
      throw new Error(`上传失败 [${item.name}]: ${upRes.status} ${await upRes.text()}`);
    }
    const assetObj = await upRes.json();
    console.log(`   ✓ 上传成功: ${assetObj.name} (ID: ${assetObj.id})`);
  }

  console.log('\n🎉 所有 Release 资产已全部成功确认并更新至远程 GitHub！');
}

upload().catch(err => {
  console.error('上传过程出错:', err);
  process.exit(1);
});
