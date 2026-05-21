var getGitEmail = memoize_default(async (cwd) => {
  const result = await execFileNoThrow("git", ["config", "user.email"], cwd);
  if (result.code !== 0) {
    log.error(`Failed to get git email: ${result.stdout} ${result.stderr}`);
    return void 0;
  }
  return result.stdout.trim() || void 0;
});
var getUser = memoize_default(() => process.env.CONTAINER_USER || process.env.USER || process.env.USERNAME || "unknown");