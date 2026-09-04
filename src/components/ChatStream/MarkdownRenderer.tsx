import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

// 独立代码块组件 (对标主流 ChatGPT / Claude / Cursor 样式)
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 格式化语言名称显示 (如 powershell -> PowerShell)
  const formatLang = (lang: string) => {
    if (!lang) return 'Code';
    const lower = lang.toLowerCase();
    if (lower === 'powershell') return 'PowerShell';
    if (lower === 'javascript' || lower === 'js') return 'JavaScript';
    if (lower === 'typescript' || lower === 'ts') return 'TypeScript';
    if (lower === 'python' || lower === 'py') return 'Python';
    if (lower === 'bash' || lower === 'sh') return 'Bash';
    if (lower === 'json') return 'JSON';
    if (lower === 'html') return 'HTML';
    if (lower === 'css') return 'CSS';
    if (lower === 'sql') return 'SQL';
    if (lower === 'java') return 'Java';
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#27272a] bg-[#18181b] shadow-xs transition-all">
      {/* 顶部标头栏 */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#202023] border-b border-[#2e2e33] text-[11px] text-[#a1a1aa] select-none">
        <span className="font-mono font-semibold text-xs text-[#d4d4d8]">{formatLang(language)}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-[#2e2e33] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer text-[11px] font-medium"
          title="复制代码内容"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          <span className={copied ? 'text-emerald-400 font-medium' : ''}>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      {/* 代码内容主体：等宽字体、水平自由滚动防折断 */}
      <pre className="p-3.5 overflow-x-auto text-xs font-mono leading-relaxed text-[#e4e4e7] bg-[#18181b] select-text">
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
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent font-mono text-[11px] font-medium select-text"
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

// 行段落解析器：处理标题、列表、引用、分割线等块级排版
function renderParagraphBlock(text: string, blockKey: string | number): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      elements.push(<div key={`${blockKey}_empty_${i}`} className="h-2" />);
      continue;
    }

    // 1. 分割线
    if (/^(\*\*\*|---|___)$/.test(line)) {
      elements.push(<hr key={`${blockKey}_hr_${i}`} className="my-3 border-border/50" />);
      continue;
    }

    // 2. 标题阶梯
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`${blockKey}_h1_${i}`} className="text-sm font-bold text-text-primary mt-3.5 mb-1.5 pb-1 border-b border-border/40">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`${blockKey}_h2_${i}`} className="text-xs font-bold text-text-primary mt-3 mb-1">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`${blockKey}_h3_${i}`} className="text-xs font-semibold text-text-primary mt-2.5 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={`${blockKey}_h4_${i}`} className="text-xs font-medium text-text-secondary mt-2 mb-0.5">
          {renderInline(line.slice(5))}
        </h4>
      );
      continue;
    }

    // 3. 引用块
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`${blockKey}_quote_${i}`} className="border-l-2 border-accent/70 pl-3 py-1 my-1.5 bg-accent/5 rounded-r text-text-muted text-xs leading-relaxed">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // 4. 无序列表 (- 或 * 开头)
    if (/^[-*]\s+/.test(line)) {
      const listContent = line.replace(/^[-*]\s+/, '');
      elements.push(
        <div key={`${blockKey}_ul_${i}`} className="flex items-start gap-2 ml-1 my-0.5 text-xs text-text-primary leading-relaxed">
          <span className="text-accent text-[9px] mt-1 shrink-0">●</span>
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
        <div key={`${blockKey}_ol_${i}`} className="flex items-start gap-1.5 ml-1 my-0.5 text-xs text-text-primary leading-relaxed">
          <span className="font-semibold text-accent shrink-0 text-xs">{num}.</span>
          <div className="flex-1">{renderInline(listContent)}</div>
        </div>
      );
      continue;
    }

    // 6. 普通正文行
    elements.push(
      <div key={`${blockKey}_p_${i}`} className="text-xs text-text-primary leading-relaxed break-words select-text">
        {renderInline(rawLine)}
      </div>
    );
  }

  return <div key={blockKey} className="space-y-1">{elements}</div>;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  // 流式代码块拆分算法：能够自动处理未闭合的代码块 (在生成中末尾没有 ```)
  const blocks: React.ReactNode[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore) {
      blocks.push(renderParagraphBlock(textBefore, `text_${lastIndex}`));
    }

    const language = match[1] || '';
    const code = match[2] ? match[2].replace(/\n$/, '') : '';
    blocks.push(<CodeBlock key={`code_${match.index}`} language={language} code={code} />);

    lastIndex = match.index + match[0].length;
  }

  const remainingText = content.slice(lastIndex);
  if (remainingText) {
    blocks.push(renderParagraphBlock(remainingText, `text_${lastIndex}`));
  }

  return <div className="w-full space-y-1">{blocks}</div>;
};
