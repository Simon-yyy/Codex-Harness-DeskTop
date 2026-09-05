#!/usr/bin/env node
import fs from 'node:fs';

/**
 * 跨平台 Git 高危指令拦截护栏 (Windows / macOS / Linux 原生支持)
 * 兼容 Claude Code PreToolUse Hook 与本地命令行防护
 */

export const DANGEROUS_RULES = [
  { pattern: /\bgit\s+push\b/i, desc: 'git push (禁止私自向远程仓库推送)' },
  { pattern: /\bgit\s+reset\s+--hard\b/i, desc: 'git reset --hard (禁止强行丢弃本地未提交变更)' },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/i, desc: 'git clean -f (禁止强制清理未跟踪工作区文件)' },
  { pattern: /\bgit\s+branch\s+-[a-zA-Z]*D\b/i, desc: 'git branch -D (禁止强行删除本地分支)' },
  { pattern: /\bgit\s+checkout\s+(?:--\s+)?\./i, desc: 'git checkout . (禁止覆盖工作区改动)' },
  { pattern: /\bgit\s+restore\s+(?:--worktree\s+)?\./i, desc: 'git restore . (禁止撤回所有文件修改)' },
  { pattern: /\bpush\s+--force\b/i, desc: 'push --force (禁止强制覆盖远端记录)' },
  { pattern: /\bgit\s+filter-branch\b/i, desc: 'git filter-branch (禁止重写历史提交树)' },
];

export function checkDangerousCommand(commandStr) {
  if (!commandStr || typeof commandStr !== 'string') return null;
  const cmd = commandStr.trim();
  for (const rule of DANGEROUS_RULES) {
    if (rule.pattern.test(cmd)) {
      return { blocked: true, pattern: rule.pattern.toString(), desc: rule.desc, matched: cmd };
    }
  }
  return null;
}

export function runSelfTest() {
  const testCases = [
    { cmd: 'git push origin main', shouldBlock: true },
    { cmd: 'git push --force origin main', shouldBlock: true },
    { cmd: 'git reset --hard HEAD~1', shouldBlock: true },
    { cmd: 'git clean -fd', shouldBlock: true },
    { cmd: 'git branch -D test-branch', shouldBlock: true },
    { cmd: 'git checkout .', shouldBlock: true },
    { cmd: 'git restore .', shouldBlock: true },
    { cmd: 'git status', shouldBlock: false },
    { cmd: 'git diff HEAD', shouldBlock: false },
    { cmd: 'git log -n 5', shouldBlock: false },
    { cmd: 'npm test', shouldBlock: false },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const res = checkDangerousCommand(tc.cmd);
    const isBlocked = !!res;
    if (isBlocked === tc.shouldBlock) {
      passed++;
    } else {
      process.stderr.write(`[SELFTEST FAIL] ${tc.cmd} expected blocked=${tc.shouldBlock}, got ${isBlocked}\n`);
      return false;
    }
  }
  process.stdout.write(`  ✅ [PASS] 护栏跨平台脚本自检通过 (${passed}/${testCases.length} 用例全部合规)\n`);
  return true;
}

async function main() {
  if (process.argv.includes('--selftest')) {
    const ok = runSelfTest();
    process.exit(ok ? 0 : 1);
  }

  // 紧急场景逃生门 (需显式声明)
  if (process.env.GIT_GUARDRAILS_BYPASS === '1') {
    process.stdout.write('[GUARDRAIL] Bypass enabled via GIT_GUARDRAILS_BYPASS=1\n');
    process.exit(0);
  }

  let rawInput = '';
  try {
    rawInput = fs.readFileSync(0, 'utf8');
  } catch (err) {
    // 若没有 stdin 输入，尝试读取 CLI 参数
    rawInput = process.argv.slice(2).join(' ');
  }

  let commandToCheck = '';
  if (rawInput) {
    try {
      const parsed = JSON.parse(rawInput);
      commandToCheck = parsed?.tool_input?.command || parsed?.command || '';
    } catch {
      commandToCheck = rawInput;
    }
  }

  if (!commandToCheck) {
    process.exit(0);
  }

  const check = checkDangerousCommand(commandToCheck);
  if (check) {
    process.stderr.write(`BLOCKED: '${check.matched}' matches dangerous pattern [${check.desc}]. User safety policy prevents this operation.\n`);
    process.exit(2);
  }

  process.exit(0);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}
