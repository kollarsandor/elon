var import_jimp = __toESM(require_dist33(), 1);
import { access as access4, readFile as readFile6, stat as stat5 } from "fs/promises";
import path8 from "path";
function getDescription(context) {
  let str = "Read the contents of a file from the local filesystem.";
  if (context?.session.hasVision)
    str += " Supports viewing images.";
  return str;
}
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".bmp",
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff",
  ".webp"
]);
var MAX_OUTPUT_SIZE = 0.25 * 1024 * 1024;
var MAX_LINES_TO_READ = 2e3;
var MAX_WIDTH = 2e3;
var MAX_HEIGHT = 2e3;
var MAX_IMAGE_SIZE = 5 * 1024 * 1024;
var inputSchema3 = external_exports.strictObject({
  file_path: external_exports.string().describe("The file path to read"),
  offset: external_exports.number().int().nonnegative().optional().default(1).describe("The line number to start reading from"),
  limit: external_exports.number().int().positive().optional().default(MAX_LINES_TO_READ).describe("The number of lines to read")
});
var FileReadTool = {
  name: "read_file",
  description: getDescription,
  inputSchema: () => inputSchema3,
  isReadOnly: () => true,
  isEnabled: () => true,
  validateInput: async ({ file_path }, context) => {
    const fullFilePath = await normalizeFilePath(file_path, await context.session.shell.pwd());
    let exists;
    try {
      await access4(fullFilePath);
      exists = true;
    } catch {
      exists = false;
    }
    if (!exists) {
      const similarFilename = await findSimilarFile(fullFilePath);
      let message = "File does not exist.";
      if (similarFilename) {
        message += ` Did you mean ${similarFilename}?`;
      }
      return { result: false, message };
    }
    const ext2 = path8.extname(fullFilePath).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext2) && !context.session.hasVision) {
      return {
        result: false,
        message: "Error: Cannot read images"
      };
    }
    return { result: true };
  },
  async call(input, context) {
    const { file_path, offset = 1, limit = MAX_LINES_TO_READ } = input;
    const { readFileTimestamps } = context;
    const ext2 = path8.extname(file_path).toLowerCase();
    const fullFilePath = await normalizeFilePath(file_path, await context.session.shell.pwd());
    if (IMAGE_EXTENSIONS.has(ext2) && !context.session.hasVision) {
      const data2 = {
        type: "error",
        text: "Error: Cannot read images"
      };
      return {
        type: "result",
        data: data2,
        resultForAssistant: this.renderResultForAssistant(data2)
      };
    }
    const stats = await stat5(fullFilePath);
    readFileTimestamps.set(fullFilePath, stats.mtimeMs);
    let data;
    if (IMAGE_EXTENSIONS.has(ext2)) {
      try {
        data = await readImage(fullFilePath);
      } catch (e) {
        data = {
          type: "error",
          text: `Error: Failed to process image file "${file_path}" - it may be invalid or corrupted: ${e.message}`
        };
      }
      return {
        type: "result",
        data,
        resultForAssistant: this.renderResultForAssistant(data)
      };
    }
    const lineOffset = offset === 0 ? 0 : offset - 1;
    const { content, lineCount, totalLines } = await readTextContent(fullFilePath, lineOffset, limit);
    const contentSize = Buffer.byteLength(content, "utf8");
    if (contentSize > MAX_OUTPUT_SIZE) {
      data = {
        type: "error",
        text: formatFileSizeError(contentSize)
      };
    } else {
      data = {
        type: "text",
        file: {
          filePath: file_path,
          content,
          numLines: lineCount,
          startLine: offset,
          totalLines
        }
      };
    }
    return {
      type: "result",
      data,
      resultForAssistant: this.renderResultForAssistant(data)
    };
  },
  renderResultForAssistant(data) {
    if (data.type === "error")
      return [{ type: "text", text: data.text }];
    if (data.type === "image") {
      return [
        {
          type: "image",
          data: data.file.base64,
          mimeType: data.file.type
        }
      ];
    }
    return [
      {
        type: "text",
        text: addLineNumbers(data.file)
      }
    ];
  }
};
var formatFileSizeError = (sizeInBytes) => `File content (${Math.round(sizeInBytes / 1024)}KB) exceeds maximum allowed size (${Math.round(MAX_OUTPUT_SIZE / 1024)}KB). Please use offset and limit parameters to read specific portions of the file.`;
async function readImage(filePath) {
  const originalBuffer = await readFile6(filePath);
  let image2 = await import_jimp.default.read(originalBuffer);
  let width = image2.getWidth();
  let height = image2.getHeight();
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid image: missing dimensions");
  }
  let currentFormat = image2.getMIME().split("/")[1];
  if (!currentFormat) {
    throw new Error("Invalid image: missing format");
  }
  let currentBuffer = await image2.getBufferAsync(image2.getMIME());
  let size = currentBuffer.length;
  const needsProcessing = width > MAX_WIDTH || height > MAX_HEIGHT || size > MAX_IMAGE_SIZE;
  if (needsProcessing) {
    if (width > MAX_WIDTH) {
      height = Math.floor(height * MAX_WIDTH / width);
      width = MAX_WIDTH;
    }
    if (height > MAX_HEIGHT) {
      width = Math.floor(width * MAX_HEIGHT / height);
      height = MAX_HEIGHT;
    }
    try {
      image2 = image2.resize(width, height, import_jimp.default.RESIZE_BICUBIC);
      currentBuffer = await image2.getBufferAsync(image2.getMIME());
      size = currentBuffer.length;
      currentFormat = image2.getMIME().split("/")[1];
    } catch (e) {
      throw new Error(`Failed to resize image: ${e.message}`);
    }
    if (size > MAX_IMAGE_SIZE) {
      try {
        image2 = image2.quality(80);
        currentBuffer = await image2.getBufferAsync(import_jimp.default.MIME_JPEG);
        currentFormat = "jpeg";
      } catch (e) {
        throw new Error(`Failed to compress image: ${e.message}`);
      }
    }
  }
  const base64 = await image2.getBase64Async(image2.getMIME());
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  return {
    type: "image",
    file: {
      filePath,
      base64: base64Data,
      type: `image/${currentFormat}`
    }
  };
}