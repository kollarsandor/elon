import { execFile as execFile2 } from "node:child_process";
import fs7 from "node:fs/promises";
import path9 from "node:path";
import { promisify as promisify2 } from "node:util";
var exec2 = promisify2(execFile2);
var CLONE_TIMEOUT_MS = 10 * 6e4;
var PY_CLONEFILE = `
import ctypes, os, sys
libc = ctypes.CDLL('/usr/lib/libSystem.dylib', use_errno=True)
clonefile = libc.clonefile
clonefile.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
clonefile.restype = ctypes.c_int
CLONE_NOFOLLOW = 1
args = sys.argv[1:]
if len(args) == 0 or len(args) % 2 != 0:
    sys.stderr.write(f'expected an even number of args (src dst pairs), got {len(args)}\\n')
    sys.exit(2)
for i in range(0, len(args), 2):
    src, dst = args[i], args[i + 1]
    rc = clonefile(src.encode(), dst.encode(), CLONE_NOFOLLOW)
    if rc != 0:
        err = ctypes.get_errno()
        sys.stderr.write(f'clonefile({src!r} -> {dst!r}) rc={rc} errno={err} {os.strerror(err)}\\n')
        sys.exit(1)
`.trim();
var CACHEDIR_TAG_NAME = "CACHEDIR.TAG";
var CACHEDIR_TAG_SIGNATURE = "Signature: 8a477f597d28d172789f06886806bc55";
var cachedFastClone = null;
async function canUseClonefile(probeDir) {
  if (cachedFastClone !== null)
    return cachedFastClone;
  if (process.platform !== "darwin") {
    cachedFastClone = false;
    return false;
  }
  try {
    await exec2("python3", ["-c", 'import ctypes; ctypes.CDLL("/usr/lib/libSystem.dylib")'], {
      timeout: 5e3
    });
  } catch {
    cachedFastClone = false;
    return false;
  }
  cachedFastClone = probeDir.length > 0;
  return cachedFastClone;
}
async function sameVolume(a, b) {
  async function devOf(p) {
    let cur = path9.resolve(p);
    for (; ; ) {
      try {
        return (await fs7.stat(cur)).dev;
      } catch {
        const parent = path9.dirname(cur);
        if (parent === cur)
          return null;
        cur = parent;
      }
    }
  }
  const [da, db] = await Promise.all([devOf(a), devOf(b)]);
  return da !== null && db !== null && da === db;
}
async function isCacheDir(absDir) {
  const tagPath = path9.join(absDir, CACHEDIR_TAG_NAME);
  let stat7;
  try {
    stat7 = await fs7.stat(tagPath);
  } catch {
    return false;
  }
  if (!stat7.isFile())
    return false;
  let handle = null;
  try {
    handle = await fs7.open(tagPath, "r");
    const buf = Buffer.alloc(CACHEDIR_TAG_SIGNATURE.length);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    if (bytesRead < CACHEDIR_TAG_SIGNATURE.length)
      return false;
    return buf.toString("utf8") === CACHEDIR_TAG_SIGNATURE;
  } catch {
    return false;
  } finally {
    if (handle) {
      await handle.close().catch(() => {
      });
    }
  }
}
var NEVER_RECURSE_NAMES = /* @__PURE__ */ new Set([
  "node_modules",
  ".git"
]);
var CACHE_DIR_SCAN_MAX_DEPTH = 6;
var SCAN_CHUNK_SIZE = 32;
async function findCacheDirs(donor) {
  const found = [];
  async function walk(dir, depth) {
    if (depth > CACHE_DIR_SCAN_MAX_DEPTH)
      return;
    let entries;
    try {
      entries = await fs7.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const candidates = entries.filter((e) => e.isDirectory() && !e.isSymbolicLink() && !NEVER_RECURSE_NAMES.has(e.name));
    for (let i = 0; i < candidates.length; i += SCAN_CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + SCAN_CHUNK_SIZE);
      await Promise.all(chunk.map(async (e) => {
        const sub = path9.join(dir, e.name);
        if (await isCacheDir(sub)) {
          found.push(sub);
          return;
        }
        await walk(sub, depth + 1);
      }));
    }
  }
  await walk(donor, 0);
  found.sort();
  return found;
}
function planTopLevel(donor, topEntries, cacheDirs) {
  const cacheSet = new Set(cacheDirs);
  const cloneAll = [];
  const recurseInto = [];
  for (const e of topEntries) {
    const abs = path9.join(donor, e.name);
    if (cacheSet.has(abs))
      continue;
    if (!e.isDirectory() || e.isSymbolicLink()) {
      cloneAll.push(e);
      continue;
    }
    const prefix = abs + path9.sep;
    const hasNested = cacheDirs.some((c) => c.startsWith(prefix));
    if (hasNested)
      recurseInto.push(e);
    else
      cloneAll.push(e);
  }
  return { cloneAll, recurseInto };
}
async function copyTreeSkipping(src, dst, blocklist, cacheDirs, cloneOne) {
  if (blocklist.has(src))
    return;
  const prefix = src + path9.sep;
  const hasNestedBlock = cacheDirs.some((c) => c.startsWith(prefix));
  if (!hasNestedBlock) {
    await cloneOne(src, dst);
    return;
  }
  await fs7.mkdir(dst, { recursive: true });
  let entries;
  try {
    entries = await fs7.readdir(src, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async (e) => {
    const sp = path9.join(src, e.name);
    const dp = path9.join(dst, e.name);
    if (!e.isDirectory() || e.isSymbolicLink()) {
      await cloneOne(sp, dp);
      return;
    }
    await copyTreeSkipping(sp, dp, blocklist, cacheDirs, cloneOne);
  }));
}
async function clonefilePair(src, dst) {
  await exec2("python3", ["-c", PY_CLONEFILE, src, dst], {
    timeout: CLONE_TIMEOUT_MS
  });
}
async function cloneDonorEntries(donor, dst) {
  const t0 = performance.now();
  const cacheDirs = await findCacheDirs(donor);
  const cacheSet = new Set(cacheDirs);
  const topEntries = (await fs7.readdir(donor, { withFileTypes: true })).filter((e) => e.name !== ".git");
  const { cloneAll, recurseInto } = planTopLevel(donor, topEntries, cacheDirs);
  const skippedCacheDirs = [...cacheDirs];
  if (cloneAll.length === 0 && recurseInto.length === 0) {
    return {
      method: "fs-cp",
      entries: 0,
      durationMs: performance.now() - t0,
      skippedCacheDirs
    };
  }
  let useClonefile = await canUseClonefile(donor) && await sameVolume(donor, dst);
  if (cloneAll.length > 0) {
    if (useClonefile) {
      const pairs = [];
      for (const e of cloneAll) {
        pairs.push(path9.join(donor, e.name), path9.join(dst, e.name));
      }
      try {
        await exec2("python3", ["-c", PY_CLONEFILE, ...pairs], {
          timeout: CLONE_TIMEOUT_MS
        });
      } catch {
        useClonefile = false;
        await Promise.all(cloneAll.map((e) => fs7.cp(path9.join(donor, e.name), path9.join(dst, e.name), {
          recursive: true
        })));
      }
    } else {
      await Promise.all(cloneAll.map((e) => fs7.cp(path9.join(donor, e.name), path9.join(dst, e.name), {
        recursive: true
      })));
    }
  }
  if (recurseInto.length > 0) {
    const cloneOne = useClonefile ? clonefilePair : (s, d3) => fs7.cp(s, d3, { recursive: true });
    await Promise.all(recurseInto.map((e) => copyTreeSkipping(path9.join(donor, e.name), path9.join(dst, e.name), cacheSet, cacheDirs, cloneOne)));
  }
  return {
    method: useClonefile ? "clonefile" : "fs-cp",
    entries: cloneAll.length + recurseInto.length,
    durationMs: performance.now() - t0,
    skippedCacheDirs
  };
}