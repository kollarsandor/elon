import { readdir as readdir3, readFile as readFile4, stat as stat3 } from "fs/promises";
import { join as join8 } from "path";
var FilesystemSkillProvider = class {
  dir;
  cache = null;
  constructor(dir) {
    this.dir = dir;
  }
  /** Clear the cache so the next list() rescans the directory. */
  invalidateCache() {
    this.cache = null;
  }
  /** The directory this provider scans. */
  getDir() {
    return this.dir;
  }
  async list() {
    if (this.cache)
      return this.cache;
    const results = [];
    let entries;
    try {
      entries = await readdir3(this.dir, { withFileTypes: true });
    } catch {
      this.cache = results;
      return results;
    }
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue;
      const skillDir = join8(this.dir, entry.name);
      const skillFile = join8(skillDir, "SKILL.md");
      try {
        const stats = await stat3(skillFile);
        if (!stats.isFile())
          continue;
      } catch {
        continue;
      }
      try {
        const raw = await readFile4(skillFile, "utf-8");
        const { attributes } = parseSkillFile(raw);
        const name = attributes.name || entry.name;
        const description = attributes.description;
        if (!description) {
          log_default.warn(`Skill at ${skillDir} missing description in frontmatter, skipping`);
          continue;
        }
        results.push({ name, description, path: skillDir });
      } catch (err2) {
        log_default.warn(`Failed to parse skill at ${skillDir}: ${err2}`);
      }
    }
    this.cache = results;
    return results;
  }
};