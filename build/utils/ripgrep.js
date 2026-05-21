var import_debug = __toESM(require_src(), 1);
import { execFileSync } from "child_process";
import { accessSync, constants as constants2 } from "fs";
var import_spawn_rx = __toESM(require_src2(), 1);
import path from "path";
import { fileURLToPath } from "url";
var d = (0, import_debug.default)("grok:ripgrep");
var ripgrepPath = memoize_default(() => {
  const useBuiltinRipgrep = !!process.env.USE_BUILTIN_RIPGREP;
  if (useBuiltinRipgrep) {
    d("Using builtin ripgrep because USE_BUILTIN_RIPGREP is set");
  }
  const isWin32 = process.platform === "win32";
  const rgBinName = isWin32 ? "rg.exe" : "rg";
  let cmd = (0, import_spawn_rx.findActualExecutable)("rg", []).cmd;
  d(`ripgrep initially resolved as: ${cmd}`);
  if ((cmd === "rg" || cmd === "rg.exe") && !process.env.VITEST) {
    const paths = process.env.PATH?.split(path.delimiter) || [];
    for (const dir of paths) {
      const full = path.join(dir, rgBinName);
      try {
        accessSync(full, constants2.X_OK);
        execFileSync(full, ["--version"], {
          timeout: 1e3,
          stdio: "ignore",
          cwd: "."
        });
        cmd = full;
        d("Resolved system rg at %s", cmd);
        break;
      } catch {
      }
    }
  }
  if (cmd !== "rg" && cmd !== "rg.exe" && !useBuiltinRipgrep) {
    return cmd;
  } else {
    const baseDir = process.env.GROK_COMPUTER_BASE_DIR || (process.versions?.bun ? path.resolve(path.dirname(process.execPath), "..") : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
    const rgRoot = path.join(baseDir, "vendor", "ripgrep");
    if (isWin32) {
      return path.join(rgRoot, "x64-win32", "rg.exe");
    }
    const ret = path.join(rgRoot, `${process.arch}-${process.platform}`, "rg");
    d("internal ripgrep resolved as: %s", ret);
    return ret;
  }
});
async function ripGrep(args, target, abortSignal, timeout = 1e4) {
  await codesignRipgrepIfNecessary();
  const rg = ripgrepPath();
  const result = await execFileNoThrow(rg, args, target, abortSignal, timeout, true);
  if (result.code !== 0) {
    if (result.code !== 1) {
      log.error(`ripgrep failed with code ${result.code}: ${result.stderr}`);
    }
    if (result.error?.killed) {
      return { timedOut: true, lines: [] };
    }
    return { timedOut: false, lines: [] };
  }
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  return { timedOut: false, lines };
}
async function listAllContentFiles(path12, abortSignal, limit) {
  try {
    d("listAllContentFiles called: %s", path12);
    return (await ripGrep(["-l", ".", "."], path12, abortSignal)).lines.slice(0, limit);
  } catch (e) {
    d("listAllContentFiles failed: %o", e);
    log.error(e);
    return [];
  }
}
var signCheck = { alreadyDone: false };
async function codesignRipgrepIfNecessary() {
  if (process.platform !== "darwin" || signCheck.alreadyDone) {
    return;
  }
  signCheck.alreadyDone = true;
  const rgPath = ripgrepPath();
  if (!rgPath.includes("vendor/ripgrep")) {
    d("Skipping codesign for non-vendored rg");
    return;
  }
  d("checking if ripgrep is already signed");
  const lines = (await execFileNoThrow("codesign", ["-vv", "-d", rgPath], void 0, void 0, void 0, false)).stdout.split("\n");
  const needsSigned = lines.find((line) => line.includes("linker-signed"));
  if (!needsSigned) {
    d("seems to be already signed");
    return;
  }
  try {
    d("signing ripgrep");
    const signResult = await execFileNoThrow("codesign", [
      "--sign",
      "-",
      "--force",
      "--preserve-metadata=entitlements,requirements,flags,runtime",
      rgPath
    ]);
    if (signResult.code !== 0) {
      d("failed to sign ripgrep: %o", signResult);
      log.error(`Failed to sign ripgrep: ${signResult.stdout} ${signResult.stderr}`);
    }
    d("removing quarantine");
    const quarantineResult = await execFileNoThrow("xattr", [
      "-d",
      "com.apple.quarantine",
      rgPath
    ]);
    if (quarantineResult.code !== 0) {
      d("failed to remove quarantine: %o", quarantineResult);
      log.error(`Failed to remove quarantine: ${quarantineResult.stdout} ${quarantineResult.stderr}`);
    }
  } catch (e) {
    d("failed during sign: %o", e);
    log.error(e);
  }
}