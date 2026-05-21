var import_debug2 = __toESM(require_src(), 1);
import { execFileSync as execFileSync2 } from "child_process";
import { accessSync as accessSync2, constants as constants5, existsSync } from "fs";
var import_shell_quote = __toESM(require_shell_quote(), 1);
var import_spawn_rx2 = __toESM(require_src2(), 1);
import path7 from "path";
import { fileURLToPath as fileURLToPath4 } from "url";
var d2 = (0, import_debug2.default)("grok:embeddedSearchTools");
var VCS_DIRECTORIES_TO_EXCLUDE = [
  ".git",
  ".svn",
  ".hg",
  ".bzr",
  ".jj",
  ".sl"
];
var UGREP_DEFAULT_ARGS = [
  "-G",
  "--ignore-files",
  "--hidden",
  "-I",
  ...VCS_DIRECTORIES_TO_EXCLUDE.map((dir) => `--exclude-dir=${dir}`)
];
var BFS_DEFAULT_ARGS = [];
function vendoredBinaryPath(tool) {
  const isWindows = process.platform === "win32";
  const platformDir = isWindows ? "x64-win32" : `${process.arch}-${process.platform}`;
  const binName = isWindows ? `${tool}.exe` : tool;
  const relPath = path7.join("vendor", tool, platformDir, binName);
  if (process.env.GROK_COMPUTER_BASE_DIR) {
    return path7.join(process.env.GROK_COMPUTER_BASE_DIR, relPath);
  }
  if (process.versions?.bun) {
    return path7.join(path7.dirname(process.execPath), "..", relPath);
  }
  const startDir = path7.dirname(fileURLToPath4(import.meta.url));
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path7.join(dir, relPath);
    if (existsSync(candidate))
      return candidate;
    const parent = path7.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return path7.resolve(startDir, "..", "..", relPath);
}
function isExecutable(full) {
  try {
    accessSync2(full, constants5.X_OK);
    execFileSync2(full, ["--version"], {
      timeout: 1e3,
      stdio: "ignore",
      cwd: "."
    });
    return true;
  } catch {
    return false;
  }
}
function resolveSearchTool(tool) {
  const vendored = vendoredBinaryPath(tool);
  if (isExecutable(vendored)) {
    d2("Resolved vendored %s at %s", tool, vendored);
    return vendored;
  }
  d2("Vendored %s missing or non-executable at %s", tool, vendored);
  const systemCmd = (0, import_spawn_rx2.findActualExecutable)(tool, []).cmd;
  if (systemCmd !== tool) {
    if (isExecutable(systemCmd)) {
      d2("Resolved system %s at %s", tool, systemCmd);
      return systemCmd;
    }
  }
  const binName = process.platform === "win32" ? `${tool}.exe` : tool;
  const paths = process.env.PATH?.split(path7.delimiter) || [];
  for (const dir of paths) {
    const full = path7.join(dir, binName);
    if (isExecutable(full)) {
      d2("Resolved %s on PATH at %s", tool, full);
      return full;
    }
  }
  d2("%s not found on system", tool);
  return null;
}
var bfsPath = memoize_default(() => resolveSearchTool("bfs"));
var ugrepPath = memoize_default(() => resolveSearchTool("ugrep"));
function hasEmbeddedSearchTools() {
  if (process.env.DISABLE_EMBEDDED_SEARCH_TOOLS)
    return false;
  return bfsPath() !== null && ugrepPath() !== null;
}
function bashSafeQuote(s) {
  if (/^[a-zA-Z0-9._/=:@+-]+$/.test(s))
    return s;
  return import_shell_quote.default.quote([s]);
}
function shellFunctionFor(name, binary, prependArgs) {
  const quotedBinary = bashSafeQuote(binary);
  const quotedArgs = prependArgs.map(bashSafeQuote);
  const argSuffix = quotedArgs.length > 0 ? `${quotedArgs.join(" ")} "$@"` : '"$@"';
  const invoke = `${quotedBinary} ${argSuffix}`;
  return [
    // Clear any user-config alias (e.g. `alias find=gfind`) so it can't
    // shadow our function — bash expands aliases before function lookup.
    `unalias ${name} 2>/dev/null || true`,
    `${name}() {`,
    `  if [[ -n $ZSH_VERSION ]]; then`,
    `    ${invoke}`,
    `  elif (( BASH_SUBSHELL > 0 )); then`,
    `    exec -a ${name} ${invoke}`,
    `  else`,
    `    (exec -a ${name} ${invoke})`,
    `  fi`,
    `}`
  ].join("\n");
}
function createFindGrepShellSnippet() {
  if (!hasEmbeddedSearchTools())
    return null;
  const bfs = bfsPath();
  const ugrep = ugrepPath();
  if (!bfs || !ugrep)
    return null;
  return [
    shellFunctionFor("find", bfs, BFS_DEFAULT_ARGS),
    shellFunctionFor("grep", ugrep, UGREP_DEFAULT_ARGS)
  ].join("\n");
}