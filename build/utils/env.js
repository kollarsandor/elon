var getIsDocker = memoize_default(async () => {
  if (process.platform !== "linux") {
    return false;
  }
  const { code } = await execFileNoThrow("test", ["-f", "/.dockerenv"]);
  return code === 0;
});
var hasInternetAccess = memoize_default(async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e3);
    await fetch("http://1.1.1.1", {
      method: "HEAD",
      signal: controller.signal
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
});
var env2 = {
  getIsDocker,
  hasInternetAccess,
  isCI: Boolean(process.env.CI),
  platform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
  nodeVersion: process.version,
  terminal: process.env.TERM_PROGRAM
};