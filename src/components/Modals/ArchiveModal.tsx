import React, { useState, useEffect } from 'react';
import { X, Folder, FolderPlus, Check, MessageSquare, ArrowRightLeft } from 'lucide-react';
import { ChatSession, WorkspaceFolder } from '@/types/session';

interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ChatSession | null;
  workspaceFolders: WorkspaceFolder[];
  onConfirm: (
    sessionId: string,
    targetWorkspaceDir?: string,
    targetWorkspaceName?: string,
    archive?: boolean
  ) => void;
  onSelectNewFolder: () => Promise<WorkspaceFolder | null>;
}

export const ArchiveModal: React.FC<ArchiveModalProps> = ({
  isOpen,
  onClose,
  session,
  workspaceFolders,
  onConfirm,
  onSelectNewFolder,
}) => {
  // 选中的工作区路径（空字符串表示未绑定通用会话）
  const [selectedDir, setSelectedDir] = useState<string>('');
  const [selectedName, setSelectedName] = useState<string>('');
  // 保持原有会话的归档状态，默认绝不强行归档隐藏！
  const [shouldArchive, setShouldArchive] = useState<boolean>(false);

  // 初始化选择状态
  useEffect(() => {
    if (session && isOpen) {
      if (session.workspaceDir) {
        setSelectedDir(session.workspaceDir);
        setSelectedName(session.workspaceName || '当前工程');
      } else if (workspaceFolders.length > 0) {
        setSelectedDir(workspaceFolders[0].path);
        setSelectedName(workspaceFolders[0].name);
      } else {
        setSelectedDir('');
        setSelectedName('');
      }
      setShouldArchive(session.isArchived || false);
    }
  }, [session, isOpen, workspaceFolders]);

  if (!isOpen || !session) return null;

  const handleSelectWorkspace = (path: string, name: string) => {
    setSelectedDir(path);
    setSelectedName(name);
  };

  const handlePickNewFolder = async () => {
    const newFolder = await onSelectNewFolder();
    if (newFolder) {
      setSelectedDir(newFolder.path);
      setSelectedName(newFolder.name);
    }
  };

  const handleSubmit = () => {
    if (!selectedDir) {
      // 移至通用未绑定
      onConfirm(session.id, undefined, undefined, shouldArchive);
    } else {
      onConfirm(session.id, selectedDir, selectedName, shouldArchive);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="p-4 bg-bg-sidebar border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center font-bold">
              <ArrowRightLeft size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">归入项目目录</h3>
              <p className="text-[11px] text-text-muted truncate max-w-[280px]">
                归类对话至对应工程：{session.title || '新会话'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* 主体选择区域 */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
              <span>选择目标项目文件夹</span>
              <span className="text-[10px] text-text-muted">点击即归入该项目名下陈列</span>
            </label>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {/* 已有工作区文件夹 */}
              {workspaceFolders.map((wf) => {
                const isSelected = selectedDir === wf.path;
                return (
                  <div
                    key={wf.path}
                    onClick={() => handleSelectWorkspace(wf.path, wf.name)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-accent bg-accent/10 text-accent font-medium shadow-xs'
                        : 'border-border bg-bg-base hover:bg-bg-hover text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Folder
                        size={15}
                        className={isSelected ? 'text-accent shrink-0' : 'text-amber-400 shrink-0'}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[12px] truncate">{wf.name}</div>
                        <div className="text-[10px] text-text-muted font-mono truncate">{wf.path}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-accent shrink-0 ml-2" />}
                  </div>
                );
              })}

              {/* 浏览并选择新工作区 */}
              <button
                type="button"
                onClick={handlePickNewFolder}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-border hover:border-accent hover:bg-accent/5 text-text-secondary hover:text-accent text-xs transition-colors cursor-pointer"
              >
                <FolderPlus size={14} />
                <span>+ 浏览本地新项目文件夹并移入</span>
              </button>

              {/* 移至通用独立会话 (未绑定) */}
              <div
                onClick={() => handleSelectWorkspace('', '')}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                  selectedDir === ''
                    ? 'border-accent bg-accent/10 text-accent font-medium shadow-xs'
                    : 'border-border/80 bg-bg-base hover:bg-bg-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare
                    size={14}
                    className={selectedDir === '' ? 'text-accent shrink-0' : 'text-text-muted shrink-0'}
                  />
                  <div>
                    <div className="font-semibold text-[12px]">移出工程（转为通用独立会话）</div>
                    <div className="text-[10px] text-text-muted">不归属于任何特定工程，作为全局独立对话管理</div>
                  </div>
                </div>
                {selectedDir === '' && <Check size={14} className="text-accent shrink-0 ml-2" />}
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-4 bg-bg-sidebar border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-98"
          >
            <Check size={13} />
            <span>确认归入</span>
          </button>
        </div>
      </div>
    </div>
  );
};
