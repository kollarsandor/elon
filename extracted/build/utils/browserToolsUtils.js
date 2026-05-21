var import_chrome_remote_interface2 = __toESM(require_chrome_remote_interface(), 1);
var MOBILE_DEVICE_METRICS = {
  width: 375,
  height: 812,
  deviceScaleFactor: 2
};
var DESKTOP_SCREENSHOT_WIDTH = 1920;
var ERROR_MESSAGES = {
  INVALID_TAB_ID: "Invalid tabId: Tab not found",
  TAB_ID_REQUIRED: "tabId is required",
  NO_REQUEST_ID: "No request ID found",
  UNKNOWN_ERROR: "An unknown error occurred"
};
var DESKTOP_VIEWPORT_HEIGHT = 900;
async function captureWithEmulation(tabClient, isMobile) {
  const scale = isMobile ? MOBILE_DEVICE_METRICS.deviceScaleFactor : 1;
  const width = isMobile ? MOBILE_DEVICE_METRICS.width : DESKTOP_SCREENSHOT_WIDTH;
  const height = isMobile ? MOBILE_DEVICE_METRICS.height : DESKTOP_VIEWPORT_HEIGHT;
  await tabClient.Emulation.setDeviceMetricsOverride({
    width,
    height,
    deviceScaleFactor: scale,
    mobile: isMobile
  });
  try {
    const { result: geoResult } = await tabClient.Runtime.evaluate({
      expression: "JSON.stringify({ scrollY: Math.round(window.scrollY), pageHeight: document.body.scrollHeight })",
      returnByValue: true
    });
    const geo = JSON.parse(geoResult.value || "{}");
    const { data } = await tabClient.Page.captureScreenshot({ format: "png" });
    return {
      base64: data,
      pixelWidth: Math.ceil(width * scale),
      pixelHeight: Math.ceil(height * scale),
      scrollY: geo.scrollY ?? 0,
      pageHeight: geo.pageHeight ?? 0
    };
  } finally {
    await tabClient.Emulation.clearDeviceMetricsOverride();
  }
}
async function captureScreenshot(tabClient, screenshotType) {
  if (screenshotType === "mobile") {
    return { mobile: await captureWithEmulation(tabClient, true) };
  } else if (screenshotType === "desktop") {
    return { desktop: await captureWithEmulation(tabClient, false) };
  } else {
    const mobile = await captureWithEmulation(tabClient, true);
    const desktop = await captureWithEmulation(tabClient, false);
    return { mobile, desktop };
  }
}
function setupConsoleLogCollection(tabClient) {
  const consoleLogs = [];
  tabClient.Runtime.consoleAPICalled((event) => {
    consoleLogs.push({
      type: event.type,
      message: event.args.map((arg) => String(arg.value ?? "")).join(" ")
    });
  });
  tabClient.Runtime.exceptionThrown((event) => {
    const description = event.exceptionDetails.exception?.description || event.exceptionDetails.text || "Unknown exception";
    consoleLogs.push({
      type: "error",
      message: `Uncaught Exception: ${description}`
    });
  });
  return consoleLogs;
}
function setupNetworkMonitoring(tabClient, networkData, timeoutMs = 5e3) {
  const bodyPromises = [];
  tabClient.Network.requestWillBeSent((event) => {
    const requestId = event.requestId;
    networkData.set(requestId, {
      url: event.request.url,
      method: event.request.method,
      requestId,
      requestHeaders: event.request.headers,
      requestBody: event.request.postData
    });
  });
  tabClient.Network.requestWillBeSentExtraInfo((event) => {
    const request = networkData.get(event.requestId);
    if (request) {
      request.requestHeaders = {
        ...request.requestHeaders,
        ...event.headers
      };
    }
  });
  tabClient.Network.responseReceived((event) => {
    const request = networkData.get(event.requestId);
    if (request) {
      request.status = event.response.status;
      request.responseHeaders = event.response.headers;
    }
  });
  tabClient.Network.loadingFinished((event) => {
    const request = networkData.get(event.requestId);
    if (request) {
      const bodyPromise = Promise.race([
        tabClient.Network.getResponseBody({
          requestId: event.requestId
        }).then((response) => {
          request.responseBody = response.body;
          request.responseBodyBase64Encoded = response.base64Encoded;
        }),
        new Promise((_, reject2) => setTimeout(() => reject2(new Error("Body fetch timeout")), timeoutMs))
      ]).catch((error) => {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        request.responseBodyError = errorMessage;
      });
      bodyPromises.push(bodyPromise);
    }
  });
  return bodyPromises;
}
function formatErrorMessage(error, prefix) {
  const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
  return `${prefix}: ${errorMessage}`;
}
function truncate(str, maxLength = 100) {
  if (str.length <= maxLength)
    return str;
  return str.slice(0, maxLength - 3) + "...";
}