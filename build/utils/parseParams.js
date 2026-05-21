function needsCoercion(field, raw) {
  if (!field || field instanceof external_exports.ZodString)
    return false;
  if (typeof raw !== "string")
    return false;
  return true;
}
function parseParam(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function parseParams(rawParams, schema2) {
  if (!(schema2 instanceof external_exports.ZodObject))
    return { ...rawParams };
  const typed = {};
  const objSchema = schema2;
  for (const [name, raw] of Object.entries(rawParams)) {
    const field = objSchema.shape[name];
    if (!needsCoercion(field, raw)) {
      typed[name] = raw;
      continue;
    }
    typed[name] = parseParam(raw);
  }
  return typed;
}