var BUNDLED_SKILL_NAMES_SET = new Set(Object.keys(BUNDLED_SKILLS).map((p) => p.split("/")[0]));
async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
async function seedBundledSkills(targetDir) {
  await mkdir(targetDir, { recursive: true });
  const manifestPath = join(targetDir, ".bundled");
  const seeded = /* @__PURE__ */ new Set();
  try {
    const raw = await readFile(manifestPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed)
        seeded.add(trimmed);
    }
  } catch {
  }
  const allBundledNames = /* @__PURE__ */ new Set();
  for (const relativePath of Object.keys(BUNDLED_SKILLS)) {
    allBundledNames.add(relativePath.split("/")[0]);
  }
  const notYetTracked = [...allBundledNames].filter((name) => !seeded.has(name));
  if (notYetTracked.length === 0)
    return;
  const preExisting = [];
  const toSeed = [];
  for (const name of notYetTracked) {
    if (await pathExists(join(targetDir, name))) {
      preExisting.push(name);
    } else {
      toSeed.push(name);
    }
  }
  if (preExisting.length > 0) {
    log_default.info(`Preserving ${preExisting.length} pre-existing skill(s) in ${targetDir}: ${preExisting.join(", ")}`);
  }
  if (toSeed.length > 0) {
    log_default.info(`Seeding ${toSeed.length} bundled skill(s) into ${targetDir}: ${toSeed.join(", ")}`);
    const toSeedSet = new Set(toSeed);
    for (const [relativePath, file] of Object.entries(BUNDLED_SKILLS)) {
      const skillName = relativePath.split("/")[0];
      if (!toSeedSet.has(skillName))
        continue;
      const fullPath = join(targetDir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content);
      if (file.executable) {
        await chmod(fullPath, 493);
      }
    }
  }
  const allSeeded = /* @__PURE__ */ new Set([...seeded, ...toSeed, ...preExisting]);
  await writeFile(manifestPath, [...allSeeded].sort().join("\n") + "\n");
}