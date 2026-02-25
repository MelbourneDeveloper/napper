// Shared HTML utility functions for webview panels
// Used by both responsePanel and playlistPanel

export const escapeHtml = (text: string): string =>
  text
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");

const jsonSpan = (cls: string, content: string): string =>
  `<span class="json-${cls}">${escapeHtml(content)}</span>`;

const highlightJsonPrimitive = (value: unknown): string | undefined => {
  if (value === null) return jsonSpan("null", "null");
  if (typeof value === "boolean") return jsonSpan("bool", String(value));
  if (typeof value === "number") return jsonSpan("number", String(value));
  if (typeof value === "string")
    return jsonSpan("string", `"${escapeHtml(value)}"`);
  return undefined;
};

const highlightJsonArray = (
  items: readonly unknown[],
  indent: number
): string => {
  if (items.length === 0) return "[]";
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);
  const rendered = items
    .map((item) => `${innerPad}${highlightJson(item, indent + 2)}`)
    .join(",\n");
  return `[\n${rendered}\n${pad}]`;
};

const highlightJsonObject = (
  value: Record<string, unknown>,
  indent: number
): string => {
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);
  const props = entries
    .map(
      ([k, v]) =>
        `${innerPad}${jsonSpan("key", `"${escapeHtml(k)}"`)}: ${highlightJson(v, indent + 2)}`
    )
    .join(",\n");
  return `{\n${props}\n${pad}}`;
};

export const highlightJson = (value: unknown, indent: number): string => {
  const primitive = highlightJsonPrimitive(value);
  if (primitive !== undefined) return primitive;
  if (Array.isArray(value)) return highlightJsonArray(value, indent);
  if (typeof value === "object")
    return highlightJsonObject(value as Record<string, unknown>, indent);
  return escapeHtml(String(value));
};

export const formatBodyHtml = (body: string): string => {
  try {
    const parsed: unknown = JSON.parse(body);
    return highlightJson(parsed, 0);
  } catch {
    return escapeHtml(body);
  }
};
