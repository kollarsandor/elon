import fs2 from "fs/promises";
import { join as join4, parse, dirname as dirname3 } from "path";
async function getGrokMemory(session) {
  const styles = [];
  let currentDir = session.originalWorkingDir;
  while (currentDir !== parse(currentDir).root) {
    const fileNames = ["GROK.md", "AGENTS.md"];
    for (const fileName of fileNames) {
      const stylePath = join4(currentDir, fileName);
      try {
        await fs2.access(stylePath);
        const content = await fs2.readFile(stylePath, "utf-8");
        styles.push(`Contents of ${stylePath}:

${content}`);
      } catch {
      }
    }
    currentDir = dirname3(currentDir);
  }
  if (styles.length === 0)
    return "";
  return `${styles.reverse().join("\n\n")}`;
}