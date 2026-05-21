var CONTEXT_LINES = 3;
var AMPERSAND_TOKEN = "<<:AMPERSAND_TOKEN:>>";
var DOLLAR_TOKEN = "<<:DOLLAR_TOKEN:>>";
function getPatch({ filePath, fileContents, oldStr, newStr }) {
  return structuredPatch(filePath, filePath, fileContents.replaceAll("&", AMPERSAND_TOKEN).replaceAll("$", DOLLAR_TOKEN), fileContents.replaceAll("&", AMPERSAND_TOKEN).replaceAll("$", DOLLAR_TOKEN).replace(oldStr.replaceAll("&", AMPERSAND_TOKEN).replaceAll("$", DOLLAR_TOKEN), newStr.replaceAll("&", AMPERSAND_TOKEN).replaceAll("$", DOLLAR_TOKEN)), void 0, void 0, { context: CONTEXT_LINES }).hunks.map((_) => ({
    ..._,
    lines: _.lines.map((_2) => _2.replaceAll(AMPERSAND_TOKEN, "&").replaceAll(DOLLAR_TOKEN, "$"))
  }));
}