var getIsGit = memoize_default(async (cwd) => {
  const { code } = await execFileNoThrow("git", ["rev-parse", "--is-inside-work-tree"], cwd);
  return code === 0;
});