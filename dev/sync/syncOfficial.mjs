#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 同步官方上游 chthollyphile/folia-major 的新提交到本地 main：
// 以 docs/upstream-sync.json 记录的基线为起点，按时间顺序（--reverse --no-merges）
// 逐条 cherry-pick；冲突时停下来等人工处理，全部完成后更新基线并输出验证提示。

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const markerPath = path.join(repoRoot, 'docs', 'upstream-sync.json');
const FALLBACK_REMOTE = 'https://github.com/chthollyphile/folia-major.git';

const USAGE = `同步官方上游提交（范围 = docs/upstream-sync.json 的基线 .. 目标）

用法:
  node dev/sync/syncOfficial.mjs                      列出待同步范围（干跑）
  node dev/sync/syncOfficial.mjs --to <tag|sha|ref>   指定目标（默认官方 main）
  node dev/sync/syncOfficial.mjs --apply [--to ...]   执行逐条 cherry-pick（可中断续跑）
  node dev/sync/syncOfficial.mjs --status             查看基线与进行中状态
  --no-fetch                                          跳过联网（用本地已有的官方 refs）

npm 入口: npm run sync:official -- …（cmd.exe 正常；PowerShell 5.1 会丢掉 "--" 分隔符，请直接用 node 调用）
`;

function fail(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function short(sha) {
  return sha.slice(0, 8);
}

// 执行 git 子进程；allowFail 时返回 {ok,out,err,status} 而不退出
function runGit(args, { allowFail = false } = {}) {
  const res = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (res.error) {
    fail(`无法执行 git: ${res.error.message}`);
  }
  const out = res.stdout ?? '';
  const err = res.stderr ?? '';
  if (res.status !== 0 && !allowFail) {
    console.error(`git ${args.join(' ')} 失败 (exit=${res.status})`);
    if (err.trim()) console.error(err.trim());
    if (out.trim()) console.error(out.trim());
    fail('', 2);
  }
  return { ok: res.status === 0, out, err, status: res.status };
}

function readMarker() {
  if (!fs.existsSync(markerPath)) {
    fail(`缺少基线文件 ${path.relative(repoRoot, markerPath)}（应记录上次同步的上游提交）`);
  }
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (e) {
    fail(`基线文件不是合法 JSON: ${e.message}`);
  }
}

function gitDirAbs() {
  return path.resolve(repoRoot, runGit(['rev-parse', '--git-dir']).out.trim());
}

function statePath() {
  return path.join(gitDirAbs(), 'sync-official-state.json');
}

// 进行中状态：记录目标、同步起点（玻璃守卫对照）和下一条待 pick 的下标
function loadState() {
  const p = statePath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n');
}

function clearState() {
  const p = statePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function fetchOfficial(marker) {
  const url = marker.remote || FALLBACK_REMOTE;
  const branch = marker.branch || 'main';
  console.log(`fetch ${url} (${branch}) …`);
  runGit([
    'fetch',
    '--force',
    '--tags',
    url,
    `+refs/heads/${branch}:refs/remotes/official/${branch}`,
  ]);
}

function revOf(spec) {
  const r = runGit(['rev-parse', '--verify', '--quiet', `${spec}^{commit}`], { allowFail: true });
  return r.ok && r.out.trim() ? r.out.trim() : null;
}

// 目标解析：缺省用 fetch 后的 refs/remotes/official/<branch>；--to 可以是 tag/分支/SHA
function resolveTarget(arg, marker) {
  const branch = marker.branch || 'main';
  const candidates = arg ? [arg, `refs/tags/${arg}`, `refs/remotes/official/${arg}`] : [`refs/remotes/official/${branch}`];
  for (const c of candidates) {
    const sha = revOf(c);
    if (sha) return { sha, label: c };
  }
  fail(
    `无法解析目标 "${arg}"。\n` +
      `可能是没 fetch 到（去掉 --no-fetch）或名字写错。可用: git ls-remote --tags ${marker.remote || FALLBACK_REMOTE}`
  );
}

function subjectOf(sha) {
  return runGit(['show', '-s', '--format=%s', sha]).out.trim();
}

function dateOf(sha) {
  return runGit(['show', '-s', '--format=%ad', '--date=short', sha]).out.trim();
}

// 计算并列出同步范围：基线..目标，按时间正序，跳过 merge 提交
function listRange(from, to) {
  const anc = runGit(['merge-base', '--is-ancestor', from, to], { allowFail: true });
  if (!anc.ok) {
    fail(
      `基线 ${short(from)} 不是目标 ${short(to)} 的祖先，范围不成立。\n` +
        `检查 ${path.relative(repoRoot, markerPath)} 是否写错，或拉取的是否为同一仓库。`
    );
  }
  const out = runGit([
    'log',
    '--reverse',
    '--no-merges',
    '--format=%H%x00%an%x00%ad%x00%s',
    '--date=short',
    `${from}..${to}`,
  ]).out;
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, author, date, subject] = line.split('\0');
      return { sha, author, date, subject };
    });
}

