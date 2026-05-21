var AppError = class extends Error {
  status;
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
function assertString(name, value, opts = {}) {
  if (value === void 0 || value === null) {
    if (opts.optional)
      return void 0;
    throw new AppError(`${name} required`);
  }
  if (typeof value !== "string") {
    throw new AppError(`${name} must be a string`);
  }
  return value;
}
function errorMiddleware(err2, _req, res, _next) {
  const status = err2 instanceof AppError ? err2.status : 500;
  const message = err2 instanceof Error ? err2.message : "Internal server error";
  log_default.error(message);
  res.status(status).json({ error: message });
}
var ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://localhost:3000",
  "http://cosmos.tyler.svc.lap0.x.ai",
  "https://cosmos.tyler.svc.lap0.x.ai",
  "http://cosmos.tyler.svc.lap1.x.ai",
  "https://cosmos.tyler.svc.lap1.x.ai",
  "http://cosmos.tyler.svc.lap2.x.ai",
  "https://cosmos.tyler.svc.lap2.x.ai",
  "http://cosmos.tyler.svc.lap3.x.ai",
  "https://cosmos.tyler.svc.lap3.x.ai",
  "http://cosmos.tyler.svc.lap4.x.ai",
  "https://cosmos.tyler.svc.lap4.x.ai",
  "http://cosmos.tyler.svc.lap5.x.ai",
  "https://cosmos.tyler.svc.lap5.x.ai",
  "http://cosmos.tyler.svc.lap6.x.ai",
  "https://cosmos.tyler.svc.lap6.x.ai",
  "http://cosmos.tyler.svc.lap7.x.ai",
  "https://cosmos.tyler.svc.lap7.x.ai"
];
function privateNetworkAccessMiddleware(req, res, next) {
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
}
function configureApp() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json({ limit: "10mb" }));
  app.use(privateNetworkAccessMiddleware);
  app.use((0, import_cors.default)({
    origin: ALLOWED_ORIGINS
  }));
  return app;
}
function setupBasicRoutes(app) {
  app.get("/health", (_req, res) => res.status(200).json({ status: "healthy", version: package_default.version }));
  app.get("/pwd", (_req, res) => res.json({ pwd: process.cwd() }));
}
function parseBundledSkills(value) {
  if (value === void 0 || value === null)
    return void 0;
  if (!Array.isArray(value))
    return void 0;
  const valid = new Set(BUNDLED_SKILL_NAMES);
  const invalid = value.filter((v) => typeof v !== "string" || !valid.has(v));
  if (invalid.length > 0) {
    throw new AppError(`Invalid bundledSkills: ${JSON.stringify(invalid)}. Valid values: ${BUNDLED_SKILL_NAMES.join(", ")}`);
  }
  return value;
}
function setupSessionRoutes(app) {
  app.post("/sessions/create", async (req, res) => {
    const { workingDir, rootWorkingDir, hasVision, shellBin, unescapeInput, resetCwd, includeGitStatus, enabledTools, bundledSkills, enabledClis, browserHeadless, hasInternetAccess: hasInternetAccess2 } = req.body;
    if (!workingDir) {
      throw new AppError("workingDir required");
    }
    const options = {
      rootWorkingDir,
      hasVision,
      shellBin,
      unescapeInput,
      resetCwd,
      includeGitStatus,
      enabledTools: Array.isArray(enabledTools) ? new Set(enabledTools) : void 0,
      bundledSkills: parseBundledSkills(bundledSkills),
      enabledClis: Array.isArray(enabledClis) ? enabledClis : void 0,
      browserHeadless,
      hasInternetAccess: hasInternetAccess2
    };
    try {
      const sessionId = await createSession(workingDir, options);
      res.json({ sessionId });
    } catch (err2) {
      if (err2 instanceof Error && (err2.message.includes("does not exist") || err2.message.includes("not a directory"))) {
        throw new AppError(err2.message, 400);
      }
      throw err2;
    }
  });
  app.post("/sessions/destroy", async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      throw new AppError("sessionId required");
    }
    await destroySession(sessionId);
    res.sendStatus(200);
  });
  app.post("/sessions/:sessionId/update", async (req, res) => {
    const updates = req.body;
    if ("bundledSkills" in updates && updates.bundledSkills !== void 0) {
      throw new AppError("bundledSkills cannot be changed after session creation");
    }
    await updateSession(req.params.sessionId, updates);
    res.sendStatus(200);
  });
}
function setupToolRoutes(app) {
  app.post("/sessions/:sessionId/tools/list", async (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) {
      throw new AppError("Session not found", 404);
    }
    ListToolsRequestSchema.parse(req.body);
    const abortController = new AbortController();
    req.on("close", () => {
      if (!res.writableFinished)
        abortController.abort();
    });
    const result = await listToolsHandler(session, abortController);
    res.json(result);
  });
  app.get("/sessions/:sessionId/tools/output", async (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) {
      throw new AppError("Session not found", 404);
    }
    const partial = await session.shell.getPartialOutput();
    res.json(partial);
  });
  app.post("/sessions/:sessionId/tools/call", async (req, res) => {
    const start = Date.now();
    const session = getSession(req.params.sessionId);
    if (!session) {
      throw new AppError("Session not found", 404);
    }
    const request = CallToolRequestSchema.parse(req.body);
    const abortController = new AbortController();
    req.on("close", () => {
      if (!res.writableFinished)
        abortController.abort();
    });
    const rawTraceparent = request.params._meta?.traceparent;
    const traceparent = typeof rawTraceparent === "string" && /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(rawTraceparent) ? rawTraceparent : void 0;
    const result = await callToolHandler(request, session, abortController, traceparent);
    result._meta ??= {};
    result._meta.toolDurationMs = Date.now() - start;
    log_default.info({
      tool: request.params.name,
      clientDurationMs: result._meta.toolDurationMs
    }, "Tool call completed (route)");
    res.json(result);
  });
}
function setupSessionInfoRoute(app) {
  app.get("/sessions/:sessionId", async (req, res) => {
    const session = getSession(req.params.sessionId);
    if (!session) {
      throw new AppError("Session not found", 404);
    }
    const abortController = new AbortController();
    req.on("close", () => {
      if (!res.writableFinished)
        abortController.abort();
    });
    const [envInfo, contextData, tools, grokClis] = await Promise.all([
      getEnvInfo(session),
      getContext(session),
      listToolsHandler(session, abortController),
      getGrokClis(session.enabledClis)
    ]);
    const { Skills: skillsBody, ...contextWithoutSkills } = contextData;
    const skills = skillsBody ? `## Skills
${skillsBody}` : void 0;
    const context = formatContext(contextWithoutSkills, session);
    res.json({
      sessionId: req.params.sessionId,
      envInfo,
      context,
      tools,
      ...grokClis ? { grokClis } : {},
      ...skills ? { skills } : {}
    });
  });
}
function setupFilesystemRoutes(app) {
  app.get("/filesystem/home", (_req, res) => {
    res.json({ home: getHomeDirectory() });
  });
  app.get("/filesystem/common", async (_req, res) => {
    const directories = await getExistingCommonDirectories();
    res.json({ directories });
  });
  app.get("/filesystem/exists", async (req, res) => {
    const path12 = req.query.path;
    if (!path12) {
      throw new AppError("path query parameter required");
    }
    const result = await checkPathExists(path12);
    res.json(result);
  });
  app.get("/filesystem/list", async (req, res) => {
    const path12 = req.query.path || "~";
    const showHidden = req.query.showHidden === "true";
    try {
      const result = await listDirectory2(path12);
      if (!showHidden) {
        result.entries = result.entries.filter((entry) => !entry.isHidden);
      }
      res.json(result);
    } catch (err2) {
      if (err2 instanceof Error) {
        throw new AppError(err2.message, 400);
      }
      throw err2;
    }
  });
  app.get("/filesystem/complete", async (req, res) => {
    const prefix = req.query.prefix;
    if (prefix === void 0) {
      throw new AppError("prefix query parameter required");
    }
    const result = await completePath(prefix);
    res.json(result);
  });
}
function setupSkillRoutes(app) {
  app.get("/skills/installed", async (req, res) => {
    const workingDir = req.query.workingDir;
    const skills = await listInstalledSkills(workingDir);
    res.json({ skills });
  });
  app.get("/skills/available", async (req, res) => {
    const repo = req.query.repo || "xai-org/skills";
    const path12 = req.query.path || "skills/.curated";
    const ref = req.query.ref || "main";
    const workingDir = req.query.workingDir;
    try {
      const skills = await listRemoteSkills(repo, path12, ref, workingDir);
      res.json({ skills });
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      res.status(502).json({ error: message });
    }
  });
  app.post("/skills/install", async (req, res) => {
    const { repo, path: path12, ref, name, url, scope, workingDir } = req.body;
    if (!url && (!repo || !path12)) {
      throw new AppError('Either "url" or both "repo" and "path" required');
    }
    if (scope === "project" && !workingDir) {
      throw new AppError('"workingDir" is required when scope is "project"');
    }
    try {
      const result = await installSkill({
        repo,
        path: path12,
        ref,
        name,
        url,
        scope,
        workingDir
      });
      invalidateAllSkillCaches();
      res.json(result);
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      if (message.includes("already exists")) {
        res.status(409).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });
  app.post("/skills/uninstall", async (req, res) => {
    const { name, scope, workingDir } = req.body;
    if (!name) {
      throw new AppError('"name" is required');
    }
    if (scope === "project" && !workingDir) {
      throw new AppError('"workingDir" is required when scope is "project"');
    }
    try {
      await uninstallSkill(name, scope, workingDir);
      invalidateAllSkillCaches();
      res.json({ success: true, name });
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      res.status(400).json({ error: message });
    }
  });
}
function invalidateAllSkillCaches() {
  try {
    const sessions2 = getAllSessions();
    for (const session of sessions2) {
      session.skillManager.invalidateCache();
    }
  } catch {
  }
}
var MAX_STATUS_PATHS = 200;
function setupWorktreeRoutes(app) {
  app.get("/worktrees/list", async (req, res) => {
    const repoPath = assertString("repoPath", req.query.repoPath);
    if (!await isGitRepo(repoPath)) {
      res.json({
        worktrees: [],
        defaultBranch: null,
        userSlug: null,
        isGitRepo: false
      });
      return;
    }
    const summary = await getRepoSummary(repoPath);
    res.json({ ...summary, isGitRepo: true });
  });
  app.post("/worktrees/create", async (req, res) => {
    const body = req.body ?? {};
    const repoPath = assertString("repoPath", body.repoPath);
    const branch = assertString("branch", body.branch);
    const fromBranch = assertString("fromBranch", body.fromBranch, {
      optional: true
    });
    const donorPath = assertString("donorPath", body.donorPath, {
      optional: true
    });
    const dst = assertString("dst", body.dst, { optional: true });
    const inheritWorkspace = body.inheritWorkspace !== false;
    const skipFetch = body.skipFetch === true;
    try {
      const result = await createWorktree({
        repoPath,
        branch,
        fromBranch,
        inheritWorkspace,
        donorPath,
        dst,
        skipFetch
      });
      res.json(result);
    } catch (err2) {
      if (err2 instanceof WorktreeError) {
        const status = err2.kind === "dst-exists" ? 409 : err2.kind === "not-a-repo" ? 404 : 400;
        res.status(status).json({ error: err2.message, kind: err2.kind });
        return;
      }
      throw err2;
    }
  });
  app.get("/worktrees/probe", async (req, res) => {
    const target = assertString("path", req.query.path);
    const result = await probeWorktree(target);
    res.json(result);
  });
  app.post("/worktrees/remove", async (req, res) => {
    const body = req.body ?? {};
    const repoPath = assertString("repoPath", body.repoPath);
    const worktreePath = assertString("worktreePath", body.worktreePath);
    const removeBranch = body.removeBranch === true;
    try {
      const result = await removeWorktree2({
        repoPath,
        worktreePath,
        removeBranch
      });
      res.json({ success: true, ...result });
    } catch (err2) {
      if (err2 instanceof WorktreeError) {
        const status = err2.kind === "invalid-target" ? 400 : 404;
        res.status(status).json({ error: err2.message, kind: err2.kind });
        return;
      }
      throw err2;
    }
  });
  app.post("/worktrees/status", async (req, res) => {
    const paths = req.body?.paths ?? [];
    if (!Array.isArray(paths)) {
      throw new AppError("paths must be an array of strings");
    }
    if (paths.length > MAX_STATUS_PATHS) {
      throw new AppError(`paths length ${paths.length} exceeds max ${MAX_STATUS_PATHS}`);
    }
    const inputs = paths.filter((p) => typeof p === "string");
    const entries = await Promise.all(inputs.map(async (p) => {
      try {
        const status = await getWorktreeStatus(p);
        return [p, status];
      } catch {
        return [p, null];
      }
    }));
    const out = {};
    for (const [p, s] of entries)
      out[p] = s;
    res.json({ statuses: out });
  });
}
function setupRoutes(app) {
  setupBasicRoutes(app);
  setupFilesystemRoutes(app);
  setupSessionRoutes(app);
  setupToolRoutes(app);
  setupSessionInfoRoute(app);
  setupSkillRoutes(app);
  setupWorktreeRoutes(app);
  cleanupTrashOnStartup();
}
async function startListening(app, port) {
  return new Promise((resolve8, reject2) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const local_addr = `127.0.0.1:${port}`;
      const url = `http://${local_addr}`;
      log_default.info(`HTTP server listening on ${local_addr}`);
      resolve8({ url });
    });
    server.on("error", reject2);
  });
}
async function startServer() {
  const port = Number(config_default.port);
  const app = configureApp();
  setupRoutes(app);
  app.use(errorMiddleware);
  try {
    await startListening(app, port);
  } catch (error) {
    log_default.error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}