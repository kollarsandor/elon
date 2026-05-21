var BundledSkillFilter = class {
  inner;
  bundledNames;
  allowedBundled;
  constructor(inner, bundledNames, allowedBundled) {
    this.inner = inner;
    this.bundledNames = bundledNames;
    this.allowedBundled = allowedBundled;
  }
  invalidateCache() {
    if ("invalidateCache" in this.inner && typeof this.inner.invalidateCache === "function") {
      this.inner.invalidateCache();
    }
  }
  async list() {
    const all = await this.inner.list();
    return all.filter((s) => {
      if (!this.bundledNames.has(s.name))
        return true;
      return this.allowedBundled.has(s.name);
    });
  }
};
var SkillManager = class {
  providers;
  constructor(providers) {
    this.providers = providers;
  }
  /**
   * Invalidate caches on all providers that support it,
   * so the next list() call rescans the filesystem.
   */
  invalidateCache() {
    for (const provider of this.providers) {
      if ("invalidateCache" in provider && typeof provider.invalidateCache === "function") {
        provider.invalidateCache();
      }
    }
  }
  async list() {
    const seen = /* @__PURE__ */ new Set();
    const results = [];
    for (const provider of this.providers) {
      const skills = await provider.list();
      for (const skill of skills) {
        if (!seen.has(skill.name)) {
          seen.add(skill.name);
          results.push(skill);
        }
      }
    }
    return results;
  }
};