async function getDefaultChromeProfileDir() {
  const platform = process.platform;
  let userDataDir;
  if (platform === "darwin") {
    userDataDir = path3.join(os2.homedir(), "Library", "Application Support", "Google", "Chrome");
  } else if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData)
      return null;
    userDataDir = path3.join(localAppData, "Google", "Chrome", "User Data");
  } else if (platform === "linux") {
    userDataDir = path3.join(os2.homedir(), ".config", "google-chrome");
  } else {
    return null;
  }
  const defaultProfile = path3.join(userDataDir, "Default");
  try {
    await access2(defaultProfile, constants4.F_OK);
    return defaultProfile;
  } catch {
    return null;
  }
}
async function copySessionData(sourceProfileDir, destUserDataDir) {
  const destProfileDir = path3.join(destUserDataDir, "Default");
  await mkdir3(destProfileDir, { recursive: true });
  const filesToCopy = [
    "Cookies",
    // Main cookie database
    "Cookies-journal"
    // SQLite journal for cookies
  ];
  const directoriesToCopy = [
    "Local Storage",
    // Many SPAs store auth tokens here
    "IndexedDB",
    // Used by many apps for persistent auth data
    "Service Worker"
    // Can contain cached auth state
  ];
  for (const file of filesToCopy) {
    const src = path3.join(sourceProfileDir, file);
    const dest = path3.join(destProfileDir, file);
    try {
      await copyFile(src, dest);
      log_default.info(`Copied ${file} from default Chrome profile`);
    } catch {
    }
  }
  for (const dir of directoriesToCopy) {
    const src = path3.join(sourceProfileDir, dir);
    const dest = path3.join(destProfileDir, dir);
    try {
      await cp(src, dest, { recursive: true });
      log_default.info(`Copied ${dir}/ from default Chrome profile`);
    } catch {
    }
  }
}
function shortTmpdir() {
  return process.platform === "win32" ? os2.tmpdir() : "/tmp";
}
var BrowserService = class _BrowserService {
  chromePort = null;
  browserProcess = null;
  isBrowserRunning = false;
  browserClient = null;
  openTabs = /* @__PURE__ */ new Map();
  networkDataPerTab = /* @__PURE__ */ new Map();
  nextShortId = 1;
  chromeUserDataDir = null;
  headless = true;
  constructor(headless = true) {
    this.headless = headless;
  }
  static async getChromePath() {
    const platform = process.platform;
    if (process.env.CHROME_PATH) {
      return process.env.CHROME_PATH;
    }
    let paths = [];
    if (platform === "darwin") {
      paths = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    } else if (platform === "win32") {
      const programFiles = process.env.ProgramFiles || "C:\\Program Files";
      const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        paths.push(`${localAppData}\\Google\\Chrome\\Application\\chrome.exe`);
      }
      paths.push(`${programFiles}\\Google\\Chrome\\Application\\chrome.exe`);
      paths.push(`${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`);
    } else if (platform === "linux") {
      const result = await execFileNoThrow("which", ["google-chrome"]);
      if (result.code === 0 && result.stdout) {
        return result.stdout.trim();
      }
      paths = [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser"
      ];
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    for (const path12 of paths) {
      try {
        await access2(path12, constants4.F_OK);
        return path12;
      } catch {
      }
    }
    throw new Error("Google Chrome not found on this system. Please set CHROME_PATH environment variable.");
  }
  async ensureRunning() {
    if (!this.isBrowserRunning) {
      const chromePath = await _BrowserService.getChromePath();
      this.chromeUserDataDir = await mkdtemp(path3.join(os2.tmpdir(), "grok-chrome-"));
      const defaultProfileDir = await getDefaultChromeProfileDir();
      if (defaultProfileDir) {
        await copySessionData(defaultProfileDir, this.chromeUserDataDir);
      }
      let args = [
        "--remote-debugging-port=0",
        `--user-data-dir=${this.chromeUserDataDir}`,
        "--no-first-run",
        "--no-default-browser-check"
      ];
      if (this.headless) {
        args.unshift("--headless");
      }
      if (process.env.CHROMIUM_FLAGS) {
        args = [...args, ...process.env.CHROMIUM_FLAGS.split(" ")];
      }
      if (await env2.getIsDocker())
        args.push("--no-sandbox --disable-gpu");
      const browserProc = spawn(chromePath, args);
      browserProc.on("error", (err2) => {
        this.isBrowserRunning = false;
        log_default.error(err2);
      });
      browserProc.on("exit", () => {
        this.isBrowserRunning = false;
        this.browserProcess = null;
        this.browserClient = null;
        this.openTabs.clear();
        this.nextShortId = 1;
        this.chromePort = null;
      });
      const portPromise = new Promise((resolve8, reject2) => {
        const onData = (data) => {
          const line = data.toString();
          const match2 = line.match(/DevTools listening on ws:\/\/.*:(\d+)\/devtools\/browser\/.*/);
          if (match2) {
            browserProc.stderr.off("data", onData);
            resolve8(parseInt(match2[1], 10));
          }
        };
        browserProc.stderr.on("data", onData);
        browserProc.on("error", reject2);
        browserProc.on("exit", () => reject2(new Error("Browser exited before getting port")));
      });
      this.chromePort = await portPromise;
      log_default.info(`Using chrome port: ${this.chromePort}`);
      this.browserProcess = browserProc;
      this.browserClient = await this.connectBrowserClient();
      this.isBrowserRunning = true;
    }
    if (!this.browserClient) {
      this.browserClient = await this.connectBrowserClient();
    }
    return this.browserClient;
  }
  /**
   * Open a CDP connection at the browser level with a bounded retry
   * loop. Used by both the initial bring-up branch and the cache-miss
   * reconnect branch in `ensureRunning()`.
   *
   * Retries on every error class — Chrome's debug port is up before
   * any default tab exists, so the first attempts can throw `No
   * inspectable targets` from `defaultTargetFactory`. They succeed
   * once a tab materialises (usually < 1s).
   */
  async connectBrowserClient() {
    const maxWaitMs = 5e3;
    const pollIntervalMs = 500;
    const startTime = Date.now();
    let lastErr;
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const client = await (0, import_chrome_remote_interface.default)({
          host: "127.0.0.1",
          port: this.chromePort
        });
        client.on("disconnect", () => {
          this.browserClient = null;
        });
        return client;
      } catch (err2) {
        lastErr = err2;
        await new Promise((resolve8) => setTimeout(resolve8, pollIntervalMs));
      }
    }
    if (lastErr instanceof Error)
      throw lastErr;
    throw new Error(`Browser failed to start within ${maxWaitMs / 1e3}s`);
  }
  /** Allocate a short, session-local tab id ("t1", "t2", ...). */
  allocateTabId() {
    return `t${this.nextShortId++}`;
  }
  /**
   * Resolve a model-supplied tab id to its `openTabs` key. Accepts the
   * short id we returned ("t1") OR the raw Chrome GUID for backwards
   * compatibility with in-flight conversations from before the
   * short-id change.
   */
  resolveTabId(input) {
    if (this.openTabs.has(input))
      return input;
    for (const [shortId, rec] of this.openTabs.entries()) {
      if (rec.chromeTargetId === input)
        return shortId;
    }
    return void 0;
  }
  async withTab(tabId, callback, closeAfter = true) {
    const client = await this.ensureRunning();
    let shortId;
    let chromeTargetId;
    let created = false;
    if (!tabId) {
      const { targetId } = await client.Target.createTarget({
        url: "about:blank"
      });
      chromeTargetId = targetId;
      shortId = this.allocateTabId();
      this.openTabs.set(shortId, {
        url: "about:blank",
        createdAt: /* @__PURE__ */ new Date(),
        chromeTargetId
      });
      created = true;
      closeAfter = true;
    } else {
      const resolved = this.resolveTabId(tabId);
      if (!resolved)
        throw new Error(`Tab ${tabId} not found`);
      shortId = resolved;
      chromeTargetId = this.openTabs.get(shortId).chromeTargetId;
    }
    const tabClient = await (0, import_chrome_remote_interface.default)({
      host: "127.0.0.1",
      port: this.chromePort,
      target: chromeTargetId
    });
    try {
      return await callback(tabClient, shortId);
    } finally {
      await tabClient.close();
      if (closeAfter) {
        await client.Target.closeTarget({ targetId: chromeTargetId });
        if (!created)
          this.openTabs.delete(shortId);
      }
    }
  }
  async stop() {
    if (this.isBrowserRunning) {
      if (this.browserClient) {
        for (const rec of this.openTabs.values()) {
          try {
            await this.browserClient.Target.closeTarget({
              targetId: rec.chromeTargetId
            });
          } catch {
          }
        }
        this.openTabs.clear();
        this.nextShortId = 1;
        this.networkDataPerTab.clear();
        await this.browserClient.close();
        this.browserClient = null;
      }
      if (this.browserProcess) {
        this.browserProcess.kill();
        this.browserProcess = null;
        if (this.chromeUserDataDir) {
          try {
            await rm2(this.chromeUserDataDir, {
              recursive: true,
              force: true,
              maxRetries: 10,
              retryDelay: 100
            });
          } catch (error) {
            log_default.error(`Failed to remove Chrome user data directory: ${error}`);
          }
          this.chromeUserDataDir = null;
        }
      }
      this.chromePort = null;
      this.isBrowserRunning = false;
    }
  }
  stopSync() {
    if (this.browserProcess) {
      this.browserProcess.kill();
      if (this.chromeUserDataDir) {
        try {
          rmSync(this.chromeUserDataDir, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100
          });
        } catch {
        }
        this.chromeUserDataDir = null;
      }
    }
    this.openTabs.clear();
    this.nextShortId = 1;
    this.networkDataPerTab.clear();
    this.isBrowserRunning = false;
    this.browserClient = null;
    this.browserProcess = null;
    this.chromePort = null;
  }
};