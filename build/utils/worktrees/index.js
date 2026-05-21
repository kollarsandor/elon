var DEFAULT_WORKTREES_ROOT = path11.join(homedir7(), ".cosmos", "worktrees");
var WORKTREES_ROOT = DEFAULT_WORKTREES_ROOT;
var ILLEGAL_BRANCH_CHARS = /[\s~^:?*[\\\x00-\x1f\x7f]/;
async function createWorktree(opts) {
  validateBranchName(opts.branch);
  const fromBranch = opts.fromBranch ?? "origin/main";
  validateRefName(fromBranch, "fromBranch");
  const repoPath = await resolveRepoOrThrow(opts.repoPath);
  const dst = await ensureDstUnderWorktreesRoot(opts.dst ?? defaultWorktreePath(opts.branch));
  let donor = null;
  if (opts.inheritWorkspace) {
    const donorInput = opts.donorPath ?? repoPath;
    donor = await resolveDonorRoot(donorInput);
    await ensureDonorUnderRepo(donor, repoPath);
  }
  await ensureDstAvailable(dst);
  await fs9.mkdir(path11.dirname(dst), { recursive: true });
  const fetchOutcome = opts.skipFetch ? await describeSkippedFetch(repoPath, fromBranch) : await fetchRemoteRefIfApplicable(repoPath, fromBranch);
  if (fetchOutcome.kind === "remote-ref-missing") {
    throw new WorktreeError(`fromBranch ${fromBranch} does not exist on ${fetchOutcome.remote}`, "invalid-branch");
  }
  const t0 = performance.now();
  await addWorktreeNoCheckout({
    repoPath,
    dst,
    branch: opts.branch,
    fromBranch
  });
  let cloneMethod;
  let skippedCacheDirs = [];
  try {
    if (opts.inheritWorkspace && donor) {
      const [cloneResult] = await Promise.all([
        cloneDonorEntries(donor, dst),
        readTreeHead(dst)
      ]);
      cloneMethod = cloneResult.method;
      skippedCacheDirs = cloneResult.skippedCacheDirs;
    } else {
      await checkoutHead(dst);
      cloneMethod = "git-checkout";
    }
  } catch (err2) {
    await removeWorktree({ repoPath, worktreePath: dst }).catch(() => {
    });
    throw err2;
  }
  return {
    path: dst,
    branch: opts.branch,
    cloneMethod,
    durationMs: performance.now() - t0,
    skippedCacheDirs,
    fetchOutcome
  };
}
async function getRepoSummary(repoPath) {
  const root2 = await resolveRepoOrThrow(repoPath);
  const [worktrees, defaultBranch, userSlug] = await Promise.all([
    listWorktrees(root2),
    getDefaultBranch(root2),
    getGitUserSlug()
  ]);
  return { worktrees, defaultBranch, userSlug };
}
async function removeWorktree2(opts) {
  const root2 = await resolveRepoOrThrow(opts.repoPath);
  const [rootReal, wtReal] = await Promise.all([
    fs9.realpath(root2),
    fs9.realpath(path11.resolve(opts.worktreePath)).catch(() => null)
  ]);
  if (wtReal === null) {
    throw new WorktreeError(`${opts.worktreePath} does not exist`, "invalid-target");
  }
  if (wtReal === rootReal) {
    throw new WorktreeError("refusing to remove the main worktree", "invalid-target");
  }
  const list = await listWorktrees(root2);
  const entry = list.find((w) => path11.resolve(w.path) === wtReal);
  if (!entry) {
    throw new WorktreeError(`${opts.worktreePath} is not a worktree of ${root2}`, "invalid-target");
  }
  const branch = opts.removeBranch ? entry.branch : null;
  await removeWorktree({ repoPath: root2, worktreePath: wtReal });
  let branchDeleted = false;
  if (opts.removeBranch && branch) {
    try {
      await deleteBranch(root2, branch);
      branchDeleted = true;
    } catch {
      branchDeleted = false;
    }
  }
  return { branchDeleted, branch };
}
async function isGitRepo(cwd) {
  return await getRepoRoot(cwd) !== null;
}
async function probeWorktree(target) {
  const resolved = path11.resolve(target);
  if (resolved !== WORKTREES_ROOT && !resolved.startsWith(WORKTREES_ROOT + path11.sep)) {
    return { state: "missing", repoRoot: null, branch: null };
  }
  const repoRoot = await getRepoRoot(resolved);
  if (repoRoot) {
    return { state: "ok", repoRoot, branch: null };
  }
  const exists = await fs9.access(resolved).then(() => true).catch(() => false);
  if (exists) {
    return { state: "loose", repoRoot: null, branch: null };
  }
  const recovered = await recoverVanishedWorktree(resolved);
  return recovered ?? { state: "missing", repoRoot: null, branch: null };
}
async function recoverVanishedWorktree(vanishedPath) {
  let entries;
  try {
    entries = await fs9.readdir(WORKTREES_ROOT);
  } catch {
    return null;
  }
  const candidates = entries.map((entry) => path11.join(WORKTREES_ROOT, entry)).filter((candidate) => candidate !== vanishedPath);
  const repoRoots = await Promise.all(candidates.map((c) => getRepoRoot(c).catch(() => null)));
  const uniqueRepos = Array.from(new Set(repoRoots.filter((r) => r !== null)));
  const lists = await Promise.all(uniqueRepos.map((repo) => listWorktrees(repo).catch(() => [])));
  for (let i = 0; i < uniqueRepos.length; i += 1) {
    const list = lists[i];
    const match2 = list.find((w) => path11.resolve(w.path) === vanishedPath);
    if (!match2)
      continue;
    const main2 = list.find((w) => w.isMain);
    return {
      state: "vanished",
      repoRoot: main2?.path ?? uniqueRepos[i],
      branch: match2.branch
    };
  }
  return null;
}
var WorktreeError = class extends Error {
  kind;
  constructor(message, kind) {
    super(message);
    this.kind = kind;
    this.name = "WorktreeError";
  }
};
async function resolveRepoOrThrow(repoPath) {
  const root2 = await getRepoRoot(repoPath);
  if (!root2) {
    throw new WorktreeError(`${repoPath} is not inside a git repo`, "not-a-repo");
  }
  return root2;
}
async function resolveDonorRoot(donor) {
  const root2 = await getRepoRoot(donor);
  if (!root2)
    return donor;
  const [donorReal, rootReal] = await Promise.all([
    fs9.realpath(donor).catch(() => path11.resolve(donor)),
    fs9.realpath(root2).catch(() => path11.resolve(root2))
  ]);
  return donorReal === rootReal ? donor : root2;
}
function validateRefName(ref, label) {
  if (!ref || ref.length > 200) {
    throw new WorktreeError(`${label} must be 1\u2013200 characters`, "invalid-branch");
  }
  if (ILLEGAL_BRANCH_CHARS.test(ref)) {
    throw new WorktreeError(`${label} contains illegal characters (whitespace, ~, ^, :, ?, *, [, control chars)`, "invalid-branch");
  }
  if (ref.startsWith("-") || ref.includes("..") || ref.includes("@{") || ref.includes("//") || ref.endsWith("/") || ref.endsWith(".lock")) {
    throw new WorktreeError(`${label} violates git naming rules`, "invalid-branch");
  }
}
function validateBranchName(branch) {
  validateRefName(branch, "branch");
}
async function ensureDstAvailable(dst) {
  const exists = await fs9.access(dst).then(() => true, () => false);
  if (exists) {
    throw new WorktreeError(`${dst} already exists`, "dst-exists");
  }
}
async function ensureDstUnderWorktreesRoot(dst) {
  const resolved = path11.resolve(dst);
  const rootReal = await fs9.realpath(WORKTREES_ROOT).catch(() => WORKTREES_ROOT);
  let parent = path11.dirname(resolved);
  while (parent !== path11.dirname(parent)) {
    const real = await fs9.realpath(parent).catch(() => null);
    if (real !== null) {
      const reattached = path11.join(real, path11.relative(parent, resolved));
      if (reattached !== rootReal && !reattached.startsWith(rootReal + path11.sep)) {
        throw new WorktreeError(`dst must live under ${WORKTREES_ROOT}`, "invalid-target");
      }
      return reattached;
    }
    parent = path11.dirname(parent);
  }
  if (resolved !== rootReal && !resolved.startsWith(rootReal + path11.sep)) {
    throw new WorktreeError(`dst must live under ${WORKTREES_ROOT}`, "invalid-target");
  }
  return resolved;
}
async function ensureDonorUnderRepo(donor, repoPath) {
  const [donorReal, repoReal] = await Promise.all([
    fs9.realpath(donor).catch(() => null),
    fs9.realpath(repoPath).catch(() => null)
  ]);
  if (!donorReal) {
    throw new WorktreeError(`${donor} does not exist`, "invalid-donor");
  }
  if (!repoReal) {
    throw new WorktreeError(`${repoPath} does not exist`, "invalid-donor");
  }
  if (donorReal !== repoReal && !donorReal.startsWith(repoReal + path11.sep)) {
    throw new WorktreeError("donorPath must live inside the source repo", "invalid-donor");
  }
  return donorReal;
}
function defaultWorktreePath(branch) {
  return path11.join(WORKTREES_ROOT, sanitiseBranchForPath(branch));
}
function sanitiseBranchForPath(branch) {
  return branch.replace(/[/\\]/g, "-").replace(/[^A-Za-z0-9._-]/g, "_");
}