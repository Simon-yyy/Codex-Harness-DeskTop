# ADR 0001: 全自动云端构建与无感在线静默更新机制 (In-App Online Auto-Update)

## 状态
已采纳 (Accepted) · 2026-09-14

## 背景与痛点
1. **用户体验割裂**：用户之前获取新版本时误以为必须“先卸载老版本再重新安装”，存在丢失配置与会话历史的心智负担。
2. **云端发布断层**：仓库内原有本地发版脚本，但缺少 GitHub Actions 自动化 CI/CD。开发者本地 `git push` 后，GitHub Releases 不会自动产出编译后的 `.exe` 安装包资产。
3. **安装覆写参数缺失**：客户端在下载安装包后调用 `spawn(installerPath, ["--updated"])`，未传递 NSIS 静默覆写参数 `/S`，触发了交互式安装向导。
4. **网络穿透阻碍**：国内用户直连 GitHub Releases 资产下载时容易遇到超时或限速。

## 架构决策 (Decisions)

### 1. 云端 CI/CD 自动流水线 (`.github/workflows/release.yml`)
- **触发机制**：仅当推送符合语义化版本的 Git 标签（`v*`，如 `v1.1.9`）时自动触发，日常提交不浪费 Actions 额度。
- **环境矩阵**：运行在 GitHub 托管的 `windows-latest` 虚拟机环境。
- **全链路守卫**：
  1. 依赖洁癖安装 (`npm ci`)；
  2. 自动化测试套件守卫 (`npm test`，覆盖 Seam 1~18 全部 90+ 项断言)；
  3. 生产打包 (`npm run build`)；
  4. 调用 `softprops/action-gh-release@v2` 自动创建 GitHub Release 并上传 `.exe`、`.blockmap` 与 `RELEASE_NOTES.md`。

### 2. 客户端就地覆盖升级与状态守护 (In-Place Silent Upgrade)
- **零卸载承诺**：新版本安装绝对不触动用户数据（`localStorage` 会话数据、用户技能 `~/.codex/user-skills/`、安全配置与 API 凭据全部位于用户目录，永不丢失）。
- **静默安装执行**：下载完成并取得用户同意后，以 `/S` 静默参数启动安装包：
  `spawn(installerPath, ["/S", "--updated"], { detached: true, stdio: "ignore" }).unref()`
- **自动退出与拉起**：NSIS 静默覆写 `%LOCALAPPDATA%\Programs\Codex Desktop` 目录下的程序文件，并在 3 秒内自动重新拉起新版客户端。
- **退出时更新 (Exit-time Apply)**：支持用户选择「稍后退出时自动升级」，主进程在 `app.on("before-quit")` 生命周期中无声静默更新。

### 3. 多路由智能下载加速通道 (Resilient Download Pipeline)
- **版本探测**：优先 `github.com/.../releases/latest` 的 302 Location 解析 tag（不占 `api.github.com` 额度）；API 仅作回退。多仓（`Simon-yyy` 优先于旧镜像仓）取 semver 最高者，避免旧仓 latest 卡住导致「检查不到新版本」。
- **智能探测与镜像降级**：
  - 路由 1：官方直连 `https://github.com/...`；
  - 路由 2：若 8 秒内连接超时或报 HTTP 错误，自动无缝切换至加速镜像节点（如 `https://ghfast.top/`、`https://mirror.ghproxy.com/`）；
- **进度双向通知**：渲染进程实时接收 `update-progress` 事件并在界面展示百分比与速率。

## 影响与收益 (Consequences)
- **开发者**：真正实现“打 Tag 即发版”（`git tag v1.1.9 && git push --tags`），无需本地长时间打包与上传；
- **终端用户**：在软件内点击“检查更新”或接收到更新提示后，一键自动下载、静默覆盖升级、自动重启，完全免去卸载重装困扰。
