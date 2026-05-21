import { access as access5, mkdir as mkdir5, readFile as readFile7, stat as stat6, realpath as realpath3 } from "fs/promises";
import { dirname as dirname7 } from "path";
var inputSchema4 = external_exports.strictObject({
  file_path: external_exports.string().describe("The path to the file to write"),
  content: external_exports.string().describe("The content to write to the file")
});
var FileWriteTool = {
  name: "write_file",
  description: () => "Write a file to the local filesystem. Overwrites the existing file if there is one. If a file exists at the file_path then you must first use the read_file tool before using the write_file tool.",
  inputSchema: () => inputSchema4,
  isEnabled: () => true,
  isReadOnly: () => false,
  validateInput: async ({ file_path }, context) => {
    const fullFilePath = await normalizeFilePath(file_path, await context.session.shell.pwd());
    const fileExists = await access5(fullFilePath).then(() => true).catch(() => false);
    if (!fileExists)
      return { result: true };
    const readTimestamp = context.readFileTimestamps.get(fullFilePath);
    if (!readTimestamp) {
      return {
        result: false,
        message: "File has not been read yet. The file might have been recently created by a teammate or external process. Read it first before overwriting it."
      };
    }
    try {
      const stats = await stat6(fullFilePath);
      const lastWriteTime = stats.mtimeMs;
      if (lastWriteTime > readTimestamp) {
        return {
          result: false,
          message: "File has been modified since last read, either by a teammate or external process. Read it again before overwriting it."
        };
      }
    } catch (error) {
      log_default.error(error);
      return {
        result: false,
        message: `Failed to stat file: ${error.message}`
      };
    }
    return { result: true };
  },
  async call(input, context) {
    const { file_path } = input;
    let content = input.content;
    const { readFileTimestamps } = context;
    if (context.session.unescapeInput) {
      content = fixEscapedString(content);
    }
    const fullFilePath = await normalizeFilePath(file_path, await context.session.shell.pwd());
    const release = await acquireLock(fullFilePath);
    try {
      const fileExists = await access5(fullFilePath).then(() => true).catch(() => false);
      const readTimestamp = readFileTimestamps.get(fullFilePath);
      if (fileExists) {
        if (!readTimestamp) {
          const data2 = {
            type: "error",
            filePath: file_path,
            content: "File has not been read yet. The file might have been recently created by a teammate or external process. Read it first before overwriting it.",
            structuredPatch: []
          };
          return {
            type: "result",
            data: data2,
            resultForAssistant: this.renderResultForAssistant(data2)
          };
        }
        const stats = await stat6(fullFilePath);
        const lastWriteTime = stats.mtimeMs;
        if (lastWriteTime > readTimestamp) {
          const data2 = {
            type: "error",
            filePath: file_path,
            content: "File has been modified since last read, either by a teammate or external process. Read it again before overwriting it.",
            structuredPatch: []
          };
          return {
            type: "result",
            data: data2,
            resultForAssistant: this.renderResultForAssistant(data2)
          };
        }
      }
      const dir = dirname7(fullFilePath);
      const enc = fileExists ? await detectFileEncoding(fullFilePath) : "utf-8";
      const oldContent = fileExists ? await readFile7(fullFilePath, enc) : null;
      const endings = fileExists ? await detectLineEndings(fullFilePath) : await detectRepoLineEndings(await context.session.shell.pwd());
      await mkdir5(dir, { recursive: true });
      await writeTextContent(fullFilePath, content, enc, endings);
      const realFullPath = await realpath3(fullFilePath);
      const newStats = await stat6(realFullPath);
      readFileTimestamps.set(realFullPath, newStats.mtimeMs);
      if (oldContent) {
        const patch = getPatch({
          filePath: file_path,
          fileContents: oldContent,
          oldStr: oldContent,
          newStr: content
        });
        const data2 = {
          type: "update",
          filePath: file_path,
          content,
          structuredPatch: patch
        };
        return {
          type: "result",
          data: data2,
          resultForAssistant: this.renderResultForAssistant(data2)
        };
      }
      const data = {
        type: "create",
        filePath: file_path,
        content,
        structuredPatch: []
      };
      return {
        type: "result",
        data,
        resultForAssistant: this.renderResultForAssistant(data)
      };
    } catch (error) {
      log_default.error(error, { filePath: fullFilePath });
      const data = {
        type: "error",
        filePath: file_path,
        content: error.message,
        structuredPatch: []
      };
      return {
        type: "result",
        data,
        resultForAssistant: this.renderResultForAssistant(data)
      };
    } finally {
      release();
    }
  },
  renderResultForAssistant({ filePath, content, type }) {
    if (type === "error") {
      return [
        {
          type: "text",
          text: `Failed to write file: ${content}`
        }
      ];
    }
    if (type === "create") {
      return [
        {
          type: "text",
          text: `File created successfully at: ${filePath}`
        }
      ];
    }
    return [
      {
        type: "text",
        text: `File written successfully to: ${filePath}`
      }
    ];
  }
};