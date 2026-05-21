import fs from "fs/promises";
import { basename as basename2, isAbsolute, join as join3, relative, resolve as resolve2, sep } from "path";
var MAX_FILES = 1e3;
var MAX_FILES_PER_DIR = 50;
var MAX_DIRS_PER_DIR = 20;
var TRUNCATED_MESSAGE = `There are more than ${MAX_FILES} files in the repository. Use your tools to explore nested directories. The first ${MAX_FILES} files and directories are included below:

`;
var TRUNCATED_DIR_MESSAGE = (filesSkipped, dirsSkipped) => {
  return ` (+${filesSkipped} files, +${dirsSkipped} dirs omitted in this directory - use tools to explore further)`;
};
async function ls(path12, abortController, cwd) {
  const fullFilePath = isAbsolute(path12) ? path12 : resolve2(cwd, path12);
  const { paths, truncationData } = await listDirectory(fullFilePath, cwd, abortController.signal);
  const sortedPaths = paths.sort();
  const userTree = printTree(createFileTree(sortedPaths, truncationData), cwd);
  return sortedPaths.length < MAX_FILES ? userTree : `${TRUNCATED_MESSAGE}${userTree}`;
}
async function listDirectory(initialPath, cwd, abortSignal, depth = 1) {
  const paths = [];
  const truncationData = /* @__PURE__ */ new Map();
  const queue = [initialPath];
  while (queue.length > 0) {
    if (paths.length > MAX_FILES) {
      return { paths, truncationData };
    }
    if (abortSignal.aborted) {
      return { paths, truncationData };
    }
    const path12 = queue.shift();
    if (skip(path12)) {
      continue;
    }
    let children2;
    try {
      children2 = await fs.readdir(path12, { withFileTypes: true });
    } catch (e) {
      log_default.error(e);
      continue;
    }
    let fileCount = 0;
    let dirCount = 0;
    let filesSkipped = 0;
    let dirsSkipped = 0;
    const isCurrentDirImmediate = depth === 1 && path12 === resolve2(cwd);
    const applyLimits = !isCurrentDirImmediate;
    for (const child of children2) {
      const childPath = join3(path12, child.name.toString());
      if (skip(childPath)) {
        continue;
      }
      const isChildIgnored = await isIgnored(childPath, cwd);
      if (child.isDirectory()) {
        const relDirPath = relative(cwd, childPath) + sep;
        paths.push(relDirPath);
        if (isChildIgnored) {
          truncationData.set(relative(cwd, childPath), { ignored: true });
        } else if (!applyLimits || dirCount < MAX_DIRS_PER_DIR) {
          queue.push(childPath + sep);
          if (applyLimits)
            dirCount++;
        } else {
          dirsSkipped++;
        }
      } else {
        if (isChildIgnored) {
          continue;
        }
        if (!applyLimits || fileCount < MAX_FILES_PER_DIR) {
          paths.push(relative(cwd, childPath));
          if (applyLimits)
            fileCount++;
          if (paths.length > MAX_FILES) {
            return { paths, truncationData };
          }
        } else {
          filesSkipped++;
        }
      }
    }
    if (applyLimits && (filesSkipped > 0 || dirsSkipped > 0)) {
      truncationData.set(relative(cwd, path12), { filesSkipped, dirsSkipped });
    }
    depth++;
  }
  return { paths, truncationData };
}
function createFileTree(sortedPaths, truncationData) {
  const root2 = [];
  const nodeMap = /* @__PURE__ */ new Map();
  for (const path12 of sortedPaths) {
    const parts = path12.split(sep);
    let currentLevel = root2;
    let currentPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) {
        continue;
      }
      currentPath = currentPath ? `${currentPath}${sep}${part}` : part;
      const isLastPart = i === parts.length - 1;
      const existingNode = currentLevel.find((node) => node.name === part);
      if (existingNode) {
        currentLevel = existingNode.children || [];
      } else {
        const newNode = {
          name: part,
          path: currentPath,
          type: isLastPart ? "file" : "directory"
        };
        if (!isLastPart) {
          newNode.children = [];
        }
        const truncation = truncationData.get(currentPath);
        if (truncation) {
          if (truncation.ignored) {
            newNode.truncationMessage = " (contents omitted due to .gitignore - use tools to explore further)";
          } else {
            newNode.truncationMessage = TRUNCATED_DIR_MESSAGE(truncation.filesSkipped ?? 0, truncation.dirsSkipped ?? 0);
          }
        }
        currentLevel.push(newNode);
        nodeMap.set(currentPath, newNode);
        currentLevel = newNode.children || [];
      }
    }
  }
  return root2;
}
function printTree(tree, cwd, level = 0, prefix = "") {
  let result = "";
  if (level === 0) {
    result += `- ${cwd}${sep}
`;
    prefix = "  ";
  }
  for (const node of tree) {
    result += `${prefix}${"-"} ${node.name}${node.type === "directory" ? sep : ""}${node.truncationMessage || ""}
`;
    if (node.children && node.children.length > 0) {
      result += printTree(node.children, cwd, level + 1, `${prefix}  `);
    }
  }
  return result;
}
function skip(path12) {
  if (path12 !== "." && basename2(path12).startsWith(".")) {
    return true;
  }
  if (path12.includes(`__pycache__${sep}`)) {
    return true;
  }
  return false;
}
async function isIgnored(fullPath, cwd) {
  try {
    const relPath = relative(cwd, fullPath);
    if (!relPath)
      return false;
    const { code } = await execFileNoThrow("git", ["check-ignore", "-q", relPath], cwd, void 0, void 0, false);
    return code === 0;
  } catch {
    return false;
  }
}