function printRange(from, to, commits) {
  console.log('');
  console.log(`同步范围: ${short(from)} → ${short(to)}，共 ${commits.length} 条（按时间正序，已跳过 merge）`);
  commits.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(4)}. ${short(c.sha)} ${c.date} ${c.author} | ${c.subject}`);
  });
  console.log('');
}

function isDirty() {
  return runGit(['status', '--porcelain']).out.trim().length > 0;
}

function conflictedFiles() {
  return runGit(['diff', '--name-only', '--diff-filter=U'], { allowFail: true })
    .out.split('\n')
    .filter(Boolean);
}

function hasCherryPickHead() {
  return runGit(['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'], { allowFail: true }).ok;
}

// 玻璃标记守卫：统计 src/ 下 data-glass / useGlass( 出现行数，防止本地自定义被上游覆盖
function glassCount(ref) {
  const r = runGit(
    ['grep', '-c', '--fixed-strings', '-e', 'data-glass', '-e', 'useGlass(', ref, '--', 'src'],
    { allowFail: true }
  );
  return r.out
    .split('\n')
    .filter(Boolean)
    .reduce((sum, line) => {
      const i = line.lastIndexOf(':');
      return sum + (i >= 0 ? parseInt(line.slice(i + 1), 10) || 0 : 0);
    }, 0);
}

function printConflictHelp(files, state, commits, index) {
  const c = commits[index];
  console.log('');
  console.log(`⚠ 第 ${index + 1}/${commits.length} 条发生冲突，已停在这里等人工处理:`);
  console.log(`  上游提交: ${short(c.sha)} ${c.author} | ${c.subject}`);
  files.forEach((f) => console.log(`    UU ${f}`));
  console.log('');
  console.log('处理原则（详见 skills/sync-official-version/SKILL.md）: 以上游为准，叠回本地改动。');
  console.log('对冲突文件 F 的三方配方:');
  console.log(`  git checkout --theirs -- F`);
  console.log(`  git show ${short(state.from)}:F > base.tmp   # 本地改动所基于的上游版本`);
  console.log(`  git show ${short(state.preTip)}:F > local.tmp # 同步开始前的本地版本`);
  console.log(`  git merge-file F base.tmp local.tmp          # 0=干净, 非0=有标记需手工`);
  console.log('');
  console.log('解决后执行 git add -A，再重跑:');
  console.log('  node dev/sync/syncOfficial.mjs --apply');
}

function finish(state, target, commits, skippedNote) {
  const head = runGit(['rev-parse', 'HEAD']).out.trim();
  const before = glassCount(state.preTip);
  const now = glassCount(head);
  console.log('');
  console.log(`✅ 同步完成: ${short(state.from)} → ${short(target.sha)}，共处理 ${commits.length} 条${skippedNote}`);
  console.log(`玻璃标记守卫: 同步前 ${before} 行 → 同步后 ${now} 行`);
  if (now < before) {
    console.log('⚠ 玻璃标记减少，本地流体玻璃改动可能被覆盖，请人工检查 git diff');
  }
  const marker = readMarker();
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        remote: marker.remote || FALLBACK_REMOTE,
        branch: marker.branch || 'main',
        lastSynced: target.sha,
        lastSyncedSubject: subjectOf(target.sha),
        lastSyncedDate: dateOf(target.sha),
        syncedAt: today,
        note: marker.note,
      },
      null,
      2
    ) + '\n'
  );
  clearState();
  console.log(`基线已更新: ${path.relative(repoRoot, markerPath)} → ${short(target.sha)}（未提交）`);
  console.log('');
  console.log('接下来:');
  console.log('  git diff --check');
  console.log('  npm run typecheck');
  console.log('  npm run test:unit        # 与同步前基线对比');
  console.log(`  git add docs/upstream-sync.json && git commit -m "chore: 同步官方上游基线至 ${short(target.sha)}"`);
  console.log('  git push                 # 追加历史，无需 --force');
}

