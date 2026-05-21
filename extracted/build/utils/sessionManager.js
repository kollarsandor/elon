var FileMutex = class {
  locked = false;
  queue = [];
  async acquire(filePath, timeoutMs = 2e3) {
    if (!this.locked) {
      this.locked = true;
      return this.release.bind(this);
    }
    return new Promise((resolve8, reject2) => {
      const timer = setTimeout(() => {
        const index = this.queue.findIndex((q) => q.reject === reject2);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject2(new Error(`Lock acquisition timed out after ${timeoutMs}ms for file: ${filePath}`));
      }, timeoutMs);
      this.queue.push({ resolve: resolve8, reject: reject2, timer });
    });
  }
  release() {
    if (this.queue.length > 0) {
      const { resolve: resolve8, timer } = this.queue.shift();
      clearTimeout(timer);
      this.locked = true;
      resolve8(this.release.bind(this));
    } else {
      this.locked = false;
    }
  }
};
var fileMutexes = /* @__PURE__ */ new Map();
async function acquireLock(filePath) {
  let mutex = fileMutexes.get(filePath);
  if (!mutex) {
    mutex = new FileMutex();
    fileMutexes.set(filePath, mutex);
  }
  return mutex.acquire(filePath);
}
var sessions = /* @__PURE__ */ new Map();
async function resolveDirectory(dir) {
  let expanded = dir;
  if (expanded === "~" || expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = join9(homedir4(), expanded.slice(1));
  }
  const absoluteDir = resolve6(expanded);
  let realDir;
  try {
    realDir = await fs5.realpath(absoluteDir);
  } catch (err2) {
    const errnoErr = err2;
    if (errnoErr.code === "ENOENT") {
      throw new Error(`Working directory does not exist or is not accessible: ${absoluteDir}`);
    }
    throw err2;
  }
  const stats = await fs5.stat(realDir);
  if (!stats.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${realDir}`);
  }
  return realDir;
}
async function getOrCreateSession(sessionId, defaultWorkingDir, options) {
  let session = sessions.get(sessionId);
  if (session)
    return session;
  const realDir = await resolveDirectory(defaultWorkingDir);
  const rootWorkingDir = options?.rootWorkingDir ? await resolveDirectory(options.rootWorkingDir) : realDir;
  const defaultShell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL ?? "/bin/bash";
  const shellBin = options?.shellBin ?? defaultShell;
  const hasInternetAccess2 = options?.hasInternetAccess ?? await env2.hasInternetAccess();
  const browserHeadless = options?.browserHeadless ?? true;
  const rawGlobalSkillsDir = join9(homedir4(), ".grok", "skills");
  await seedBundledSkills(rawGlobalSkillsDir);
  const globalSkillsDir = await fs5.realpath(rawGlobalSkillsDir);
  const projectProviders = [];
  let walkDir = realDir;
  const root2 = parse2(realDir).root;
  while (walkDir !== root2) {
    const candidate = join9(walkDir, ".grok", "skills");
    if (candidate !== globalSkillsDir) {
      projectProviders.push(new FilesystemSkillProvider(candidate));
    }
    walkDir = dirname5(walkDir);
  }
  const globalProvider = new FilesystemSkillProvider(globalSkillsDir);
  const bundledSkills = options?.bundledSkills;
  const skillProviders = [
    ...projectProviders,
    bundledSkills ? new BundledSkillFilter(globalProvider, BUNDLED_SKILL_NAMES_SET, new Set(bundledSkills)) : globalProvider
  ];
  session = {
    sessionId,
    rootWorkingDir,
    originalWorkingDir: realDir,
    shell: new PersistentShell(realDir, shellBin),
    readFileTimestamps: /* @__PURE__ */ new Map(),
    browser: new BrowserService(browserHeadless),
    skillManager: new SkillManager(skillProviders),
    hasVision: options?.hasVision ?? true,
    hasInternetAccess: hasInternetAccess2,
    shellBin,
    unescapeInput: options?.unescapeInput ?? false,
    resetCwd: options?.resetCwd ?? false,
    includeGitStatus: options?.includeGitStatus ?? false,
    enabledTools: options?.enabledTools ? new Set(options.enabledTools) : void 0,
    bundledSkills,
    enabledClis: options?.enabledClis,
    browserHeadless
  };
  sessions.set(sessionId, session);
  return session;
}
async function createSession(workingDir, options) {
  const sessionId = crypto2.randomUUID();
  await getOrCreateSession(sessionId, workingDir, options);
  return sessionId;
}
async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    await Promise.all([session.shell.close(), session.browser.stop()]);
    sessions.delete(sessionId);
  }
}
function getSession(sessionId) {
  return sessions.get(sessionId);
}
function getAllSessions() {
  return Array.from(sessions.values());
}
async function destroyAllSessions() {
  await Promise.all(Array.from(sessions.keys()).map((id) => destroySession(id)));
  fileMutexes.clear();
}
async function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);
  if (!session) {
    return void 0;
  }
  if (updates.hasVision !== void 0) {
    session.hasVision = updates.hasVision;
  }
  if (updates.hasInternetAccess !== void 0) {
    session.hasInternetAccess = updates.hasInternetAccess;
  }
  if (updates.unescapeInput !== void 0) {
    session.unescapeInput = updates.unescapeInput;
  }
  if (updates.includeGitStatus !== void 0) {
    session.includeGitStatus = updates.includeGitStatus;
  }
  if ("enabledTools" in updates) {
    session.enabledTools = updates.enabledTools ? new Set(updates.enabledTools) : void 0;
  }
  if (updates.shellBin !== void 0) {
    if (updates.shellBin !== session.shellBin) {
      const currentCwd = await session.shell.pwd();
      await session.shell.close();
      session.shell = new PersistentShell(currentCwd, updates.shellBin);
    }
    session.shellBin = updates.shellBin;
  }
  if (updates.resetCwd !== void 0) {
    if (updates.resetCwd !== session.resetCwd && updates.resetCwd) {
      await session.shell.setCwd(session.originalWorkingDir);
    }
    session.resetCwd = updates.resetCwd;
  }
  if (updates.browserHeadless !== void 0) {
    if (updates.browserHeadless !== session.browserHeadless) {
      await session.browser.stop();
      session.browser = new BrowserService(updates.browserHeadless);
    }
    session.browserHeadless = updates.browserHeadless;
  }
  return session;
}