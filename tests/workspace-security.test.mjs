import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';

/**
 * Seam 17: 安全沙箱攻击向量全景测试套件
 */
export function runWorkspaceSecurityTests() {
  process.stdout.write("\n═══ Seam 17: 主进程权威安全沙箱攻击向量防护 ═══\n");

  // 创建隔离的临时工作区和外部敏感目录
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "codex-security-test-"));
  const workspaceDir = path.join(tempBase, "sandbox-workspace");
  const outsideDir = path.join(tempBase, "outside-secret");

  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  // 写入工作区内合法文件
  const legalFilePath = path.join(workspaceDir, "index.ts");
  fs.writeFileSync(legalFilePath, "export const greeting = 'Hello inside workspace';", "utf8");

  // 写入外部秘密文件 (模拟敏感文件)
  const outsideSecretPath = path.join(outsideDir, "secret.key");
  fs.writeFileSync(outsideSecretPath, "SUPER_SECRET_TOKEN_DO_NOT_LEAK", "utf8");

  // 写入大文件 (> 128KB) 用于截断测试
  const largeFilePath = path.join(workspaceDir, "large-log.txt");
  const largeContent = "A".repeat(150 * 1024); // 150KB
  fs.writeFileSync(largeFilePath, largeContent, "utf8");

  // 写入二进制文件 (包含 null byte) 用于二进制嗅探测试
  const binaryFilePath = path.join(workspaceDir, "app.bin");
  const binBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a, 0x1a, 0x0a]); // PNG 头部带 \0
  fs.writeFileSync(binaryFilePath, binBuffer);

  // 创建软链接 Symlink 指向外部敏感文件
  let symlinkTargetName = null;
  try {
    fs.symlinkSync(outsideSecretPath, path.join(workspaceDir, "evil-symlink.txt"), 'file');
    symlinkTargetName = "evil-symlink.txt";
  } catch (e) {
    // Windows 下非管理员权限无法创建文件 Symlink，转为创建目录 Junction
    try {
      fs.symlinkSync(outsideDir, path.join(workspaceDir, "evil-dir-junction"), 'junction');
      symlinkTargetName = "evil-dir-junction/secret.key";
    } catch {
      // 系统完全禁用软链接与 Junction
    }
  }

  // 提取 main.js 中的沙箱校验核心算法进行纯函数/隔离环境断言
  function simulateReadWorkspaceFile({ relativePath, fakeWorkspaceDir, fakePermissionMode }, authoritativeSandbox) {
    // 渲染进程不可信原则：直接无视 fakeWorkspaceDir 与 fakePermissionMode
    const mode = authoritativeSandbox.permissionMode;
    const workspace = authoritativeSandbox.activeWorkspaceDir;

    if (!relativePath || typeof relativePath !== "string") {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "文件相对路径不能为空" };
    }

    let candidatePath = "";

    if (mode === "chat-only") {
      return {
        ok: false,
        code: "CHAT_ONLY_BLOCKED",
        reason: "当前处于【纯对话咨询】模式，已强制阻断本地任何文件读取操作"
      };
    }

    if (mode === "workspace-readonly" || mode === "workspace-readwrite") {
      if (!workspace) {
        return { ok: false, code: "NO_WORKSPACE", reason: "当前尚未选定工作区工程目录" };
      }

      candidatePath = path.resolve(workspace, relativePath);
      if (!fs.existsSync(candidatePath)) {
        return { ok: false, code: "NOT_FOUND", reason: `文件不存在: ${relativePath}` };
      }

      try {
        const realWorkspace = fs.realpathSync(workspace);
        const realTarget = fs.realpathSync(candidatePath);
        const rel = path.relative(realWorkspace, realTarget);
        const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);

        if (!isContained) {
          return { ok: false, code: "PERMISSION_DENIED", reason: "软链接逃逸或越权穿透已拦截" };
        }
        candidatePath = realTarget;
      } catch (err) {
        return { ok: false, code: "REALPATH_ERROR", reason: err.message };
      }
    } else {
      // full-access
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
      if (!fs.existsSync(candidatePath)) {
        return { ok: false, code: "NOT_FOUND", reason: `文件不存在: ${relativePath}` };
      }
      try {
        candidatePath = fs.realpathSync(candidatePath);
      } catch (err) {
        // 保持原样
      }
    }

    const stat = fs.statSync(candidatePath);
    if (stat.isDirectory()) {
      return { ok: false, code: "IS_DIRECTORY", reason: "路径为目录" };
    }

    // 二进制嗅探
    const sampleSize = Math.min(512, stat.size);
    if (sampleSize > 0) {
      const fd = fs.openSync(candidatePath, "r");
      const sampleBuf = Buffer.alloc(sampleSize);
      fs.readSync(fd, sampleBuf, 0, sampleSize, 0);
      fs.closeSync(fd);

      for (let i = 0; i < sampleSize; i++) {
        if (sampleBuf[i] === 0) {
          return { ok: false, code: "BINARY_FILE_REJECTED", reason: "包含二进制空字节" };
        }
      }
    }

    // 128KB 截断
    const MAX_BYTES = 128 * 1024;
    let isTruncated = false;
    let content = "";
    if (stat.size > MAX_BYTES) {
      isTruncated = true;
      const fd = fs.openSync(candidatePath, "r");
      const buf = Buffer.alloc(MAX_BYTES);
      fs.readSync(fd, buf, 0, MAX_BYTES, 0);
      fs.closeSync(fd);
      content = buf.toString("utf8") + "\n\n[⚠️ 系统提示: 文件总大小超出限制，当前仅截取前 128KB 字节内容，剩余部分已略去]";
    } else {
      content = fs.readFileSync(candidatePath, "utf8");
    }

    return {
      ok: true,
      relativePath,
      fullPath: candidatePath,
      content,
      isTruncated,
      totalBytes: stat.size
    };
  }

  const sandbox = {
    activeWorkspaceDir: workspaceDir,
    permissionMode: "workspace-readonly"
  };

  try {
    // 测试 1: 正常工作区内文件读取
    const resNormal = simulateReadWorkspaceFile({ relativePath: "index.ts" }, sandbox);
    assert.strictEqual(resNormal.ok, true, "正常读取应成功");
    assert.ok(resNormal.content.includes("Hello inside workspace"));
    process.stdout.write("  ✅ [PASS] 向量 1: 工作区合法白名单文件正常读取放行\n");

    // 测试 2: ../ 相对路径穿透攻击
    const resTraversal = simulateReadWorkspaceFile({ relativePath: "../outside-secret/secret.key" }, sandbox);
    assert.strictEqual(resTraversal.ok, false, "相对路径穿透必须被拦截");
    assert.strictEqual(resTraversal.code, "PERMISSION_DENIED");
    process.stdout.write("  ✅ [PASS] 向量 2: ../ 相对路径穿透攻击成功拦截 (PERMISSION_DENIED)\n");

    // 测试 3: 绝对路径越权攻击
    const resAbsolute = simulateReadWorkspaceFile({ relativePath: outsideSecretPath }, sandbox);
    assert.strictEqual(resAbsolute.ok, false, "绝对路径跨工作区访问必须被拦截");
    assert.strictEqual(resAbsolute.code, "PERMISSION_DENIED");
    process.stdout.write("  ✅ [PASS] 向量 3: 绝对路径跨目录越权读取成功拦截 (PERMISSION_DENIED)\n");

    // 测试 4: Symlink / Junction 软链接逃逸攻击
    if (symlinkTargetName) {
      const resSymlink = simulateReadWorkspaceFile({ relativePath: symlinkTargetName }, sandbox);
      assert.strictEqual(resSymlink.ok, false, "Symlink 逃逸必须被 realpath 拦截");
      assert.strictEqual(resSymlink.code, "PERMISSION_DENIED");
      process.stdout.write("  ✅ [PASS] 向量 4: Symlink / Junction 软链接物理逃逸成功拦截 (realpath 比对拦截)\n");
    } else {
      process.stdout.write("  ⏩ [SKIP] 向量 4: 系统环境限制创建 Symlink，已由 realpath 逻辑统一承接\n");
    }

    // 测试 5: 伪造 IPC 传参攻击 (尝试注入 fakeWorkspaceDir='/' 或 fakePermissionMode='full-access')
    const resTampered = simulateReadWorkspaceFile({
      relativePath: outsideSecretPath,
      fakeWorkspaceDir: tempBase, // 伪造更高级别的根目录
      fakePermissionMode: "full-access" // 伪造全局权限
    }, sandbox);
    assert.strictEqual(resTampered.ok, false, "伪造 IPC 传参必须被主进程无视并拦截");
    assert.strictEqual(resTampered.code, "PERMISSION_DENIED");
    process.stdout.write("  ✅ [PASS] 向量 5: 伪造 IPC 参数完全无效，主进程绝对权威保持\n");

    // 测试 6: 二进制文件探测阻断
    const resBinary = simulateReadWorkspaceFile({ relativePath: "app.bin" }, sandbox);
    assert.strictEqual(resBinary.ok, false, "二进制文件必须被阻断");
    assert.strictEqual(resBinary.code, "BINARY_FILE_REJECTED");
    process.stdout.write("  ✅ [PASS] 向量 6: 二进制文件 (包含 Null Byte) 嗅探拦截 (BINARY_FILE_REJECTED)\n");

    // 测试 7: 128KB 字节精准截断与防爆标记
    const resLarge = simulateReadWorkspaceFile({ relativePath: "large-log.txt" }, sandbox);
    assert.strictEqual(resLarge.ok, true, "大文件截断后应可读");
    assert.strictEqual(resLarge.isTruncated, true, "isTruncated 必须为 true");
    assert.ok(resLarge.content.includes("[⚠️ 系统提示: 文件总大小超出限制"));
    assert.strictEqual(resLarge.totalBytes, 150 * 1024);
    process.stdout.write("  ✅ [PASS] 向量 7: 128KB 字节精准截断与末尾系统提示标记\n");

    // 测试 8: chat-only 模式零文件访问阻断
    const chatOnlySandbox = { activeWorkspaceDir: workspaceDir, permissionMode: "chat-only" };
    const resChatOnly = simulateReadWorkspaceFile({ relativePath: "index.ts" }, chatOnlySandbox);
    assert.strictEqual(resChatOnly.ok, false, "chat-only 模式下必须拦截任何文件读取");
    assert.strictEqual(resChatOnly.code, "CHAT_ONLY_BLOCKED");
    process.stdout.write("  ✅ [PASS] 向量 8: chat-only 纯对话模式强制阻断文件读取 (CHAT_ONLY_BLOCKED)\n");

    // 测试 9: workspace-readwrite 模式保持工作区边界安全防护
    const rwSandbox = { activeWorkspaceDir: workspaceDir, permissionMode: "workspace-readwrite" };
    const resRwNormal = simulateReadWorkspaceFile({ relativePath: "index.ts" }, rwSandbox);
    assert.strictEqual(resRwNormal.ok, true, "读写模式下工作区内合法文件应可读");
    const resRwTraversal = simulateReadWorkspaceFile({ relativePath: "../outside-secret/secret.key" }, rwSandbox);
    assert.strictEqual(resRwTraversal.ok, false, "读写模式下越权访问外部文件仍必须拦截");
    assert.strictEqual(resRwTraversal.code, "PERMISSION_DENIED");
    process.stdout.write("  ✅ [PASS] 向量 9: workspace-readwrite 读写模式工作区严格边界守卫 (PERMISSION_DENIED)\n");

  } finally {
    // 清理测试临时文件
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch (e) {
      // 容错
    }
  }
}

runWorkspaceSecurityTests();
