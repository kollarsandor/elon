var import_chrome_remote_interface3 = __toESM(require_chrome_remote_interface(), 1);
import { mkdtemp as mkdtemp3, writeFile as writeFile4 } from "fs/promises";
import path5 from "path";
var INLINE_RESULT_THRESHOLD = 1024;
var visionSchema = external_exports.strictObject({
  jsCode: external_exports.string().optional().describe("JavaScript code to execute in the tab. Runs as the body of an async function, so top-level `await` and `return` work, and the value of the last expression is returned automatically. Variables declared with const/let/var are scoped to a single call \u2014 assign to `window.<name>` if you need to share state across calls on the same tab."),
  tabId: external_exports.string().optional().describe("Existing tab ID. If omitted, creates a new one"),
  url: external_exports.string().optional().describe("URL to navigate to if needed"),
  refresh: external_exports.boolean().optional().default(false).describe("Refresh the tab before executing the code"),
  waitTime: external_exports.number().min(0).optional().default(2).describe("Wait time after load before executing the code in seconds"),
  timeout: external_exports.number().optional().default(5).describe("Timeout for JS execution in seconds"),
  includeNetwork: external_exports.boolean().optional().default(false).describe("Include network summaries"),
  includeLogs: external_exports.boolean().optional().default(false).describe("Include console logs"),
  screenshot: external_exports.enum(["mobile", "desktop", "both"]).optional().describe("Include a screenshot of the page with device emulation: 'mobile', 'desktop', or 'both'")
});
var nonVisionSchema = external_exports.strictObject({
  jsCode: external_exports.string().optional().describe("JavaScript code to execute in the tab. Runs as the body of an async function, so top-level `await` and `return` work, and the value of the last expression is returned automatically. Variables declared with const/let/var are scoped to a single call \u2014 assign to `window.<name>` if you need to share state across calls on the same tab."),
  tabId: external_exports.string().optional().describe("Existing tab ID. If omitted, creates a new one"),
  url: external_exports.string().optional().describe("URL to navigate to if needed"),
  refresh: external_exports.boolean().optional().default(false).describe("Refresh the tab before executing the code"),
  waitTime: external_exports.number().min(0).optional().default(2).describe("Wait time after load before executing the code in seconds"),
  timeout: external_exports.number().optional().default(5).describe("Timeout for JS execution in seconds"),
  includeNetwork: external_exports.boolean().optional().default(false).describe("Include network summaries"),
  includeLogs: external_exports.boolean().optional().default(false).describe("Include console logs")
});
function wrapJsCode(code) {
  const lines = code.trimEnd().split("\n");
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && !lines[lastIdx].trim())
    lastIdx--;
  if (lastIdx >= 0) {
    const lastLine = lines[lastIdx].trimStart();
    const statementPattern = /^(const |let |var |if |else |for |while |do |switch |try |catch |finally |function |class |return |throw |import |export |break |continue |\{|\}|\/\/)/;
    if (!statementPattern.test(lastLine)) {
      const trimmed = lastLine.replace(/;?\s*$/, "");
      const indent = lines[lastIdx].match(/^(\s*)/)?.[1] ?? "";
      lines[lastIdx] = `${indent}return (${trimmed});`;
    }
  }
  return `(async () => {
${lines.join("\n")}
})()`;
}
function computeEffectiveTimeout(timeout, waitTime, jsCode) {
  let needed = timeout;
  if (jsCode) {
    const re = /setTimeout\s*\([^,]*,\s*(\d+)\s*\)/g;
    let maxSleepMs = 0;
    let m;
    while ((m = re.exec(jsCode)) !== null) {
      const ms = Number(m[1]);
      if (Number.isFinite(ms))
        maxSleepMs = Math.max(maxSleepMs, ms);
    }
    const inScriptSleepSec = Math.ceil(maxSleepMs / 1e3);
    if (inScriptSleepSec + 2 > needed)
      needed = inScriptSleepSec + 2;
  }
  if (waitTime > timeout)
    needed = Math.max(needed, waitTime + 5);
  return needed;
}
function isInvalidTabError(err2) {
  if (!(err2 instanceof Error))
    return false;
  return /Invalid tabId|Tab .* not found|Tab not found|No such target/i.test(err2.message);
}
function isRecoverableConnectionError(err2) {
  if (!(err2 instanceof Error))
    return false;
  return /WebSocket is not open|Connection (?:is )?closed|socket hang up/i.test(err2.message);
}
var BrowserTabTool = {
  name: "browser_tab",
  description: (context) => {
    if (context?.session.hasVision) {
      return `This tool loads a URL or fetches the content of an existing browser tab, optionally executes JavaScript code, and then captures the results along with optional inspection data, such as network requests, console logs, and screenshots.`;
    }
    return `This tool loads a URL or fetches the content of an existing browser tab, optionally executes JavaScript code, and then captures the results along with optional inspection data, such as network requests and console logs.`;
  },
  inputSchema: (context) => {
    return context?.session.hasVision ? visionSchema : nonVisionSchema;
  },
  isReadOnly: () => false,
  isEnabled: () => true,
  renderResultForAssistant: (data) => {
    const tabIdSuffix = data.tabRecreated ? " (new tab \u2014 previous tabId was no longer open)" : "";
    const sections = [
      {
        type: "text",
        text: `Tab ID: ${data.tabId}${tabIdSuffix}`
      }
    ];
    if (data.error) {
      sections.push({
        type: "text",
        text: `Error: ${data.error}`
      });
    }
    if (data.result !== void 0) {
      sections.push({ type: "text", text: `Result: ${data.result}` });
    } else if (data.resultFile) {
      sections.push({ type: "text", text: `Result: ${data.resultFile}` });
    }
    if (data.consoleLogs.length) {
      sections.push({
        type: "text",
        text: `Console Logs:
${data.consoleLogs.map((log2) => `[${log2.type}] ${truncate(log2.message, 1e4)}`).join("\n")}`
      });
    }
    if (data.networkSummaries?.length) {
      sections.push({
        type: "text",
        text: `Network Summaries:
${data.networkSummaries.map((network) => `[id: ${network.requestId}] ${network.method} ${truncate(network.url, 500)} (${network.status || "Pending"})`).join("\n")}`
      });
    }
    if (data.screenshots?.mobile) {
      const s = data.screenshots.mobile;
      sections.push({
        type: "text",
        text: `Mobile Screenshot (${s.pixelWidth}\xD7${s.pixelHeight} viewport, page height: ${s.pageHeight}px, scrollY: ${s.scrollY}px):`
      });
      sections.push({
        type: "image",
        data: s.base64,
        mimeType: "image/png"
      });
    }
    if (data.screenshots?.desktop) {
      const s = data.screenshots.desktop;
      sections.push({
        type: "text",
        text: `Desktop Screenshot (${s.pixelWidth}\xD7${s.pixelHeight} viewport, page height: ${s.pageHeight}px, scrollY: ${s.scrollY}px):`
      });
      sections.push({
        type: "image",
        data: s.base64,
        mimeType: "image/png"
      });
    }
    const joined = sections.reduce((acc, block, idx) => {
      if (idx > 0 && block.type === "text") {
        acc.push({ type: "text", text: "\n\n" });
      }
      acc.push(block);
      return acc;
    }, []);
    return joined;
  },
  call: async function(input, context) {
    const { tabId: providedTabId, url, refresh = false, jsCode, timeout = 5, waitTime = 2, includeNetwork, includeLogs } = input;
    let screenshot;
    if ("screenshot" in input) {
      screenshot = input.screenshot;
    }
    const output = {
      tabId: "",
      consoleLogs: []
    };
    if (screenshot && !context?.session.hasVision) {
      output.error = "Cannot capture screenshots";
      return {
        type: "result",
        data: output,
        resultForAssistant: this.renderResultForAssistant(output)
      };
    }
    const effectiveTimeout = computeEffectiveTimeout(timeout, waitTime, jsCode);
    try {
      const browser = context.session.browser;
      const client = await browser.ensureRunning();
      let tabId;
      let tabRecreated = false;
      if (!providedTabId) {
        const { targetId: chromeTargetId2 } = await client.Target.createTarget({
          url: url ?? "about:blank"
        });
        tabId = browser.allocateTabId();
        browser.openTabs.set(tabId, {
          url: url ?? "about:blank",
          createdAt: /* @__PURE__ */ new Date(),
          chromeTargetId: chromeTargetId2
        });
      } else {
        const resolved = browser.resolveTabId(providedTabId);
        if (resolved) {
          tabId = resolved;
        } else if (url) {
          const { targetId: chromeTargetId2 } = await client.Target.createTarget({ url });
          tabId = browser.allocateTabId();
          browser.openTabs.set(tabId, {
            url,
            createdAt: /* @__PURE__ */ new Date(),
            chromeTargetId: chromeTargetId2
          });
          tabRecreated = true;
        } else {
          throw new Error("Invalid tabId: Tab not found");
        }
      }
      output.tabId = tabId;
      const chromeTargetId = browser.openTabs.get(tabId).chromeTargetId;
      const runWithTabClient = async () => {
        const tabClient = await (0, import_chrome_remote_interface3.default)({
          host: "127.0.0.1",
          port: browser.chromePort,
          target: chromeTargetId
        });
        try {
          await tabClient.Page.enable();
          await tabClient.Runtime.enable();
          const consoleLogs = setupConsoleLogCollection(tabClient);
          const networkData = /* @__PURE__ */ new Map();
          let bodyPromises = [];
          if (includeNetwork) {
            await tabClient.Network.enable();
            bodyPromises = setupNetworkMonitoring(tabClient, networkData, effectiveTimeout * 1e3);
          }
          if (url || refresh && browser.openTabs.get(tabId).url) {
            const navigateUrl = url || browser.openTabs.get(tabId).url;
            await tabClient.Page.navigate({ url: navigateUrl });
            await tabClient.Page.loadEventFired();
            browser.openTabs.get(tabId).url = navigateUrl;
          }
          await new Promise((resolve8) => setTimeout(resolve8, waitTime * 1e3));
          let evalResult;
          if (jsCode) {
            const expression = wrapJsCode(jsCode);
            const evalPromise = tabClient.Runtime.evaluate({
              expression,
              returnByValue: true,
              awaitPromise: true
            });
            const timeoutPromise = new Promise((_, reject2) => setTimeout(() => reject2(new Error("Timeout")), effectiveTimeout * 1e3));
            evalResult = await Promise.race([
              evalPromise,
              timeoutPromise
            ]);
          }
          if (includeNetwork) {
            await Promise.all(bodyPromises);
          }
          let screenshotData;
          if (screenshot) {
            screenshotData = await captureScreenshot(tabClient, screenshot);
          }
          return {
            ok: true,
            consoleLogs,
            networkData,
            screenshotData,
            evalResult
          };
        } finally {
          await tabClient.close();
        }
      };
      let inner;
      try {
        inner = await runWithTabClient();
      } catch (firstErr) {
        if (!isRecoverableConnectionError(firstErr))
          throw firstErr;
        inner = await runWithTabClient();
      }
      if (inner.evalResult) {
        let resultStr;
        let isError = false;
        if (inner.evalResult.exceptionDetails?.exception?.description) {
          resultStr = inner.evalResult.exceptionDetails.exception.description;
          isError = true;
        } else if (inner.evalResult.exceptionDetails) {
          resultStr = inner.evalResult.exceptionDetails.text;
          isError = true;
        } else {
          try {
            const value = inner.evalResult.result.value;
            if (value === void 0) {
              resultStr = "undefined";
            } else {
              resultStr = JSON.stringify(value, (_key, v) => typeof v === "bigint" ? v.toString() : v, 2);
            }
          } catch (stringifyError) {
            resultStr = `Result not serializable: ${stringifyError.message}`;
          }
        }
        if (isError) {
          output.error = resultStr;
        } else if (resultStr.length <= INLINE_RESULT_THRESHOLD) {
          output.result = resultStr;
        } else {
          const tempDir = await mkdtemp3(path5.join(shortTmpdir(), "grok-js-"));
          const resultPath = path5.join(tempDir, "result.json");
          await writeFile4(resultPath, resultStr);
          output.resultFile = resultPath;
        }
      }
      if (includeNetwork) {
        output.networkSummaries = Array.from(inner.networkData.values()).map((item) => ({
          url: item.url,
          method: item.method,
          status: item.status,
          requestId: item.requestId
        }));
        browser.networkDataPerTab.set(tabId, inner.networkData);
      }
      if (inner.screenshotData) {
        output.screenshots = {
          mobile: inner.screenshotData.mobile,
          desktop: inner.screenshotData.desktop
        };
      }
      if (includeLogs)
        output.consoleLogs = inner.consoleLogs;
      if (tabRecreated)
        output.tabRecreated = true;
      return {
        type: "result",
        data: output,
        resultForAssistant: this.renderResultForAssistant(output)
      };
    } catch (outerError) {
      const isInitFailure = isInvalidTabError(outerError) || /ensureRunning|createTarget|CDP|Browser /i.test(outerError instanceof Error ? outerError.message : String(outerError));
      output.error = formatErrorMessage(outerError, isInitFailure ? "Failed to initialize browser or tab" : "Failed to interact with browser tab");
      return {
        type: "result",
        data: output,
        resultForAssistant: this.renderResultForAssistant(output)
      };
    }
  }
};