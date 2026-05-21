function parseSkillFile(raw) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match2 = normalized.match(/^---\s*\n([\s\S]*?\n)?---\s*\n?([\s\S]*)$/);
  if (!match2) {
    return { attributes: {}, body: normalized.trim() };
  }
  const [, frontmatterBlock = "", body] = match2;
  const attributes = {};
  for (const line of frontmatterBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1)
      continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) {
      attributes[key] = value;
    }
  }
  return { attributes, body: body.trim() };
}