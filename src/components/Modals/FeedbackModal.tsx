import React, { useState, useEffect } from 'react';
import { X, Bug, Lightbulb, MessageSquare, ExternalLink, Copy, Check, ShieldCheck, Terminal } from 'lucide-react';
import { AppInfo, PermissionMode } from '@/types/electron';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel?: string;
  permissionMode?: PermissionMode;
}

type FeedbackType = 'bug' | 'feature' | 'general';

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  selectedModel = 'gpt-5.6-sol',
  permissionMode = 'workspace-readonly',
}) => {
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (isOpen && window.codexDesktop?.getAppInfo) {
      window.codexDesktop.getAppInfo().then(info => setAppInfo(info));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 生成结构化、无敏感 Key 的诊断报告
  const generateReport = () => {
    const typeLabel = type === 'bug' ? 'Bug 缺陷' : type === 'feature' ? '功能建议' : '体验反馈';
    return [
      `### 📌 反馈类型: ${typeLabel}`,
      `**标题**: ${title.trim() || '（未命名反馈）'}`,
      '',
      `### 📝 详细说明`,
      description.trim() || '（无详细说明）',
      '',
      `### 💻 客户端环境与诊断信息`,
      `- **应用版本**: Codex Desktop v${appInfo?.version || '1.1.2'}`,
      `- **运行平台**: ${appInfo?.platform || 'Windows'} (${appInfo?.arch || 'x64'})`,
      `- **当前使用模型**: ${selectedModel}`,
      `- **安全沙箱权限**: ${permissionMode}`,
      `- **生成时间**: ${new Date().toLocaleString()}`,
      `- **浏览器内核**: ${navigator.userAgent}`,
      '',
      `> 🛡️ *此诊断报告由客户端自动生成，已自动排除所有 API Key、密码与工作区私有源码。*`
    ].join('\n');
  };

  // 方式一：在浏览器打开预填好内容的 GitHub Issue
  const handleSubmitGitHub = () => {
    const issueTitle = `[${type === 'bug' ? 'BUG' : type === 'feature' ? 'FEAT' : 'FEEDBACK'}] ${title.trim() || '用户反馈'}`;
    const issueBody = generateReport();
    const label = type === 'bug' ? 'bug' : type === 'feature' ? 'enhancement' : 'feedback';

    const url = `https://github.com/Simon-yyy/Codex-Harness-DeskTop/issues/new?` +
      `title=${encodeURIComponent(issueTitle)}&` +
      `body=${encodeURIComponent(issueBody)}&` +
      `labels=${encodeURIComponent(label)}`;

    if (window.codexDesktop?.openExternal) {
      window.codexDesktop.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
    onClose();
  };

  // 方式二：复制诊断报告到剪贴板
  const handleCopyReport = () => {
    const report = generateReport();
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-5 bg-bg-sidebar border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center font-bold">
              <Bug size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">问题反馈与建议</h3>
              <p className="text-[11px] text-text-muted">快速向维护者上报 Bug、功能建议与排错诊断信息</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 主体表单 */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* 反馈类型切换 */}
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">反馈类型</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('bug')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  type === 'bug'
                    ? 'bg-red-500/15 border-red-500/50 text-red-400 font-semibold shadow-xs'
                    : 'border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <Bug size={13} />
                <span>Bug 缺陷</span>
              </button>
              <button
                type="button"
                onClick={() => setType('feature')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  type === 'feature'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-400 font-semibold shadow-xs'
                    : 'border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <Lightbulb size={13} />
                <span>功能建议</span>
              </button>
              <button
                type="button"
                onClick={() => setType('general')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  type === 'general'
                    ? 'bg-accent/15 border-accent/50 text-accent font-semibold shadow-xs'
                    : 'border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
              >
                <MessageSquare size={13} />
                <span>使用体验</span>
              </button>
            </div>
          </div>

          {/* 标题 */}
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              简要标题 <span className="text-text-muted font-normal">（如：流式生成中途意外截断）</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="一句话概括碰到的问题..."
              className="w-full text-xs px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary outline-none focus:border-accent"
            />
          </div>

          {/* 详细描述 */}
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              详细描述与复现步骤
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请描述触发问题的操作、预期效果和实际表现..."
              className="w-full text-xs p-3 bg-bg-base border border-border rounded-lg text-text-primary outline-none focus:border-accent resize-none leading-relaxed"
            />
          </div>

          {/* 自动诊断信息提示卡 */}
          <div className="p-3 bg-bg-base border border-border/80 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span className="flex items-center gap-1.5 font-medium text-text-secondary">
                <Terminal size={12} className="text-accent" />
                自动附带的诊断信息包
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
                <ShieldCheck size={11} /> 敏感 Key 已脱敏
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-text-muted">
              <div>客户端: v{appInfo?.version || '1.1.2'} ({appInfo?.platform || 'Windows'})</div>
              <div>当前模型: {selectedModel}</div>
              <div className="col-span-2">沙箱权限: {permissionMode}</div>
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="p-4 bg-bg-sidebar border-t border-border flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3 py-2 bg-bg-card border border-border hover:bg-bg-hover text-text-secondary hover:text-text-primary rounded-lg text-xs font-medium transition-colors cursor-pointer"
            title="复制完整 Markdown 报告到剪贴板，方便通过微信或邮件发送"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? '已复制诊断报告' : '复制诊断报告'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmitGitHub}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-accent to-accent-secondary hover:brightness-110 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-98"
            >
              <ExternalLink size={13} />
              <span>在 GitHub 提交 Issue</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
