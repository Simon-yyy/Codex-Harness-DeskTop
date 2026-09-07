import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  permissionMode?: string;
  workspaceDir?: string | null;
  onFileWritten?: (filePath: string) => void;
  onPermissionChange?: (mode: string) => void;
  isStreaming?: boolean;
}

// 格式化语言名称显示 (如 powershell -> PowerShell)
function formatLang(lang: string): string {
  if (!lang) return 'Code';
  const lower = lang.toLowerCase();
  if (lower === 'powershell' || lower === 'ps1') return 'PowerShell';
  if (lower === 'javascript' || lower === 'js') return 'JavaScript';
  if (lower === 'typescript' || lower === 'ts') return 'TypeScript';
  if (lower === 'python' || lower === 'py') return 'Python';
  if (lower === 'bash' || lower === 'sh' || lower === 'shell') return 'Bash';
  if (lower === 'json') return 'JSON';
  if (lower === 'html') return 'HTML';
  if (lower === 'css') return 'CSS';
  if (lower === 'sql') return 'SQL';
  if (lower === 'java') return 'Java';
  if (lower === 'rust' || lower === 'rs') return 'Rust';
  if (lower === 'markdown' || lower === 'md') return 'Markdown';
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

// 纯净极简代码块组件 (对齐 Claude/Cursor 主流标准：仅极淡语言名 + 复制图标)
const CodeBlock: React.FC<{
  language: string;
  code: string;
}> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border/70 bg-[var(--code-bg,#1c1c1d)] shadow-2xs transition-all">
      {/* 顶部极简信息栏 */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-bg-sidebar/50 border-b border-border/40 text-[11px] select-none">
        <span className="font-mono text-[11px] text-text-muted/80">{formatLang(language)}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          title="复制代码内容"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          <span className={`text-[10px] ${copied ? 'text-emerald-400 font-medium' : ''}`}>
            {copied ? '已复制' : ''}
          </span>
        </button>
      </div>

      {/* 代码内容主体 */}
      <pre className="p-3.5 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-text-primary bg-[var(--code-bg,#1c1c1d)] select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// 行内语法解析器：处理 `code` 与 **bold**
function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(regex);

  parts.forEach((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      tokens.push(
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-bg-card border border-border/80 text-text-primary font-mono text-[11px] font-medium select-text"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      tokens.push(
        <strong key={i} className="font-semibold text-text-primary">
          {renderInline(part.slice(2, -2))}
        </strong>
      );
    } else if (part) {
      tokens.push(part);
    }
  });

  return tokens;
}

// 现代化工业级卡片表格组件 (对齐 GitHub / Notion / Linear 质感)
const TableBlock: React.FC<{
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
}> = ({ headers, alignments, rows }) => {
  return (
    <div className="my-3 w-full overflow-hidden rounded-xl border border-border/80 bg-bg-card/50 shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px] leading-relaxed text-text-primary min-w-full">
          <thead>
            <tr className="bg-bg-sidebar/90 border-b border-border text-text-primary font-semibold select-none">
              {headers.map((h, hIdx) => {
                const align = alignments[hIdx] || 'left';
                const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
                return (
                  <th
                    key={hIdx}
                    className={`px-3.5 py-2.5 whitespace-nowrap text-xs font-semibold ${alignClass}`}
                  >
                    {renderInline(h)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-bg-hover/40 transition-colors"
              >
                {headers.map((_, cIdx) => {
                  const cell = row[cIdx] !== undefined ? row[cIdx] : '';
                  const align = alignments[cIdx] || 'left';
                  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
                  return (
                    <td
                      key={cIdx}
                      className={`px-3.5 py-2 text-text-secondary select-text ${alignClass}`}
                    >
                      {renderInline(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// 检查是否为 Markdown 表格分隔线 (如 |---|---| 或 |:---|:---:|---:|)
function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed);
}

// 拆分表格行单元格
function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(c => c.trim());
}

// 提取列对齐方式
function parseAlignments(delimiterRow: string): ('left' | 'center' | 'right')[] {
  const cells = splitTableRow(delimiterRow);
  return cells.map(cell => {
    const hasLeft = cell.startsWith(':');
    const hasRight = cell.endsWith(':');
    if (hasLeft && hasRight) return 'center';
    if (hasRight) return 'right';
    return 'left';
  });
}

// 行段落解析器：处理标题、列表、引用、表格、自然留白等
function renderParagraphBlock(text: string, blockKey: string | number): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      elements.push(<div key={`${blockKey}_empty_${i}`} className="h-1.5" />);
      continue;
    }

    // 0. 表格语法捕获 (表头 + 分隔行 + 连续数据行)
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableDelimiterRow(lines[i + 1])
    ) {
      const headers = splitTableRow(lines[i]);
      const alignments = parseAlignments(lines[i + 1]);
      const tableRows: string[][] = [];

      let j = i + 2;
      while (j < lines.length) {
        const rowLine = lines[j].trim();
        if (!rowLine || !rowLine.includes('|')) {
          break;
        }
        tableRows.push(splitTableRow(rowLine));
        j++;
      }

      elements.push(
        <TableBlock
          key={`${blockKey}_table_${i}`}
          headers={headers}
          alignments={alignments}
          rows={tableRows}
        />
      );

      i = j - 1;
      continue;
    }

    // 1. 消除生硬贯穿横线：将 --- 或 *** 转化为极其自然的轻量段落微距间隙，绝不画切断视觉的长粗黑线
    if (/^(\*\*\*|---|___)$/.test(line)) {
      elements.push(<div key={`${blockKey}_gap_${i}`} className="h-2 my-1" />);
      continue;
    }

    // 2. 标题阶梯 (增强字号阶梯与上下呼吸感边距)
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`${blockKey}_h1_${i}`} className="text-[15px] font-bold text-text-primary mt-4 mb-2 tracking-tight">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`${blockKey}_h2_${i}`} className="text-[13.5px] font-bold text-text-primary mt-3 mb-1.5">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`${blockKey}_h3_${i}`} className="text-[12.5px] font-semibold text-text-primary mt-2.5 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={`${blockKey}_h4_${i}`} className="text-[12px] font-medium text-text-secondary mt-2 mb-0.5">
          {renderInline(line.slice(5))}
        </h4>
      );
      continue;
    }

    // 3. 引用块 (微光底色与左边框厚实度强化)
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`${blockKey}_quote_${i}`} className="border-l-[3px] border-accent/70 pl-3.5 py-1.5 my-2 bg-accent/5 rounded-r-lg text-text-secondary text-[12.5px] leading-relaxed select-text">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // 4. 无序列表 (- 或 * 开头)：小圆点精致对齐，呼吸感行高
    if (/^[-*]\s+/.test(line)) {
      const listContent = line.replace(/^[-*]\s+/, '');
      elements.push(
        <div key={`${blockKey}_ul_${i}`} className="flex items-start gap-2.5 ml-1 my-1 text-[13px] text-text-primary leading-[1.7]">
          <span className="text-text-muted/60 text-[6px] mt-2.5 shrink-0 select-none">●</span>
          <div className="flex-1">{renderInline(listContent)}</div>
        </div>
      );
      continue;
    }

    // 5. 有序列表 (数字. 开头)
    const orderMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderMatch) {
      const num = orderMatch[1];
      const listContent = orderMatch[2];
      elements.push(
        <div key={`${blockKey}_ol_${i}`} className="flex items-start gap-2 ml-1 my-1 text-[13px] text-text-primary leading-[1.7]">
          <span className="font-semibold text-accent/90 shrink-0 text-xs select-none">{num}.</span>
          <div className="flex-1">{renderInline(listContent)}</div>
        </div>
      );
      continue;
    }

    // 6. 普通正文行
    elements.push(
      <div key={`${blockKey}_p_${i}`} className="text-[13px] text-text-primary leading-[1.7] break-words select-text">
        {renderInline(rawLine)}
      </div>
    );
  }

  return <div key={blockKey} className="space-y-1">{elements}</div>;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
}) => {
  if (!content) return null;

  // 过滤推诿套话
  const effectiveContent = content
    .replace(/(?:(?:已写入工作区|已存入本地|落盘完成|代码已写入)[^\n]*?(?:若工作区没有|若未自动落盘|把下方代码块手动存为|请手动|若未触发)[^\n]*[：:]?\s*)/gi, '')
    .replace(/(?:若本轮落盘未触发[^\n]*\n?)/gi, '')
    .replace(/(?:请将该代码块手动保存[^\n]*\n?)/gi, '');

  const blocks: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const renderRegex = /```([^\r\n]*)\r?\n([\s\S]*?)(?:```|$)/g;

  while ((match = renderRegex.exec(effectiveContent)) !== null) {
    const textBefore = effectiveContent.slice(lastIndex, match.index);
    if (textBefore) {
      blocks.push(renderParagraphBlock(textBefore, `text_${lastIndex}`));
    }

    const rawHeader = match[1] || '';
    const language = rawHeader.trim().split(/\s+/)[0] || '';
    const code = match[2] ? match[2].replace(/\n$/, '') : '';

    blocks.push(
      <CodeBlock
        key={`code_${match.index}`}
        language={language}
        code={code}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  const remainingText = effectiveContent.slice(lastIndex);
  if (remainingText) {
    blocks.push(renderParagraphBlock(remainingText, `text_${lastIndex}`));
  }

  return (
    <div className="w-full space-y-1.5">
      {blocks}
    </div>
  );
};
