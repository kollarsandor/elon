var execAsync = promisify(execCb);
var HELPER_EXEC_TIMEOUT = 5e3;
var IS_WINDOWS = process.platform === "win32";
var TEMPFILE_PREFIX = join7(os3.tmpdir(), "grok-");
var DEFAULT_TIMEOUT = 30 * 60 * 1e3;
var BACKGROUND_SETUP_TIMEOUT = IS_WINDOWS ? 5e3 : 1e3;
var SIGTERM_CODE = IS_WINDOWS ? 1 : 143;
var ESCALATION_DELAY = process.env.VITEST ? 500 : 2e3;
var FILE_SUFFIXES = {
  STATUS: "-status",
  STDOUT: "-stdout",
  STDERR: "-stderr",
  CWD: "-cwd"
};
var SHELL_RECOVERY_TIMEOUT = 1e3;
var SHELL_PROBE_TIMEOUT = 1e4;
var SHELL_DIED = "shell-died:";
var SHELL_CONFIGS = {
  "/bin/bash": ".bashrc",
  "/bin/zsh": ".zshrc",
  "cmd.exe": "",
  "powershell.exe": "",
  "pwsh.exe": ""
};
function shellSupportsBashFunctions(shellBin) {
  if (IS_WINDOWS)
    return false;
  const base = basename4(shellBin);
  return base === "bash" || base === "zsh";
}
function resolveKillguardPath() {
  if (process.platform !== "linux")
    return void 0;
  if (process.env.DISABLE_GROK_COMPUTER_KILLGUARD)
    return void 0;
  const candidates = [
    process.env.GROK_COMPUTER_KILLGUARD_PATH,
    "/usr/local/bin/grok-killguard"
  ].filter((p) => typeof p === "string" && p.length > 0);
  for (const path12 of candidates) {
    try {
      accessSync3(path12, fsConstants.X_OK);
      return path12;
    } catch {
    }
  }
  return void 0;
}
var KILLGUARD_PATH = resolveKillguardPath();
if (KILLGUARD_PATH) {
  log.info("persistent_shell_killguard_active", {
    path: KILLGUARD_PATH,
    harnessPid: String(process.pid)
  });
}
function singleQuoteForShell(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
var PersistentShell = class {
  commandQueue = [];
  isExecuting = false;
  shell;
  commandInterrupted = false;
  /** Stable file paths reused on Unix; on Windows these are only kept for
   *  pwd() reads between commands and cleaned up on close(). */
  statusFile;
  stdoutFile;
  stderrFile;
  cwdFile;
  cwd;
  binShell;
  backgroundPids = /* @__PURE__ */ new Set();
  scriptFiles = /* @__PURE__ */ new Set();
  logFiles = /* @__PURE__ */ new Set();
  /** Extra per-command temp files created on Windows that need cleanup. */
  perCommandFiles = /* @__PURE__ */ new Set();
  /** Set in close() so the exit handler skips its sentinel/respawn paths. */
  closing = false;
  /** Status file the in-flight command is polling.  Tracked so the exit
   *  handler writes the sentinel to the right path on Windows, where each
   *  command gets its own per-command file (Unix reuses this.statusFile). */
  currentStatusFile;
  constructor(cwd, shellBin) {
    this.binShell = IS_WINDOWS ? "powershell.exe" : shellBin;
    this.cwd = cwd;
    this.shell = this.spawnShell(cwd);
    const id = crypto.randomUUID();
    this.statusFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.STATUS;
    this.stdoutFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.STDOUT;
    this.stderrFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.STDERR;
    this.cwdFile = TEMPFILE_PREFIX + id + FILE_SUFFIXES.CWD;
    this.initializeFiles().catch((err2) => log.error(`Init files error: ${err2 instanceof Error ? err2.message : String(err2)}`));
    this.bootstrapShell();
  }
  /** Spawn a shell + wire its exit handler.  Used by ctor and respawnShell.
   *  When killguard is available it's prepended to the argv; killguard
   *  exec's into bash (no extra fork), so setsid/pgid arrangements,
   *  respawnShell's group-kill, and killChildrenWithEscalation are
   *  unaffected. */
  spawnShell(cwd) {
    const baseArgs = IS_WINDOWS ? ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", "-"] : ["-l"];
    let cmd = this.binShell;
    let args = baseArgs;
    if (KILLGUARD_PATH) {
      cmd = KILLGUARD_PATH;
      args = [String(process.pid), this.binShell, ...baseArgs];
    }
    const sh = spawn2(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env: { ...process.env, GIT_EDITOR: "true" },
      // setsid() the shell into its own process group so we can reap the
      // whole descendant tree (grandchildren inherit the pgid).
      detached: !IS_WINDOWS
    });
    sh.on("exit", (code, signal) => {
      if (code) {
        log.error(`Shell exited with code ${code} and signal ${signal}`);
        log.error("persistent_shell_exit", {
          code: String(code),
          signal: signal ?? "null"
        });
      }
      if (this.shell !== sh)
        return;
      if (this.isExecuting && !this.closing) {
        const cause = signal ?? (code !== null ? `code ${code}` : "unknown");
        const target = this.currentStatusFile ?? this.statusFile;
        log.info("persistent_shell_died_in_flight", { cause: String(cause) });
        fs4.writeFile(target, SHELL_DIED + cause).catch(() => {
        });
        return;
      }
      this.cleanupTempFiles().catch((err2) => log.error(`Cleanup error: ${err2 instanceof Error ? err2.message : String(err2)}`));
    });
    sh.stdout?.resume();
    sh.stderr?.resume();
    return sh;
  }
  /** External-signal deaths leave killed=false and exitCode=null; check all 3. */
  isShellAlive() {
    return !this.shell.killed && this.shell.exitCode === null && this.shell.signalCode === null;
  }
  /**
   * Allocate a set of temp files for a single command execution.
   * On Windows, every command gets unique files to avoid EBUSY errors caused by
   * cmd.exe holding exclusive locks on redirected output files.
   * On Unix, the shell's stable files are reused (truncated before each command).
   */
  allocateCommandFiles() {
    if (IS_WINDOWS) {
      const id = crypto.randomUUID();
      const files = {
        statusFile: TEMPFILE_PREFIX + id + FILE_SUFFIXES.STATUS,
        stdoutFile: TEMPFILE_PREFIX + id + FILE_SUFFIXES.STDOUT,
        stderrFile: TEMPFILE_PREFIX + id + FILE_SUFFIXES.STDERR,
        cwdFile: TEMPFILE_PREFIX + id + FILE_SUFFIXES.CWD
      };
      this.perCommandFiles.add(files.statusFile);
      this.perCommandFiles.add(files.stdoutFile);
      this.perCommandFiles.add(files.stderrFile);
      this.perCommandFiles.add(files.cwdFile);
      return files;
    }
    return {
      statusFile: this.statusFile,
      stdoutFile: this.stdoutFile,
      stderrFile: this.stderrFile,
      cwdFile: this.cwdFile
    };
  }
  /**
   * Remove per-command temp files after results have been read (Windows only).
   */
  async cleanupCommandFiles(files) {
    if (!IS_WINDOWS)
      return;
    const paths = [
      files.statusFile,
      files.stdoutFile,
      files.stderrFile,
      files.cwdFile
    ];
    await Promise.allSettled(paths.map(async (p) => {
      try {
        await fs4.unlink(p);
        this.perCommandFiles.delete(p);
      } catch {
      }
    }));
  }
  async initializeFiles() {
    await Promise.all([
      fs4.writeFile(this.statusFile, "", { mode: 384 }),
      fs4.writeFile(this.stdoutFile, "", { mode: 384 }),
      fs4.writeFile(this.stderrFile, "", { mode: 384 }),
      fs4.writeFile(this.cwdFile, this.cwd, { mode: 384 })
    ]);
  }
  /**
   * Source the user rc file and install the embedded `find`/`grep`
   * wrappers, synchronously and in order, so they sit in the shell's
   * stdin queue before any caller can write a command via `exec()`.
   *
   * Previously this was async (Node-side `fs.access` then `sendToShell`)
   * and the very first `exec()` could write its bytes to stdin before
   * the bootstrap microtask ran — cmd #1 saw `find is /usr/bin/find`
   * even though cmd #2+ saw the wrapper functions. Bash does the rc-
   * file existence check inline (`[ -r path ]`) so we don't need a
   * Node-side stat, which was the only async step.
   *
   * The whole body is wrapped in try/catch: a stdin EPIPE here would
   * otherwise crash construction (and every callsite of `new
   * PersistentShell`), where degrading to OS find/grep is a strictly
   * better outcome than tearing down the process.
   */
  bootstrapShell() {
    try {
      const configFile = SHELL_CONFIGS[this.binShell];
      if (configFile && !IS_WINDOWS) {
        const rcPath = singleQuoteForShell(join7(homedir3(), configFile));
        this.sendToShell(`[ -r ${rcPath} ] && source ${rcPath}`);
      }
      if (!IS_WINDOWS && shellSupportsBashFunctions(this.binShell)) {
        const snippet = createFindGrepShellSnippet();
        if (snippet)
          this.sendToShell(snippet);
      }
    } catch (err2) {
      log.error(`bootstrapShell failed (continuing with OS find/grep): ${err2 instanceof Error ? err2.message : String(err2)}`);
    }
  }
  async cleanupTempFiles() {
    const files = [
      this.statusFile,
      this.stdoutFile,
      this.stderrFile,
      this.cwdFile,
      ...this.scriptFiles,
      ...this.logFiles,
      ...this.perCommandFiles
    ];
    await Promise.allSettled(files.map(async (file) => {
      try {
        await fs4.unlink(file);
      } catch (err2) {
        if (err2 instanceof Error && "code" in err2 && err2.code !== "ENOENT") {
          log.error(`Cleanup failed for ${file}: ${err2.message}`);
        }
      }
    }));
    this.scriptFiles.clear();
    this.logFiles.clear();
    this.perCommandFiles.clear();
  }
  async getChildPids(parentPid) {
    try {
      if (IS_WINDOWS) {
        const { stdout } = await execAsync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId=${parentPid}' | Select-Object -ExpandProperty ProcessId"`, { timeout: HELPER_EXEC_TIMEOUT });
        return stdout.trim().split("\n").map(Number).filter(Boolean);
      } else {
        const { stdout } = await execAsync(`pgrep -P ${parentPid}`, {
          timeout: HELPER_EXEC_TIMEOUT
        });
        return stdout.trim().split("\n").map(Number).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  /** POSIX-only: every PID in pgid (catches grandchildren pgrep -P misses). */
  async getProcessGroupPids(pgid) {
    try {
      const { stdout } = await execAsync(`pgrep -g ${pgid}`, {
        timeout: HELPER_EXEC_TIMEOUT
      });
      return stdout.trim().split("\n").map(Number).filter(Boolean);
    } catch {
      return [];
    }
  }
  /** Returns the number of children we attempted to kill.  Callers use
   *  this to decide whether probing is worth it (0 means the shell is
   *  busy on something we can't interrupt — a builtin loop in the shell
   *  process itself — and a probe queued in stdin would just time out). */
  async killChildrenWithEscalation() {
    const parentPid = this.shell.pid;
    if (!parentPid)
      return 0;
    if (IS_WINDOWS) {
      const childPids = await this.getChildPids(parentPid);
      if (childPids.length > 0) {
        log.info("persistent_shell_command_interrupted", {
          numChildProcesses: childPids.length.toString()
        });
      }
      for (const pid of childPids) {
        try {
          await execAsync(`taskkill /pid ${pid} /t /f`, {
            timeout: HELPER_EXEC_TIMEOUT
          });
        } catch {
        }
      }
      return childPids.length;
    }
    const initialGroup = await this.getProcessGroupPids(parentPid);
    const initialTargets = initialGroup.filter((p) => p !== parentPid);
    if (initialTargets.length > 0) {
      log.info("persistent_shell_command_interrupted", {
        numChildProcesses: initialTargets.length.toString()
      });
    }
    initialTargets.forEach((pid) => {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    });
    await new Promise((resolve8) => setTimeout(resolve8, ESCALATION_DELAY));
    const survivingGroup = await this.getProcessGroupPids(parentPid);
    survivingGroup.filter((p) => p !== parentPid).forEach((pid) => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    });
    return initialTargets.length;
  }
  async processQueue() {
    if (this.isExecuting || this.commandQueue.length === 0)
      return;
    this.isExecuting = true;
    const { command, abortSignal, timeout, background = false, resolve: resolve8, reject: reject2 } = this.commandQueue.shift();
    const killListener = () => {
      this.commandInterrupted = true;
      this.killChildrenWithEscalation().catch((err2) => log.error(`Kill error: ${err2 instanceof Error ? err2.message : String(err2)}`));
    };
    abortSignal?.addEventListener("abort", killListener);
    try {
      const result = await this.exec_(command, background, timeout);
      resolve8(result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message.substring(0, 10) : String(error).substring(0, 10);
      log.error("persistent_shell_command_error", { error: errMsg });
      reject2(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isExecuting = false;
      abortSignal?.removeEventListener("abort", killListener);
      void this.processQueue();
    }
  }
  async exec(command, abortSignal, timeout, background = false) {
    return new Promise((resolve8, reject2) => {
      this.commandQueue.push({
        command,
        abortSignal,
        timeout,
        background,
        resolve: resolve8,
        reject: reject2
      });
      void this.processQueue();
    });
  }
  async exec_(command, background, timeout) {
    let quotedCommand;
    if (IS_WINDOWS) {
      quotedCommand = command;
    } else {
      quotedCommand = import_shell_quote2.default.quote([command]);
      quotedCommand = quotedCommand.replace(/\\!/g, "!");
    }
    const commandTimeout = background ? BACKGROUND_SETUP_TIMEOUT : timeout || DEFAULT_TIMEOUT;
    this.commandInterrupted = false;
    const cmdFiles = this.allocateCommandFiles();
    await this.prepareFiles(cmdFiles, background);
    let logFile;
    let scriptFile;
    if (background) {
      logFile = join7(os3.tmpdir(), `grok-bg-${crypto.randomUUID()}.log`);
      scriptFile = join7(os3.tmpdir(), `grok-bg-script-${crypto.randomUUID()}${IS_WINDOWS ? ".ps1" : ".sh"}`);
      const scriptContent = IS_WINDOWS ? `${command} *>&1
` : `#!${this.binShell}
${command}
`;
      await fs4.writeFile(scriptFile, scriptContent, { mode: 448 });
      this.scriptFiles.add(scriptFile);
      this.logFiles.add(logFile);
    }
    const commandParts = this.buildCommandParts(quotedCommand, background, cmdFiles, logFile, scriptFile);
    this.sendToShell(commandParts.join("\n"));
    const result = await this.waitForCompletion(commandTimeout, cmdFiles, logFile);
    if (IS_WINDOWS) {
      try {
        const newCwd = (await this.readFileAuto(cmdFiles.cwdFile)).trim();
        if (newCwd) {
          this.cwd = newCwd;
          await fs4.writeFile(this.cwdFile, newCwd);
        }
      } catch {
      }
      await this.cleanupCommandFiles(cmdFiles);
    }
    return result;
  }
  async prepareFiles(files, background) {
    try {
      await Promise.all([
        fs4.writeFile(files.stdoutFile, ""),
        fs4.writeFile(files.stderrFile, ""),
        fs4.writeFile(files.statusFile, "")
      ]);
      if (!background) {
        await fs4.writeFile(files.cwdFile, "");
      }
    } catch (err2) {
      const errMsg = err2 instanceof Error ? err2.message : String(err2);
      log.error(`Prepare files error: ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  buildCommandParts(quotedCommand, background, files, logFile, scriptFile) {
    const commandParts = [];
    if (IS_WINDOWS) {
      if (background) {
        commandParts.push(`$p = Start-Process -NoNewWindow -PassThru -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-File','${scriptFile}' -RedirectStandardOutput '${logFile}'`);
        commandParts.push(`Set-Content -Path '${files.statusFile}' -Value ('bg:' + $p.Id) -NoNewline`);
        commandParts.push(`(Get-Location).Path | Set-Content -Path '${files.cwdFile}' -NoNewline`);
      } else {
        commandParts.push("$global:LASTEXITCODE = 0");
        commandParts.push(`${quotedCommand} > '${files.stdoutFile}' 2> '${files.stderrFile}'; $global:_ps_ok = $?`);
        commandParts.push(`$_ec = if ($global:_ps_ok) { if ($LASTEXITCODE) { $LASTEXITCODE } else { 0 } } else { if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 } }`);
        commandParts.push(`(Get-Location).Path | Set-Content -Path '${files.cwdFile}' -NoNewline`);
        commandParts.push(`"$_ec" | Set-Content -Path '${files.statusFile}' -NoNewline`);
      }
    } else {
      const setsidPrefix = process.platform === "darwin" ? `perl -e 'fork && exit; use POSIX qw(setsid); setsid(); exec @ARGV;' -- ` : "setsid";
      if (background) {
        commandParts.push(`${setsidPrefix} ${this.binShell} -c 'echo bg:$$ > "${files.statusFile}"; exec "${scriptFile}" > "${logFile}" 2>&1' &`);
        commandParts.push(`pwd > "${files.cwdFile}"`);
      } else {
        commandParts.push(`eval ${quotedCommand} < /dev/null > "${files.stdoutFile}" 2> "${files.stderrFile}"`);
        commandParts.push(`EXEC_EXIT_CODE=$?`);
        commandParts.push(`pwd > "${files.cwdFile}"`);
        commandParts.push(`echo $EXEC_EXIT_CODE > "${files.statusFile}"`);
      }
    }
    return commandParts;
  }
  async waitForCompletion(commandTimeout, files, logFile) {
    let pollTimer;
    let timeoutTimer;
    let watcher;
    let settled = false;
    this.currentStatusFile = files.statusFile;
    const cleanup = () => {
      this.currentStatusFile = void 0;
      watcher?.close();
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
    };
    const timeoutPromise = new Promise((_, reject2) => {
      timeoutTimer = setTimeout(() => {
        if (settled)
          return;
        settled = true;
        cleanup();
        reject2(new Error("Timeout"));
      }, commandTimeout);
    });
    const watchPromise = new Promise((resolve8, reject2) => {
      const check = async () => {
        if (settled)
          return;
        try {
          const { size } = await fs4.stat(files.statusFile);
          if (settled || size <= 0)
            return;
          const status = (await this.readFileAuto(files.statusFile)).trim();
          if (settled || !status)
            return;
          settled = true;
          cleanup();
          resolve8(await this.readResults(false, files, logFile, status));
        } catch (err2) {
          if (err2 instanceof Error && err2.code === "ENOENT") {
            return;
          }
          if (settled)
            return;
          settled = true;
          cleanup();
          reject2(err2 instanceof Error ? err2 : new Error(String(err2)));
        }
      };
      try {
        watcher = fsWatch(files.statusFile, () => void check());
        watcher.on("error", () => {
        });
      } catch {
      }
      pollTimer = setInterval(() => void check(), 50);
      void check();
    });
    try {
      return await Promise.race([watchPromise, timeoutPromise]);
    } catch (error) {
      settled = true;
      cleanup();
      if (error instanceof Error && error.message === "Timeout") {
        const killedCount = await this.killChildrenWithEscalation();
        log.info("persistent_shell_command_timeout", {
          timeout: commandTimeout.toString()
        });
        const recovered = await this.waitForStatusFile(files.statusFile, SHELL_RECOVERY_TIMEOUT);
        if (!recovered) {
          const shouldRespawn = killedCount === 0 || !await this.probeShell(SHELL_PROBE_TIMEOUT);
          if (shouldRespawn) {
            log.info("persistent_shell_probe_failed_respawning", {
              killedCount: killedCount.toString()
            });
            this.respawnShell();
          }
        }
        return this.readResults(true, files, logFile);
      }
      throw error;
    }
  }
  /**
   * Poll the status file for up to `maxWaitMs` milliseconds to see if the
   * shell wrote output (indicating the command finished after its children
   * were killed).  Returns `true` if the file has content, `false` if the
   * shell appears stuck.
   */
  async waitForStatusFile(statusFile, maxWaitMs) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const { size } = await fs4.stat(statusFile);
        if (size > 0)
          return true;
      } catch {
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }
  /**
   * Probe the shell with a no-op write to distinguish "alive but slow"
   * (will eventually drain its stdin queue) from "wedged" (needs respawn).
   * Returns true if the probe round-tripped within maxWaitMs.
   */
  async probeShell(maxWaitMs) {
    const probeFile = TEMPFILE_PREFIX + crypto.randomUUID() + "-probe";
    try {
      this.sendToShell(`echo R > '${probeFile}'`);
      return await this.waitForStatusFile(probeFile, maxWaitMs);
    } catch {
      return false;
    } finally {
      await fs4.unlink(probeFile).catch(() => {
      });
    }
  }
  /** Replace the shell process.  Called when a timed-out builtin has no
   *  child to kill, or when sendToShell detects a dead shell. */
  respawnShell() {
    log.info("persistent_shell_respawn", { cwd: this.cwd });
    const old = this.shell;
    const oldPid = old.pid;
    this.shell = this.spawnShell(this.cwd);
    try {
      old.stdin?.end();
    } catch {
    }
    if (!IS_WINDOWS && typeof oldPid === "number") {
      try {
        process.kill(-oldPid, "SIGKILL");
      } catch {
      }
    } else {
      try {
        old.kill("SIGKILL");
      } catch {
      }
    }
    this.bootstrapShell();
  }
  /**
   * Read a file with automatic encoding detection.
   * Windows PowerShell 5.1's `>` operator writes UTF-16 LE (with BOM FF FE).
   * This detects the BOM and decodes accordingly, falling back to UTF-8.
   */
  async readFileAuto(filePath) {
    try {
      const buf = await fs4.readFile(filePath);
      if (buf.length >= 2 && buf[0] === 255 && buf[1] === 254) {
        return buf.toString("utf16le").slice(1);
      }
      return buf.toString("utf8");
    } catch {
      return "";
    }
  }
  async readResults(timedOut, files, logFile, statusContent) {
    let code = SIGTERM_CODE;
    let pid;
    let stdout = "";
    let stderr = "";
    try {
      if (statusContent?.startsWith("bg:")) {
        pid = Number(statusContent.slice(3));
        if (!isNaN(pid) && pid > 0)
          this.backgroundPids.add(pid);
        code = 0;
      } else if (statusContent?.startsWith(SHELL_DIED)) {
        const cause = statusContent.slice(SHELL_DIED.length);
        [stdout, stderr] = await Promise.all([
          this.readFileAuto(files.stdoutFile),
          this.readFileAuto(files.stderrFile)
        ]);
        if (stderr && !stderr.endsWith("\n"))
          stderr += "\n";
        stderr += `Persistent shell process died: ${cause}`;
      } else if (statusContent !== void 0 && statusContent !== "") {
        code = Number(statusContent);
        [stdout, stderr] = await Promise.all([
          this.readFileAuto(files.stdoutFile),
          this.readFileAuto(files.stderrFile)
        ]);
      } else {
        [stdout, stderr] = await Promise.all([
          this.readFileAuto(files.stdoutFile),
          this.readFileAuto(files.stderrFile)
        ]);
      }
    } catch (err2) {
      const errMsg = err2 instanceof Error ? err2.message : String(err2);
      log.error(`Read results error: ${errMsg}`);
      stderr += `
Error reading results: ${errMsg}`;
    }
    return {
      stdout,
      stderr,
      code,
      interrupted: this.commandInterrupted,
      timedOut,
      pid,
      logFile
    };
  }
  sendToShell(command) {
    if (!this.isShellAlive() && !this.closing) {
      log.info("persistent_shell_respawn_on_send", {});
      this.respawnShell();
    }
    try {
      this.shell.stdin?.write(command + "\n");
    } catch (error) {
      const errorString = error instanceof Error ? error.message : String(error || "Unknown error");
      log.error(`Error in sendToShell: ${errorString}`);
      log.info("persistent_shell_write_error", {
        error: errorString.substring(0, 100),
        command: command.substring(0, 30)
      });
      throw error;
    }
  }
  async pwd() {
    try {
      const newCwd = (await this.readFileAuto(this.cwdFile)).trim();
      if (newCwd)
        this.cwd = newCwd;
      return this.cwd;
    } catch (error) {
      log.error(`Shell pwd error: ${error instanceof Error ? error.message : String(error)}`);
      return this.cwd;
    }
  }
  async setCwd(cwd) {
    const resolved = isAbsolute3(cwd) ? cwd : resolve5(this.cwd, cwd);
    try {
      await fs4.access(resolved);
    } catch {
      throw new Error(`Path "${resolved}" does not exist`);
    }
    const cdCommand = IS_WINDOWS ? `Set-Location -LiteralPath '${resolved}'` : `cd ${resolved}`;
    await this.exec(cdCommand);
  }
  async killBackgroundProcesses() {
    for (const pid of this.backgroundPids) {
      try {
        if (IS_WINDOWS) {
          await execAsync(`taskkill /pid ${pid} /t /f`, {
            timeout: HELPER_EXEC_TIMEOUT
          });
        } else {
          process.kill(-pid, "SIGTERM");
        }
      } catch (error) {
        if (!(error instanceof Error && error.code === "ESRCH")) {
          log.error(`Failed to kill background process ${pid}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    this.backgroundPids.clear();
  }
  async close() {
    this.closing = true;
    await this.killBackgroundProcesses();
    this.shell.stdin?.end();
    if (!IS_WINDOWS && typeof this.shell.pid === "number") {
      try {
        process.kill(-this.shell.pid, "SIGKILL");
      } catch {
      }
    } else {
      this.shell.kill();
    }
    await this.cleanupTempFiles();
  }
  /**
   * Returns partial stdout/stderr content for the currently executing command.
   * Useful for streaming progress to the UI while a command is still running.
   */
  async getPartialOutput() {
    if (!this.isExecuting) {
      return { stdout: "", stderr: "", isRunning: false };
    }
    const [stdout, stderr] = await Promise.all([
      this.readFileAuto(this.stdoutFile),
      this.readFileAuto(this.stderrFile)
    ]);
    return { stdout, stderr, isRunning: true };
  }
};