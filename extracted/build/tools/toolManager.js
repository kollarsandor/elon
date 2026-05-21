var GROK_COMPUTER_TOOLS = [
  FileReadTool,
  FileEditTool,
  FileWriteTool,
  BashTool,
  BrowserTabTool,
  BrowserNetworkDetailsTool
];
async function getEnabledTools(session) {
  let tools;
  if (session.enabledTools !== void 0) {
    tools = GROK_COMPUTER_TOOLS.filter((t) => session.enabledTools.has(t.name));
  } else {
    tools = GROK_COMPUTER_TOOLS;
  }
  return Promise.all(tools.map(async (t) => await t.isEnabled() ? t : null)).then((t) => t.filter((t2) => t2 !== null));
}
async function listToolsHandler(session, abortController) {
  const enabledTools = await getEnabledTools(session);
  const listContext = {
    abortController,
    options: { tools: enabledTools },
    readFileTimestamps: session.readFileTimestamps,
    session
  };
  const tools = await Promise.all(enabledTools.map(async (tool) => {
    const inputSchema5 = typeof tool.inputSchema === "function" ? await tool.inputSchema(listContext) : tool.inputSchema;
    const jsonSchema = zodToJsonSchema(inputSchema5, {
      rejectedAdditionalProperties: void 0
    });
    jsonSchema.$schema = void 0;
    const description = typeof tool.description === "function" ? await tool.description(listContext) : tool.description;
    return {
      name: tool.name,
      title: tool.name,
      description,
      inputSchema: jsonSchema
    };
  }));
  return { tools };
}
function ensureHasContent(content) {
  if (!content || content.length === 0 || !content.some((item) => {
    if (item.type === "text")
      return item.text.length > 0;
    return true;
  })) {
    return [{ type: "text", text: "(no content)" }];
  }
  return content;
}
async function callToolHandler(request, session, abortController, traceparent) {
  const { name, arguments: args } = request.params;
  const enabledTools = await getEnabledTools(session);
  const tool = enabledTools.find((t) => t.name === name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Tool ${name} not found` }]
    };
  }
  const listContext = {
    abortController,
    options: { tools: enabledTools },
    readFileTimestamps: session.readFileTimestamps,
    session,
    traceparent
  };
  const inputSchema5 = typeof tool.inputSchema === "function" ? await tool.inputSchema(listContext) : tool.inputSchema;
  const parsedArgs = args ? parseParams(args, inputSchema5) : {};
  const parsedInput = inputSchema5.safeParse(parsedArgs);
  if (!parsedInput.success) {
    log_default.error(`InputValidationError: ${parsedInput.error.message}`);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `InputValidationError: ${parsedInput.error.message}`
        }
      ]
    };
  }
  const validation = await tool.validateInput?.(parsedInput.data, listContext);
  if (validation && !validation.result) {
    return {
      isError: true,
      content: [{ type: "text", text: validation.message }]
    };
  }
  try {
    const callStart = Date.now();
    const result = await tool.call(parsedInput.data, listContext);
    const content = ensureHasContent(result.resultForAssistant);
    const durationMs = Date.now() - callStart;
    log_default.info({ tool: name, durationMs }, "Tool call completed");
    return { content, metadata: result.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log_default.error(`Unknown error calling tool ${name}: ${message}`);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}