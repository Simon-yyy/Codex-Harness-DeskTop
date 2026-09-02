import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const OWNER = 'Simon-yyy';
const REPO = 'Codex-Harness-DeskTop';
const TAG = `v${pkg.version}`;

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
  let release;
  if (!relRes.ok) {
    if (relRes.status === 404) {
      console.log(`Release ${TAG} 不存在，正在自动创建 GitHub Release...`);
      const notesPath = path.join(path.resolve('release', TAG), 'RELEASE_NOTES.md');
      const body = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : `Codex Desktop ${TAG} Release`;
      const createRes = await fetchWithRetry(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tag_name: TAG,
          name: `Codex Desktop ${TAG}`,
          body: body,
          draft: false,
          prerelease: false
        })
      });
      if (!createRes.ok) {
        throw new Error(`创建 Release 失败: ${createRes.status} ${await createRes.text()}`);
      }
      release = await createRes.json();
      console.log(`✓ 成功创建 Release: ${release.name} (ID: ${release.id})`);
    } else {
      throw new Error(`获取 Release 失败: ${relRes.status} ${await relRes.text()}`);
    }
  } else {
    release = await relRes.json();
    console.log(`✓ 找到 Release: ${release.name} (ID: ${release.id})`);
  }
  console.log(`   已有资产数: ${release.assets ? release.assets.length : 0}`);

  const existingNames = new Set(release.assets.map(a => a.name));

  // 本地要上传的文件
  const releaseFolder = path.resolve('release', TAG);
  const filesToUpload = [
    {
      filePath: path.join(releaseFolder, `Codex Desktop Setup ${pkg.version}.exe`),
      name: `Codex.Desktop.Setup.${pkg.version}.exe`,
      contentType: 'application/octet-stream'
    },
    {
      filePath: path.join(releaseFolder, `Codex Desktop Setup ${pkg.version}.exe.blockmap`),
      name: `Codex.Desktop.Setup.${pkg.version}.exe.blockmap`,
      contentType: 'application/octet-stream'
    }
  ];

  const uploadUrlTemplate = release.upload_url.replace(/\{(\?.*)?\}$/, '');

  for (const item of filesToUpload) {
    const existingAsset = (release.assets || []).find(a => a.name === item.name);
    if (existingAsset) {
      await fetchWithRetry(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${existingAsset.id}`, {
        method: 'DELETE',
        headers
      });
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
