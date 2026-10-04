#!/usr/bin/env node
/**
 * Agent Note 脚手架 —— 生成符合门禁骨架的空白 Note，省掉手抄格式这一步。
 *
 * 规则的权威来源是 .agents/notes/README.md；本脚本只负责"把骨架摆对"，
 * 不判断变更是否非平凡（那是 review 的事）。生成后 `npm run verify:notes`
 * 应立即通过：空白 Note 的必备章节齐全，只是因为尚未填写而被标记待办。
 *
 * 零依赖，Node >= 18。用法：
 *   npm run note -- <class> <slug> [--proposed|--rejected]
 *   npm run note -- process pr-template-and-contributor-policy
 *   npm run note -- architecture export-pipeline --proposed
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const notesRoot = join(repoRoot, '.agents/notes');

/** 类别（封闭集合，须与 README § 分类、scripts/verify-agent-notes.mjs 的 CLASSES 一致）。 */
const CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'];

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

const LIFECYCLES = new Set(['proposed', 'implemented', 'rejected']);
let lifecycle = 'implemented';
for (const flag of flags) {
  const name = flag.slice(2);
  if (name === 'proposed' || name === 'rejected') lifecycle = name;
  else {
    console.error(`note: 未知参数 "${flag}"（可用：--proposed / --rejected）`);
    process.exit(1);
  }
}

const [cls, ...slugParts] = positional;
if (!cls || slugParts.length === 0) {
  console.error('用法：npm run note -- <class> <slug> [--proposed|--rejected]');
  console.error(`可用类别：${CLASSES.join(', ')}`);
  process.exit(1);
}
if (!CLASSES.includes(cls)) {
  console.error(`note: 未知类别 "${cls}"（可用：${CLASSES.join(', ')}）`);
  process.exit(1);
}

/** slug 统一为 ASCII 小写连字符，避免门禁 SLUG 正则失败。 */
const slug = slugParts
  .join('-')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
if (!slug) {
  console.error('note: slug 需至少包含一个 ASCII 字母或数字');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const rel = `${lifecycle}/${cls}/${today}-${slug}.md`;
const abs = join(notesRoot, rel);
if (existsSync(abs)) {
  console.error(`note: 已存在 ${rel}，未覆盖`);
  process.exit(1);
}

/** 正文骨架：与门禁的 REQUIRED / BANNED_IMPLEMENTED 逐字对齐。 */
const bodies = {
  proposed: `## 问题

<!-- 动机：不依赖本提案的解决方案即可独立成文。 -->

## 提案

## 曾考虑的替代方案

<!-- 必需，无豁免：每个真实替代方案及其落选原因。 -->

## 验收标准

## 风险
`,
  implemented: `## 问题

<!-- 动机：不依赖本决策的解决方案即可独立成文。 -->

## 决策

## 曾考虑的替代方案

<!-- 必需，无豁免：每个真实替代方案及其落选原因。 -->

## 后果

<!-- 权衡的代价与收益。 -->
`,
  rejected: `## 问题

<!-- 动机：不依赖本提案的解决方案即可独立成文。 -->

## 提案

## 曾考虑的替代方案

<!-- 必需，无豁免：每个真实替代方案及其落选原因。 -->
`,
};

const content = `# Agent Note: <标题>

Status: ${lifecycle === 'rejected' ? 'rejected — <一行原因>' : lifecycle}

${bodies[lifecycle]}`;

mkdirSync(dirname(abs), { recursive: true });
writeFileSync(abs, content, 'utf8');

console.log(`note: 已生成 .agents/notes/${rel}`);
console.log('下一步：');
console.log('  1. 填写标题与正文；`## 曾考虑的替代方案` 必须写真实替代方案，不能凭空编造');
console.log('  2. 做取代检查：搜索是否已有 Note 覆盖同一决策（README § 何时需要写一份）');
console.log('  3. npm run verify:notes');
