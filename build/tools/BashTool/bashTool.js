var MAX_OUTPUT_LENGTH = 5e3;
var DEFAULT_TIMEOUT_SECONDS = 30;
function formatOutput(content, maxLength = MAX_OUTPUT_LENGTH) {
  if (content.length <= maxLength) {
    return {
      totalLines: content.split("\n").length,
      truncatedContent: content
    };
  }
  const halfLength = maxLength / 2;
  const start = content.slice(0, halfLength);
  const end = content.slice(-halfLength);
  const truncatedChars = content.length - halfLength * 2;
  const truncated = `${start}

... [${truncatedChars} characters truncated] ...

${end}`;
  return {
    totalLines: content.split("\n").length,
    truncatedContent: truncated
  };
}
var inputSchema = external_exports.strictObject({
  command: external_exports.string().describe("The command to execute"),
  timeout: external_exports.number().int().min(0).max(600).optional().default(DEFAULT_TIMEOUT_SECONDS).describe("Timeout in seconds"),
  background: external_exports.boolean().optional().default(false).describe("Runs the command in the background. Will return immediately without waiting for the command to complete. Returns a process id and a log file path where the output will be sent."),
  maxOutputLength: external_exports.number().int().min(0).optional().default(MAX_OUTPUT_LENGTH).describe("Maximum amount of characters to return in the output.")
});
var BashTool = {
  name: "bash",
  description: () => `Executes a given bash command in a persistent shell session.`,
  inputSchema: () => inputSchema,
  isReadOnly: () => false,
  isEnabled: () => true,
  validateInput: async () => {
    return { result: true };
  },
  renderResultForAssistant(data) {
    if (data.pid !== void 0) {
      return [
        {
          type: "text",
          text: `<background_process>PID: ${data.pid}
Log File: ${data.logFile}</background_process>`
        }
      ];
    }
    const { interrupted, stdout, stderr, timedOut } = data;
    let errorMessage = stderr;
    if (interrupted) {
      if (errorMessage.trim())
        errorMessage += EOL;
      errorMessage += "<error>Command was aborted before completion</error>";
    }
    if (timedOut) {
      if (errorMessage.trim())
        errorMessage += EOL;
      errorMessage += "<error>Command execution timed out. Consider improving the command, changing the timeout, or if it's a long-running process like a server, run it in the background using the 'background' flag.</error>";
    }
    const hasBoth = stdout.trim() !== "" && errorMessage.trim() !== "";
    return [
      {
        type: "text",
        text: `${stdout}${hasBoth ? "\n" : ""}${errorMessage}`
      }
    ];
  },
  async call(input, context) {
    const { timeout = DEFAULT_TIMEOUT_SECONDS, background } = input;
    let command = context.session.unescapeInput ? fixEscapedString(input.command) : input.command;
    const { abortController } = context;
    const isBackground = background;
    if (context.traceparent) {
      command = `TRACEPARENT='${context.traceparent}' ${command}`;
    }
    const result = await context.session.shell.exec(command, abortController.signal, timeout * 1e3, isBackground);
    let data;
    if (result.pid !== void 0) {
      data = {
        stdout: "",
        stdoutLines: 0,
        stderr: "",
        stderrLines: 0,
        interrupted: result.interrupted,
        pid: result.pid,
        logFile: result.logFile
      };
      const interval = setInterval(async () => {
        try {
          process.kill(result.pid, 0);
          if (result.logFile) {
            await appendFile(result.logFile, `<grok_health_check>Passed at ${(/* @__PURE__ */ new Date()).toISOString()}</grok_health_check>
`);
          }
        } catch (e) {
          if (e.code === "ESRCH" && result.logFile) {
            await appendFile(result.logFile, `<grok_health_check>ESRCH: Failed at ${(/* @__PURE__ */ new Date()).toISOString()}</grok_health_check>
`);
          }
          clearInterval(interval);
        }
      }, 1e4);
    } else {
      const stdoutStr = result.stdout;
      let stderrStr = result.stderr;
      if (result.code !== 0) {
        if (stderrStr.trim())
          stderrStr += EOL;
        stderrStr += `Exit code ${result.code}`;
      }
      if (context.session.resetCwd) {
        const currentPwd = resolve3(await context.session.shell.pwd());
        const originalPwd = resolve3(context.session.originalWorkingDir);
        const pathsMatch = process.platform === "win32" ? currentPwd.toLowerCase() === originalPwd.toLowerCase() : currentPwd === originalPwd;
        if (!pathsMatch) {
          await context.session.shell.setCwd(context.session.originalWorkingDir);
          if (stderrStr.trim())
            stderrStr += EOL;
          stderrStr += `Shell cwd was reset to ${context.session.originalWorkingDir}`;
          log_default.info("bash_tool_reset_to_working_dir", {});
        }
      }
      const { totalLines: stdoutLines, truncatedContent: truncatedStdoutContent } = formatOutput(stdoutStr, input.maxOutputLength);
      const { totalLines: stderrLines, truncatedContent: truncatedStderrContent } = formatOutput(stderrStr, input.maxOutputLength);
      data = {
        stdout: truncatedStdoutContent,
        stdoutLines,
        stderr: truncatedStderrContent,
        stderrLines,
        interrupted: result.interrupted,
        timedOut: result.timedOut
      };
    }
    return {
      type: "result",
      resultForAssistant: this.renderResultForAssistant(data),
      data
    };
  }
};