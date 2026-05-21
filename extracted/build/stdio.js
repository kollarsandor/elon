import { createInterface } from "readline";
async function startStdioMode() {
  log_default.info("Starting in MCP stdio mode");
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  let sessionId = null;
  let processing = false;
  const lineQueue = [];
  rl.on("line", (line) => {
    lineQueue.push(line);
    void processNext();
  });
  async function processNext() {
    if (processing || lineQueue.length === 0)
      return;
    processing = true;
    const line = lineQueue.shift();
    let request;
    try {
      request = parseJsonRpcRequest(line);
      const response = await processRequest(request, sessionId);
      if (response) {
        process.stdout.write(JSON.stringify(response) + "\n");
      }
      if (request.method === "session/init" && response?.result) {
        sessionId = response.result.sessionId;
      }
      if (request.method === "session/close" && sessionId) {
        sessionId = null;
      }
    } catch (err2) {
      const errorResponse = createErrorResponse(err2 instanceof Error ? err2.message : "Unknown error", request?.id);
      process.stdout.write(JSON.stringify(errorResponse) + "\n");
    } finally {
      processing = false;
      void processNext();
    }
  }
  rl.on("close", async () => {
    while (lineQueue.length > 0 || processing) {
      await new Promise((resolve8) => setTimeout(resolve8, 50));
    }
    if (sessionId) {
      destroySession(sessionId).catch((err2) => log_default.error("Error destroying session on close", err2));
    }
    log_default.info("Stdio mode closed");
  });
}
function parseJsonRpcRequest(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (parsed.jsonrpc !== "2.0" || typeof parsed.method !== "string") {
    throw new Error("Invalid JSON-RPC request");
  }
  return parsed;
}
async function processRequest(request, currentSessionId) {
  const abortController = new AbortController();
  switch (request.method) {
    case "session/init": {
      if (currentSessionId)
        throw new Error("Session already initialized");
      const params = request.params ?? {};
      const workingDir = params.workingDir ?? process.cwd();
      const options = params.options ?? {};
      const newSessionId = await createSession(workingDir, options);
      return {
        jsonrpc: "2.0",
        result: { sessionId: newSessionId },
        id: request.id
      };
    }
    case "tool/discover": {
      if (!currentSessionId)
        throw new Error("Session not initialized");
      const session = getSession(currentSessionId);
      if (!session)
        throw new Error("Session not found");
      const tools = await listToolsHandler(session, abortController);
      return { jsonrpc: "2.0", result: tools, id: request.id };
    }
    case "tool/call": {
      if (!currentSessionId)
        throw new Error("Session not initialized");
      const session = getSession(currentSessionId);
      if (!session)
        throw new Error("Session not found");
      const toolRequest = { params: request.params };
      const result = await callToolHandler(toolRequest, session, abortController);
      return { jsonrpc: "2.0", result, id: request.id };
    }
    case "session/close": {
      if (!currentSessionId)
        throw new Error("No session to close");
      await destroySession(currentSessionId);
      return { jsonrpc: "2.0", result: { success: true }, id: request.id };
    }
    case "session/info": {
      if (!currentSessionId)
        throw new Error("Session not initialized");
      const session = getSession(currentSessionId);
      if (!session)
        throw new Error("Session not found");
      const grokClis = await getGrokClis(session.enabledClis);
      return {
        jsonrpc: "2.0",
        result: {
          sessionId: session.sessionId,
          workingDir: session.originalWorkingDir,
          hasVision: session.hasVision,
          hasInternetAccess: session.hasInternetAccess,
          shellBin: session.shellBin,
          unescapeInput: session.unescapeInput,
          resetCwd: session.resetCwd,
          includeGitStatus: session.includeGitStatus,
          browserHeadless: session.browserHeadless,
          enabledTools: session.enabledTools ? Array.from(session.enabledTools) : void 0,
          enabledClis: session.enabledClis,
          ...grokClis ? { grokClis } : {}
        },
        id: request.id
      };
    }
    default:
      throw new Error(`Unknown method: ${request.method}`);
  }
}
function createErrorResponse(message, id) {
  return {
    jsonrpc: "2.0",
    error: { code: -32601, message },
    id
  };
}