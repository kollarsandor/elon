import { execFile as execFile3 } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs8 from "node:fs/promises";
import { homedir as homedir6 } from "node:os";
import path10 from "node:path";
import { promisify as promisify3 } from "node:util";
var exec3 = promisify3(execFile3);
var GIT_TIMEOUT_MS = 6e4;
var MAX_BUFFER = 16 * 1024 * 1024;
var TRASH_ROOT = path10.join(homedir6(), ".cosmos", ".trash");
var backgroundRm = (trashPath) => fs8.rm(trashPath, { recursive: true, force: true }).catch(() => {
});
async function getRepoRoot(cwd) {
  try {
    const { stdout } = await exec3("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--show-toplevel"], { timeout: GIT_TIMEOUT_MS });
    return stdout.trim();
  } catch {
    return null;
  }
}
async function getGitCommonDir(repoPath) {
  try {
    const { stdout } = await exec3("git", [
      "-C",
      repoPath,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir"
    ], { timeout: GIT_TIMEOUT_MS });
    return stdout.trim();
  } catch {
    return null;
  }
}
async function getDefaultBranch(repoPath) {
  try {
    const { stdout } = await exec3("git", ["-C", repoPath, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { timeout: GIT_TIMEOUT_MS });
    const ref = stdout.trim();
    if (ref)
      return ref;
  } catch {
  }
  try {
    const { stdout } = await exec3("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: GIT_TIMEOUT_MS });
    const current = stdout.trim();
    if (current && current !== "HEAD")
      return current;
  } catch {
  }
  return null;
}
async function listRemotes(repoPath) {
  try {
    const { stdout } = await exec3("git", ["-C", repoPath, "remote"], {
      timeout: GIT_TIMEOUT_MS
    });
    return stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    return [];
  }
}
function parseRemoteRef(ref, remotes) {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1)
    return null;
  const remote = ref.slice(0, slash);
  const branch = ref.slice(slash + 1);
  if (!remotes.includes(remote))
    return null;
  return { remote, branch };
}
async function fetchRemoteRefIfApplicable(repoPath, ref) {
  if (!ref.includes("/")) {
    return { kind: "not-applicable", reason: "no-slash" };
  }
  const remotes = await listRemotes(repoPath);
  const parsed = parseRemoteRef(ref, remotes);
  if (!parsed) {
    if (remotes.length > 0 && ref.includes("/")) {
      const remote2 = ref.slice(0, ref.indexOf("/"));
      return { kind: "unknown-remote", remote: remote2 };
    }
    return { kind: "not-applicable", reason: "unparseable" };
  }
  const { remote, branch } = parsed;
  try {
    await exec3("git", [
      "-C",
      repoPath,
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      "--",
      remote,
      branch
    ], { timeout: GIT_TIMEOUT_MS });
  } catch (err2) {
    const stderr = String(err2.stderr ?? "");
    if (/couldn't find remote ref/i.test(stderr) || /no such ref/i.test(stderr)) {
      return { kind: "remote-ref-missing", remote, branch };
    }
    return {
      kind: "network-error",
      remote,
      branch,
      message: stderr.trim() || err2.message
    };
  }
  let head = "";
  try {
    const { stdout } = await exec3("git", ["-C", repoPath, "rev-parse", `${remote}/${branch}`], { timeout: GIT_TIMEOUT_MS });
    head = stdout.trim();
  } catch {
  }
  return { kind: "updated", remote, branch, head };
}
async function describeSkippedFetch(repoPath, ref) {
  if (!ref.includes("/")) {
    return { kind: "not-applicable", reason: "no-slash" };
  }
  const remotes = await listRemotes(repoPath);
  const parsed = parseRemoteRef(ref, remotes);
  if (!parsed) {
    if (remotes.length > 0 && ref.includes("/")) {
      return { kind: "unknown-remote", remote: ref.slice(0, ref.indexOf("/")) };
    }
    return { kind: "not-applicable", reason: "unparseable" };
  }
  return {
    kind: "skipped-by-caller",
    remote: parsed.remote,
    branch: parsed.branch
  };
}
async function getGitUserSlug() {
  try {
    const { stdout } = await exec3("git", ["config", "--global", "user.name"], {
      timeout: GIT_TIMEOUT_MS
    });
    const name = stdout.trim();
    if (!name)
      return null;
    const first = name.split(/\s+/)[0] ?? "";
    const slug = first.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}
async function listWorktrees(repoPath) {
  const { stdout } = await exec3("git", ["-C", repoPath, "worktree", "list", "--porcelain"], { timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  const out = [];
  let current = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), isPrunable: false };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (current && line === "detached") {
      current.branch = null;
    } else if (current && line.startsWith("prunable")) {
      current.isPrunable = true;
    } else if (current && line === "") {
      if (current.path && current.head !== void 0) {
        out.push({
          path: current.path,
          branch: current.branch ?? null,
          head: current.head,
          isMain: out.length === 0,
          isPrunable: current.isPrunable ?? false
        });
      }
      current = null;
    }
  }
  return out;
}
async function addWorktreeNoCheckout(opts) {
  const { repoPath, dst, branch, fromBranch } = opts;
  await exec3("git", ["-C", repoPath, "worktree", "prune"], {
    timeout: GIT_TIMEOUT_MS
  });
  const branchExists = await branchHeadExists(repoPath, branch);
  const args = branchExists ? ["-C", repoPath, "worktree", "add", "--no-checkout", "--", dst, branch] : [
    "-C",
    repoPath,
    "worktree",
    "add",
    "--no-checkout",
    "-b",
    branch,
    "--",
    dst,
    fromBranch
  ];
  await exec3("git", args, { timeout: GIT_TIMEOUT_MS });
}
async function checkoutHead(worktreePath) {
  await exec3("git", ["-C", worktreePath, "checkout", "HEAD", "--", "."], {
    timeout: 10 * GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER
  });
}
async function readTreeHead(worktreePath) {
  await exec3("git", ["-C", worktreePath, "read-tree", "HEAD"], {
    timeout: 10 * GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER
  });
}
async function removeWorktree(opts) {
  const { repoPath, worktreePath } = opts;
  const [adminDir, commonDir] = await Promise.all([
    readGitPointer(worktreePath),
    getGitCommonDir(repoPath)
  ]);
  const safeAdminDir = await resolveSafeAdminDir(adminDir, commonDir);
  await fs8.mkdir(TRASH_ROOT, { recursive: true });
  const trashPath = path10.join(TRASH_ROOT, `${path10.basename(worktreePath)}-${randomBytes(4).toString("hex")}`);
  let moved = false;
  try {
    await fs8.rename(worktreePath, trashPath);
    moved = true;
  } catch (err2) {
    const code = err2.code;
    if (code === "ENOENT") {
    } else if (code === "EXDEV") {
      await fs8.rm(worktreePath, { recursive: true, force: true });
    } else {
      throw err2;
    }
  }
  if (safeAdminDir) {
    await fs8.rm(safeAdminDir, { recursive: true, force: true });
  }
  await exec3("git", ["-C", repoPath, "worktree", "prune"], {
    timeout: GIT_TIMEOUT_MS
  }).catch(() => {
  });
  if (moved)
    void backgroundRm(trashPath);
}
async function readGitPointer(worktreePath) {
  try {
    const contents = await fs8.readFile(path10.join(worktreePath, ".git"), "utf8");
    const match2 = contents.match(/^gitdir:\s*(.+)$/m);
    return match2 ? match2[1].trim() : null;
  } catch {
    return null;
  }
}
async function resolveSafeAdminDir(adminDir, commonDir) {
  if (!adminDir || !commonDir)
    return null;
  const expectedRoot = path10.join(commonDir, "worktrees");
  const [adminReal, expectedReal] = await Promise.all([
    fs8.realpath(adminDir).catch(() => null),
    fs8.realpath(expectedRoot).catch(() => null)
  ]);
  if (!adminReal || !expectedReal)
    return null;
  if (adminReal !== expectedReal && !adminReal.startsWith(expectedReal + path10.sep)) {
    return null;
  }
  return adminReal;
}
function cleanupTrashOnStartup() {
  void (async () => {
    try {
      const entries = await fs8.readdir(TRASH_ROOT);
      for (const entry of entries) {
        void backgroundRm(path10.join(TRASH_ROOT, entry));
      }
    } catch {
    }
  })();
}
async function branchHeadExists(repoPath, branch) {
  try {
    await exec3("git", [
      "-C",
      repoPath,
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branch}`
    ], { timeout: GIT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}
async function getWorktreeStatus(worktreePath) {
  const [hasUpstream, aheadBehind, dirty] = await Promise.all([
    detectUpstream(worktreePath),
    countAheadBehind(worktreePath),
    countDirty(worktreePath)
  ]);
  return {
    hasUpstream,
    ahead: hasUpstream ? aheadBehind?.ahead ?? 0 : null,
    behind: hasUpstream ? aheadBehind?.behind ?? 0 : null,
    dirty
  };
}
async function detectUpstream(worktreePath) {
  try {
    await exec3("git", [
      "-C",
      worktreePath,
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}"
    ], { timeout: GIT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}
async function countAheadBehind(worktreePath) {
  try {
    const { stdout } = await exec3("git", [
      "-C",
      worktreePath,
      "rev-list",
      "--left-right",
      "--count",
      "@{u}...HEAD"
    ], { timeout: GIT_TIMEOUT_MS });
    const [behindStr, aheadStr] = stdout.trim().split(/\s+/);
    const behind = Number.parseInt(behindStr ?? "", 10);
    const ahead = Number.parseInt(aheadStr ?? "", 10);
    if (Number.isNaN(behind) || Number.isNaN(ahead))
      return null;
    return { ahead, behind };
  } catch {
    return null;
  }
}
async function countDirty(worktreePath) {
  try {
    const { stdout } = await exec3("git", ["-C", worktreePath, "status", "--porcelain=v1"], { timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
    if (!stdout)
      return 0;
    return stdout.split("\n").filter((l) => l.length > 0).length;
  } catch {
    return 0;
  }
}
async function deleteBranch(repoPath, branch) {
  await exec3("git", ["-C", repoPath, "branch", "-d", branch], {
    timeout: GIT_TIMEOUT_MS
  });
}