function doApply(marker, targetArg, noFetch) {
  if (!noFetch) fetchOfficial(marker);
  const target = resolveTarget(targetArg, marker);
  const from = marker.lastSynced;
  if (!revOf(from)) fail(`基线提交 ${short(from)} 在本地不存在，先 fetch 官方仓库`);

  if (isDirty() && !hasCherryPickHead()) {
    console.error('工作区不干净，先提交或暂存改动:');
    console.error(runGit(['status', '--short']).out.trim());
    fail('', 2);
  }

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).out.trim();
  if (branch !== 'main') {
    console.log(`⚠ 当前分支是 ${branch}（通常应在 main 上同步）`);
  }

  let state = loadState();
  if (state && state.to !== target.sha) {
    fail(
      `有另一个进行中的同步: ${short(state.from)} → ${short(state.to)}。\n` +
        `先完成它（重跑 --apply），或删除 ${path.relative(repoRoot, statePath())} 放弃。`
    );
  }

  const commits = listRange(from, target.sha);
  if (commits.length === 0) {
    console.log(`已是最新: 基线 ${short(from)} == 目标 ${short(target.sha)}，无待同步提交。`);
    if (state) clearState();
    return;
  }
  printRange(from, target.sha, commits);

  if (!state) {
    state = {
      from,
      to: target.sha,
      preTip: runGit(['rev-parse', 'HEAD']).out.trim(),
      nextIndex: 0,
      startedAt: new Date().toISOString(),
    };
    saveState(state);
  }

  let idx = state.nextIndex;

  // 上次冲突的解决已完成则先 --continue 收尾该条
  if (hasCherryPickHead()) {
    const unmerged = conflictedFiles();
    if (unmerged.length) {
      printConflictHelp(unmerged, state, commits, idx);
      process.exit(1);
    }
    console.log('检测到已暂存的冲突解决，继续 cherry-pick --continue …');
    const r = runGit(['-c', 'core.editor=true', 'cherry-pick', '--continue'], { allowFail: true });
    if (!r.ok) {
      console.error(r.err || r.out);
      fail('cherry-pick --continue 失败，检查 git status', 1);
    }
    idx += 1;
    saveState({ ...state, nextIndex: idx });
  } else if (state.startedAt && idx > 0) {
    // 用户可能手动执行过 cherry-pick --continue：用 subject 对齐推进下标
    const headSubject = runGit(['log', '-1', '--format=%s']).out.trim();
    while (idx < commits.length && commits[idx].subject === headSubject) {
      idx += 1;
    }
    saveState({ ...state, nextIndex: idx });
  }

  let skipped = 0;
  for (; idx < commits.length; idx += 1) {
    const c = commits[idx];
    console.log(`[${idx + 1}/${commits.length}] ${short(c.sha)} ${c.date} ${c.author} | ${c.subject}`);
    const r = runGit(['-c', 'core.editor=true', 'cherry-pick', c.sha], { allowFail: true });
    if (r.ok) {
      saveState({ ...state, nextIndex: idx + 1 });
      continue;
    }
    if (hasCherryPickHead() && conflictedFiles().length) {
      saveState({ ...state, nextIndex: idx });
      printConflictHelp(conflictedFiles(), state, commits, idx);
      process.exit(1);
    }
    // 非冲突失败：多为该提交内容已在本地（空提交），跳过
    const sk = runGit(['-c', 'core.editor=true', 'cherry-pick', '--skip'], { allowFail: true });
    if (!sk.ok) {
      console.error(r.err || r.out);
      fail('cherry-pick 失败且无法跳过，检查上方输出', 1);
    }
    skipped += 1;
    console.log('  ↳ 该提交的改动已在本地，跳过');
    saveState({ ...state, nextIndex: idx + 1 });
  }

  finish(state, target, commits, skipped ? `，跳过 ${skipped} 条已存在内容` : '');
}

function doList(marker, targetArg, noFetch) {
  if (!noFetch) fetchOfficial(marker);
  const target = resolveTarget(targetArg, marker);
  const from = marker.lastSynced;
  const commits = listRange(from, target.sha);
  printRange(from, target.sha, commits);
  const state = loadState();
  if (state) {
    console.log(`⚠ 存在进行中的同步状态: ${path.relative(repoRoot, statePath())}（nextIndex=${state.nextIndex}）`);
  }
  if (commits.length > 0) {
    console.log('执行同步:');
    console.log(`  node dev/sync/syncOfficial.mjs --apply${targetArg ? ` --to ${targetArg}` : ''}`);
  }
}

function doStatus(marker) {
  console.log(`基线: ${short(marker.lastSynced)} | ${marker.lastSyncedSubject} (${marker.lastSyncedDate})`);
  console.log(`远程: ${marker.remote || FALLBACK_REMOTE} [${marker.branch || 'main'}]`);
  const state = loadState();
  if (state) {
    console.log(
      `进行中: ${short(state.from)} → ${short(state.to)}，nextIndex=${state.nextIndex}，preTip=${short(state.preTip)}`
    );
  } else {
    console.log('进行中: 无');
  }
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).out.trim();
  const dirty = isDirty();
  console.log(`分支: ${branch}${dirty ? '（工作区不干净）' : ''}`);
}

function main() {
  const argv = process.argv.slice(2);
  let mode = 'list';
  let targetArg = null;
  let noFetch = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') mode = 'apply';
    else if (a === '--status') mode = 'status';
    else if (a === '--list') mode = 'list';
    else if (a === '--no-fetch') noFetch = true;
    else if (a === '--to') {
      targetArg = argv[i + 1];
      if (!targetArg) fail('--to 缺少参数');
      i += 1;
    } else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      return;
    } else {
      fail(`未知参数: ${a}\n\n${USAGE}`);
    }
  }
  const marker = readMarker();
  if (mode === 'status') doStatus(marker);
  else if (mode === 'apply') doApply(marker, targetArg, noFetch);
  else doList(marker, targetArg, noFetch);
}

main();
