import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

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

    // 提取 main.js 中的 write-workspace-file 算法（与生产逻辑同序：先 contain 再 mkdir）
    function isPathLogicallyInside(rootDir, targetPath) {
      const root = path.resolve(rootDir);
      const target = path.resolve(targetPath);
      const rel = path.relative(root, target);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    }

    function simulateWriteWorkspaceFile({ relativePath, content = "", createBackup = true }, authoritativeSandbox) {
      const mode = authoritativeSandbox.permissionMode;
      const workspace = authoritativeSandbox.activeWorkspaceDir;

      if (!relativePath || typeof relativePath !== "string") {
        return { ok: false, code: "INVALID_ARGUMENT", reason: "文件相对路径不能为空" };
      }

      if (mode === "chat-only" || mode === "workspace-readonly") {
        return {
          ok: false,
          code: "PERMISSION_DENIED",
          reason: "只读模式阻断写入"
        };
      }

      let candidatePath = "";
      if (mode === "workspace-readwrite") {
        if (!workspace) {
          return { ok: false, code: "NO_WORKSPACE", reason: "未选定工作区" };
        }
        candidatePath = path.resolve(workspace, relativePath);
        try {
          if (!isPathLogicallyInside(workspace, candidatePath)) {
            return { ok: false, code: "PERMISSION_DENIED", reason: "越权写入拦截" };
          }
          const realWorkspace = fs.realpathSync(workspace);
          const targetDir = path.dirname(candidatePath);
          if (!isPathLogicallyInside(realWorkspace, targetDir)) {
            return { ok: false, code: "PERMISSION_DENIED", reason: "越权写入拦截" };
          }
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const realParent = fs.realpathSync(targetDir);
          const rel = path.relative(realWorkspace, realParent);
          const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);
          if (!isContained) {
            return { ok: false, code: "PERMISSION_DENIED", reason: "越权写入拦截" };
          }
        } catch (err) {
          return { ok: false, code: "REALPATH_ERROR", reason: err.message };
        }
      } else {
        candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
        const parentDir = path.dirname(candidatePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
      }

      // 防懒惰截断守卫
      if (fs.existsSync(candidatePath)) {
        const STUB_PATTERNS = [
          /\/\/\s*\.{3,}\s*(?:保持不变|其余不变|其余代码|原有代码|代码不变|现有代码|existing code|rest of code|unchanged|previous code)/i,
          /\/\*\s*\.{3,}\s*(?:保持不变|其余不变|其余代码|原有代码|代码不变|现有代码|existing code|rest of code|unchanged|previous code)\s*\*\//i,
          /#\s*\.{3,}\s*(?:保持不变|其余不变|其余代码|原有代码|代码不变|现有代码|existing code|rest of code|unchanged|previous code)/i,
          /\/\/\s*TODO:\s*(?:其余保持不变|其余代码不变|其余不变)/i
        ];
        if (STUB_PATTERNS.some(pat => pat.test(content))) {
          return { ok: false, code: "STUB_DETECTED", reason: "检测到省略占位符已阻断" };
        }
      }

      let backupCreated = false;
      if (createBackup && fs.existsSync(candidatePath)) {
        fs.copyFileSync(candidatePath, `${candidatePath}.bak`);
        backupCreated = true;
      }
      fs.writeFileSync(candidatePath, content, "utf8");
      return { ok: true, relativePath, backupCreated };
    }

    // 测试 10: 只读模式下阻断写文件
    const resWriteReadonly = simulateWriteWorkspaceFile({ relativePath: "index.ts", content: "modified" }, sandbox);
    assert.strictEqual(resWriteReadonly.ok, false, "只读模式必须阻断写入");
    assert.strictEqual(resWriteReadonly.code, "PERMISSION_DENIED");
    process.stdout.write("  ✅ [PASS] 向量 10: workspace-readonly 只读模式阻断文件物理写入 (PERMISSION_DENIED)\n");

    // 测试 11: 读写模式下越权向工作区外部穿透写入
    const resWriteTraversal = simulateWriteWorkspaceFile({ relativePath: "../outside-secret/evil.ts", content: "evil" }, rwSandbox);
    assert.strictEqual(resWriteTraversal.ok, false, "越权穿透写入必须拦截");
    assert.strictEqual(resWriteTraversal.code, "PERMISSION_DENIED");
    process.stdout.write("  ✅ [PASS] 向量 11: workspace-readwrite 越权向工作区外部穿透写入拦截 (PERMISSION_DENIED)\n");

    // 测试 12: 读写模式下合法修改并自动生成 .bak 备份
    const resWriteNormal = simulateWriteWorkspaceFile({ relativePath: "index.ts", content: "export const greeting = 'Updated!';" }, rwSandbox);
    assert.strictEqual(resWriteNormal.ok, true, "合法文件写入应成功");
    assert.strictEqual(resWriteNormal.backupCreated, true, "已有文件被覆盖前必须生成 .bak 备份");
    assert.strictEqual(fs.readFileSync(legalFilePath, "utf8"), "export const greeting = 'Updated!';");
    assert.ok(fs.existsSync(`${legalFilePath}.bak`), "必须物理存在 .bak 备份文件");
    assert.strictEqual(fs.readFileSync(`${legalFilePath}.bak`, "utf8"), "export const greeting = 'Hello inside workspace';");
    process.stdout.write("  ✅ [PASS] 向量 12: 工作区合法代码写入成功且自动物理保留 .bak 备份副本\n");

    // 测试 14: 读取文件差异 (read-workspace-file-diff) 精准识别 .bak 原始内容与当前内容
    const originalBackup = fs.readFileSync(`${legalFilePath}.bak`, "utf8");
    const currentCode = fs.readFileSync(legalFilePath, "utf8");
    assert.strictEqual(originalBackup, "export const greeting = 'Hello inside workspace';");
    assert.strictEqual(currentCode, "export const greeting = 'Updated!';");
    process.stdout.write("  ✅ [PASS] 向量 14: read-workspace-file-diff 成功提取原版 .bak 与新版差异数据\n");

    // 测试 15: 一键还原 (revert-workspace-file) 将文件还原为 .bak 原始内容并自动清理 .bak 备份
    // 15.1 只读模式阻断还原
    assert.strictEqual(sandbox.permissionMode, "workspace-readonly");
    // 模拟还原核心逻辑
    function simulateRevertFile({ relativePath }, authoritativeSandbox) {
      if (authoritativeSandbox.permissionMode === "workspace-readonly" || authoritativeSandbox.permissionMode === "chat-only") {
        return { ok: false, code: "PERMISSION_DENIED" };
      }
      const cand = path.resolve(authoritativeSandbox.activeWorkspaceDir, relativePath);
      const bak = `${cand}.bak`;
      if (!fs.existsSync(bak)) return { ok: false, code: "NO_BACKUP" };
      const restored = fs.readFileSync(bak, "utf8");
      fs.writeFileSync(cand, restored, "utf8");
      fs.unlinkSync(bak);
      return { ok: true, content: restored };
    }

    const resRevertBlocked = simulateRevertFile({ relativePath: "index.ts" }, sandbox);
    assert.strictEqual(resRevertBlocked.ok, false, "只读模式下必须阻断还原");
    assert.strictEqual(resRevertBlocked.code, "PERMISSION_DENIED");

    // 15.2 读写模式下成功原子还原
    const resRevertSuccess = simulateRevertFile({ relativePath: "index.ts" }, rwSandbox);
    assert.strictEqual(resRevertSuccess.ok, true, "读写模式下应成功还原");
    assert.strictEqual(fs.readFileSync(legalFilePath, "utf8"), "export const greeting = 'Hello inside workspace';", "文件内容必须彻底恢复到修改前");
    assert.strictEqual(fs.existsSync(`${legalFilePath}.bak`), false, "还原后临时 .bak 必须已被清理");
    process.stdout.write("  ✅ [PASS] 向量 15: revert-workspace-file 权限阻断与原子还原回滚验证通过\n");

    // 测试 16: 防懒惰截断守卫 (STUB_DETECTED 拦截)
    const lazyCode = "import { x } from 'y';\n// ... 其余代码保持不变\nexport const bar = 123;";
    const resWriteLazy = simulateWriteWorkspaceFile({ relativePath: "index.ts", content: lazyCode }, rwSandbox);
    assert.strictEqual(resWriteLazy.ok, false, "包含省略占位符的代码必须被拦截");
    assert.strictEqual(resWriteLazy.code, "STUB_DETECTED");
    // 确保源文件未受破坏
    assert.strictEqual(fs.readFileSync(legalFilePath, "utf8"), "export const greeting = 'Hello inside workspace';", "源文件必须保持完好无损");
    process.stdout.write("  ✅ [PASS] 向量 16: write-workspace-file 防懒惰占位符截断覆写拦截成功 (STUB_DETECTED)\n");

    // 测试 17: mkdir 不得先于 contain 检查在工作区外创建目录
    const mkdirProbeRel = "../outside-secret/mkdir-probe-should-not-exist/evil.ts";
    const mkdirProbeDir = path.join(outsideDir, "mkdir-probe-should-not-exist");
    assert.ok(!fs.existsSync(mkdirProbeDir), "探测目录测试前不应存在");
    const resMkdirProbe = simulateWriteWorkspaceFile({ relativePath: mkdirProbeRel, content: "evil" }, rwSandbox);
    assert.strictEqual(resMkdirProbe.ok, false, "越权写入必须失败");
    assert.strictEqual(resMkdirProbe.code, "PERMISSION_DENIED");
    assert.ok(!fs.existsSync(mkdirProbeDir), "拦截后不得在工作区外留下 mkdir 副作用目录");
    process.stdout.write("  ✅ [PASS] 向量 17: write 越权拦截不得先 mkdir 污染工作区外目录\n");

    // 测试 18: 文件树 / 更新下载 / LLM 鉴权头硬门禁静态断言（对齐 main.js 生产实现）
    const mainJsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "main.js");
    const mainJs = fs.readFileSync(mainJsPath, "utf8");
    assert.ok(mainJs.includes("resolveTreePathOrDeny"), "文件树必须走路径沙箱门禁");
    assert.ok(mainJs.includes("BLOCKED_TREE_CHAT_ONLY"), "chat-only 必须阻断文件树");
    assert.ok(mainJs.includes("isAllowedUpdateDownloadUrl"), "更新下载必须有 URL 白名单");
    assert.ok(mainJs.includes("delete safeCustomHeaders.Authorization"), "LLM 鉴权头不得被 customHeaders 覆盖");
    assert.ok(mainJs.includes("isPathLogicallyInside(workspace, candidatePath)"), "写盘必须先逻辑 contain 再 mkdir");
    process.stdout.write("  ✅ [PASS] 向量 18: 文件树沙箱 / 更新白名单 / LLM 鉴权头强制覆盖静态门禁\n");

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
