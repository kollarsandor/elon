function unescapeToolInput(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&#10;/g, "\n").replace(/&#13;/g, "\r").replace(/&#9;/g, "	");
}
function unescapeSequences(str) {
  return str.replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}
function unescapeSequencesOutsideStrings(str) {
  const stringRegex = /("(?:(?:\\.)|[^"\\])*")|('(?:(?:\\.)|[^'\\])*')|(`(?:(?:\\.)|[^`\\])*`)|("""(?:(?:\\.)|[^"\\])*""")|('''(?:(?:\\.)|[^'\\])*''')/g;
  const stringSpans = [];
  let match2;
  while ((match2 = stringRegex.exec(str)) !== null) {
    stringSpans.push({
      start: match2.index,
      end: match2.index + match2[0].length
    });
  }
  stringSpans.sort((a, b) => a.start - b.start);
  let result = "";
  let currentPos = 0;
  for (const span of stringSpans) {
    let outsidePart = str.substring(currentPos, span.start);
    outsidePart = unescapeSequences(outsidePart);
    result += outsidePart;
    const insidePart = str.substring(span.start, span.end);
    result += insidePart;
    currentPos = span.end;
  }
  let remaining = str.substring(currentPos);
  remaining = unescapeSequences(remaining);
  result += remaining;
  return result;
}
function unescapeHtmlOutsideStrings(str) {
  const stringRegex = /("(?:(?:\\.)|[^"\\])*")|('(?:(?:\\.)|[^'\\])*')|(`(?:(?:\\.)|[^`\\])*`)|("""(?:(?:\\.)|[^"\\])*""")|('''(?:(?:\\.)|[^'\\])*''')/g;
  const stringSpans = [];
  let match2;
  while ((match2 = stringRegex.exec(str)) !== null) {
    stringSpans.push({
      start: match2.index,
      end: match2.index + match2[0].length
    });
  }
  stringSpans.sort((a, b) => a.start - b.start);
  let result = "";
  let currentPos = 0;
  for (const span of stringSpans) {
    let outsidePart = str.substring(currentPos, span.start);
    outsidePart = unescapeToolInput(outsidePart);
    result += outsidePart;
    const insidePart = str.substring(span.start, span.end);
    result += insidePart;
    currentPos = span.end;
  }
  let remaining = str.substring(currentPos);
  remaining = unescapeToolInput(remaining);
  result += remaining;
  return result;
}
function fixEscapedString(str) {
  if (str.length === 0)
    return str;
  let result = unescapeHtmlOutsideStrings(str);
  result = unescapeSequencesOutsideStrings(result);
  return result;
}