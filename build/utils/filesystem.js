import fs6 from "fs/promises";
import { homedir as homedir5 } from "os";
import { basename as basename6, dirname as dirname8, isAbsolute as isAbsolute5, join as join11, parse as parse3, resolve as resolve7, sep as sep4 } from "path";
function expandPath(inputPath) {
  if (inputPath === "~" || inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return join11(homedir5(), inputPath.slice(1));
  }
  return inputPath;
}
function getHomeDirectory() {
  return homedir5();
}
function isHiddenFile(name) {
  return name.startsWith(".");
}
function isRootPath(filePath) {
  const parsed = parse3(filePath);
  return parsed.root === filePath || parsed.dir === "" && parsed.base === "";
}
async function checkPathExists(inputPath) {
  const expandedPath = expandPath(inputPath);
  const absolutePath = isAbsolute5(expandedPath) ? expandedPath : resolve7(expandedPath);
  try {
    const lstat2 = await fs6.lstat(absolutePath);
    const isSymlink = lstat2.isSymbolicLink();
    let realPath;
    let stat7 = lstat2;
    if (isSymlink) {
      try {
        realPath = await fs6.realpath(absolutePath);
        stat7 = await fs6.stat(absolutePath);
      } catch {
        return {
          exists: true,
          isDirectory: false,
          isFile: false,
          isSymlink: true,
          realPath: void 0
        };
      }
    }
    return {
      exists: true,
      isDirectory: stat7.isDirectory(),
      isFile: stat7.isFile(),
      isSymlink,
      realPath
    };
  } catch {
    return {
      exists: false,
      isDirectory: false,
      isFile: false,
      isSymlink: false
    };
  }
}
async function listDirectory2(inputPath) {
  const expandedPath = expandPath(inputPath);
  const absolutePath = isAbsolute5(expandedPath) ? expandedPath : resolve7(expandedPath);
  let realPath;
  try {
    realPath = await fs6.realpath(absolutePath);
  } catch {
    throw new Error(`Path does not exist: ${inputPath}`);
  }
  const stat7 = await fs6.stat(realPath);
  if (!stat7.isDirectory()) {
    throw new Error(`Path is not a directory: ${inputPath}`);
  }
  const entries = [];
  try {
    const dirents = await fs6.readdir(realPath, { withFileTypes: true });
    for (const dirent of dirents) {
      const name = dirent.name.toString();
      const entryPath = join11(realPath, name);
      const isHidden = isHiddenFile(name);
      let type = "other";
      let size;
      let modifiedAt;
      try {
        if (dirent.isSymbolicLink()) {
          type = "symlink";
          try {
            const targetStat = await fs6.stat(entryPath);
            size = targetStat.size;
            modifiedAt = targetStat.mtime.toISOString();
            if (targetStat.isDirectory()) {
              type = "directory";
            }
          } catch {
          }
        } else if (dirent.isDirectory()) {
          type = "directory";
          const dirStat = await fs6.stat(entryPath);
          modifiedAt = dirStat.mtime.toISOString();
        } else if (dirent.isFile()) {
          type = "file";
          const fileStat = await fs6.stat(entryPath);
          size = fileStat.size;
          modifiedAt = fileStat.mtime.toISOString();
        }
      } catch (e) {
        log_default.error(`Error getting stats for ${entryPath}:`, e);
      }
      entries.push({
        name,
        path: entryPath,
        type,
        size,
        modifiedAt,
        isHidden
      });
    }
  } catch (e) {
    log_default.error(`Error reading directory ${realPath}:`, e);
    throw new Error(`Cannot read directory: ${inputPath}`);
  }
  entries.sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory")
      return -1;
    if (a.type !== "directory" && b.type === "directory")
      return 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  const parent = isRootPath(realPath) ? null : dirname8(realPath);
  return {
    path: realPath,
    entries,
    parent
  };
}
async function completePath(prefix) {
  const expandedPrefix = expandPath(prefix);
  const absolutePrefix = isAbsolute5(expandedPrefix) ? expandedPrefix : resolve7(expandedPrefix);
  try {
    const stat7 = await fs6.stat(absolutePrefix);
    if (stat7.isDirectory()) {
      const dirents = await fs6.readdir(absolutePrefix, { withFileTypes: true });
      const completions = dirents.map((d3) => {
        const name = d3.name.toString();
        const fullPath = join11(absolutePrefix, name);
        return d3.isDirectory() ? fullPath + sep4 : fullPath;
      });
      return {
        completions: completions.sort(),
        isExactMatch: true,
        basePath: absolutePrefix.endsWith(sep4) ? absolutePrefix : absolutePrefix + sep4
      };
    }
  } catch {
  }
  const dir = dirname8(absolutePrefix);
  const partial = basename6(absolutePrefix).toLowerCase();
  try {
    const dirents = await fs6.readdir(dir, { withFileTypes: true });
    const completions = dirents.filter((d3) => d3.name.toString().toLowerCase().startsWith(partial)).map((d3) => {
      const name = d3.name.toString();
      const fullPath = join11(dir, name);
      return d3.isDirectory() ? fullPath + sep4 : fullPath;
    }).sort();
    const isExactMatch = completions.length === 1 && basename6(completions[0].replace(/[/\\]$/, "")).toLowerCase() === partial;
    return {
      completions,
      isExactMatch,
      basePath: dir.endsWith(sep4) ? dir : dir + sep4
    };
  } catch {
    return {
      completions: [],
      isExactMatch: false,
      basePath: dir
    };
  }
}
function getCommonDirectories() {
  const home = homedir5();
  const commonDirs = [
    home,
    join11(home, "Desktop"),
    join11(home, "Documents"),
    join11(home, "Downloads"),
    join11(home, "Projects"),
    join11(home, "Developer"),
    join11(home, "Code"),
    join11(home, "repos"),
    join11(home, "src"),
    join11(home, "work")
  ];
  return commonDirs;
}
async function getExistingCommonDirectories() {
  const commonDirs = getCommonDirectories();
  const existing = [];
  for (const dir of commonDirs) {
    try {
      const stat7 = await fs6.stat(dir);
      if (stat7.isDirectory()) {
        existing.push(dir);
      }
    } catch {
    }
  }
  return existing;
}