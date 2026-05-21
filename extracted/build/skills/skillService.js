function getGlobalSkillsDir() {
  return join2(homedir(), ".grok", "skills");
}
function getProjectSkillsDir(workingDir) {
  return join2(workingDir, ".grok", "skills");
}
function resolveSkillsDir(scope, workingDir) {
  if (scope === "project") {
    if (!workingDir) {
      throw new Error("workingDir is required for project-scoped skill operations");
    }
    return getProjectSkillsDir(workingDir);
  }
  return getGlobalSkillsDir();
}
async function scanSkillsDir(dir, scope) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    if (entry.name.startsWith("."))
      continue;
    const skillDir = join2(dir, entry.name);
    const skillFile = join2(skillDir, "SKILL.md");
    try {
      const stats = await stat2(skillFile);
      if (!stats.isFile())
        continue;
    } catch {
      continue;
    }
    try {
      const raw = await readFile2(skillFile, "utf-8");
      const { attributes } = parseSkillFile(raw);
      const name = attributes.name || entry.name;
      const description = attributes.description || "";
      results.push({ name, description, path: skillDir, scope });
    } catch (err2) {
      log_default.warn(`Failed to parse installed skill at ${skillDir}: ${err2}`);
    }
  }
  return results;
}
async function listInstalledSkills(workingDir) {
  const globalSkills = await scanSkillsDir(getGlobalSkillsDir(), "global");
  if (!workingDir) {
    return globalSkills;
  }
  const projectSkills = await scanSkillsDir(getProjectSkillsDir(workingDir), "project");
  return [...projectSkills, ...globalSkills];
}
async function fetchRemoteSkillDescription(repo, path12, skillName, ref) {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${ref}/${path12}/${skillName}/SKILL.md`;
    const res = await fetch(rawUrl, {
      headers: { "User-Agent": "grok-computer-skill-service" }
    });
    if (!res.ok)
      return "";
    const text = await res.text();
    const { attributes } = parseSkillFile(text);
    return attributes.description || "";
  } catch {
    return "";
  }
}
async function listRemoteSkills(repo, path12, ref, workingDir) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const headers = {
    "User-Agent": "grok-computer-skill-service"
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path12}?ref=${ref}`;
  const res = await fetch(apiUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch skills from GitHub: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response format from GitHub API");
  }
  const dirs = data.filter((item) => item.type === "dir");
  const installedSkills = await listInstalledSkills(workingDir);
  const globalNames = new Set(installedSkills.filter((s) => s.scope === "global").map((s) => s.name));
  const projectNames = new Set(installedSkills.filter((s) => s.scope === "project").map((s) => s.name));
  const descriptions = await Promise.all(dirs.map((item) => fetchRemoteSkillDescription(repo, path12, item.name, ref)));
  return dirs.map((item, i) => ({
    name: item.name,
    description: descriptions[i],
    installedGlobal: globalNames.has(item.name),
    installedProject: projectNames.has(item.name)
  }));
}
function parseGitHubUrl(url) {
  const stripped = url.replace(/^https:\/\/github\.com\//, "");
  const parts = stripped.split("/");
  if (parts.length < 2) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }
  const repo = `${parts[0]}/${parts[1]}`;
  let ref = "main";
  let path12 = "";
  if (parts.length >= 5 && parts[2] === "tree") {
    ref = parts[3];
    path12 = parts.slice(4).join("/");
  } else if (parts.length >= 3) {
    path12 = parts.slice(2).join("/");
  }
  return { repo, ref, path: path12 };
}
async function downloadAndExtractSkill(repo, ref, skillPath, destDir) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const zipUrl = `https://codeload.github.com/${repo}/zip/${ref}`;
  const headers = {
    "User-Agent": "grok-computer-skill-installer"
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }
  log_default.info(`Downloading ${repo}@${ref}...`);
  const res = await fetch(zipUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to download ${repo}@${ref}: ${res.status} ${res.statusText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const entries = unzipSync(new Uint8Array(arrayBuf));
  const topLevelDirs = /* @__PURE__ */ new Set();
  for (const entryName of Object.keys(entries)) {
    const first = entryName.split("/")[0];
    if (first)
      topLevelDirs.add(first);
  }
  const roots = [...topLevelDirs].filter((d3) => d3 !== "__MACOSX");
  if (roots.length === 0) {
    throw new Error("Empty zip archive");
  }
  const archiveRoot = roots[0];
  const prefix = `${archiveRoot}/${skillPath}/`;
  const skillMdKey = `${prefix}SKILL.md`;
  if (!(skillMdKey in entries)) {
    const hasDir = Object.keys(entries).some((k) => k.startsWith(prefix));
    if (!hasDir) {
      throw new Error(`Skill path not found in archive: ${skillPath}`);
    }
    throw new Error(`No SKILL.md found in ${skillPath}`);
  }
  await mkdir2(destDir, { recursive: true });
  for (const [entryName, data] of Object.entries(entries)) {
    if (!entryName.startsWith(prefix))
      continue;
    const relativePath = entryName.slice(prefix.length);
    if (!relativePath)
      continue;
    const fullPath = join2(destDir, ...relativePath.split("/"));
    if (entryName.endsWith("/")) {
      await mkdir2(fullPath, { recursive: true });
    } else {
      await mkdir2(dirname2(fullPath), { recursive: true });
      await writeFile2(fullPath, data);
    }
  }
}
async function installSkill(options) {
  const scope = options.scope || "global";
  const dest = resolveSkillsDir(scope, options.workingDir);
  let repo = options.repo || "";
  let skillPath = options.path || "";
  let ref = options.ref || "main";
  if (options.url) {
    const parsed = parseGitHubUrl(options.url);
    repo = parsed.repo;
    ref = parsed.ref;
    skillPath = parsed.path;
  }
  if (!repo)
    throw new Error("Missing repo or url");
  if (!skillPath)
    throw new Error("Missing skill path");
  const name = options.name || basename(skillPath);
  if (!name)
    throw new Error("Could not determine skill name");
  const destDir = join2(dest, name);
  try {
    const s = await stat2(destDir);
    if (s.isDirectory()) {
      throw new Error(`Destination already exists: ${destDir}`);
    }
  } catch (err2) {
    if (!(err2 instanceof Error && "code" in err2 && err2.code === "ENOENT")) {
      throw err2;
    }
  }
  log_default.info({ repo, skillPath, ref, name, scope }, "Installing skill");
  try {
    await downloadAndExtractSkill(repo, ref, skillPath, destDir);
  } catch (err2) {
    await rm(destDir, { recursive: true, force: true }).catch(() => {
    });
    const message = err2 instanceof Error ? err2.message : String(err2);
    log_default.error(`Skill install failed: ${message}`);
    throw new Error(`Failed to install skill: ${message}`);
  }
  log_default.info(`Installed skill (${scope}): ${name} to ${destDir}`);
  return { success: true, name, path: destDir, scope };
}
async function uninstallSkill(name, scope = "global", workingDir) {
  const dir = resolveSkillsDir(scope, workingDir);
  const skillDir = join2(dir, name);
  if (!skillDir.startsWith(dir)) {
    throw new Error("Invalid skill name");
  }
  try {
    const stats = await stat2(skillDir);
    if (!stats.isDirectory()) {
      throw new Error(`${name} is not a skill directory`);
    }
  } catch (err2) {
    if (err2 instanceof Error && "code" in err2 && err2.code === "ENOENT") {
      throw new Error(`Skill "${name}" is not installed`);
    }
    throw err2;
  }
  await rm(skillDir, { recursive: true, force: true });
  log_default.info(`Uninstalled skill (${scope}): ${name}`);
}