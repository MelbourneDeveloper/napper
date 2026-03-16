// Specs: vscode-commands
// Curl copy command — copyAsCurl and parsing helpers
// Extracted from extension.ts to keep files under 450 LOC

import * as vscode from "vscode";
import {
  CURL_CMD_PREFIX,
  DEFAULT_METHOD,
  HTTP_METHODS,
  MSG_COPIED,
  NAP_KEY_METHOD,
  NAP_KEY_URL,
} from "./constants";

const EQUALS_CHAR = "=",
 SPACE_CHAR = " ",

 valueAfterFirstEquals = (line: string): string => {
  const eqIndex = line.indexOf(EQUALS_CHAR);
  return eqIndex === -1
    ? ""
    : line.slice(eqIndex + 1).trim();
},

 matchesHttpMethodLine = (
  trimmed: string,
  method: string
): boolean =>
  trimmed.startsWith(`${method}${SPACE_CHAR}`),

 extractMethodFromLine = (
  trimmed: string
): { readonly method: string; readonly url: string } | undefined => {
  for (const m of HTTP_METHODS) {
    if (matchesHttpMethodLine(trimmed, m)) {
      return { method: m, url: trimmed.slice(m.length + 1).trim() };
    }
  }
  return undefined;
},

 parseLine = (
  trimmed: string,
  current: { method: string; url: string }
): void => {
  const httpMatch = extractMethodFromLine(trimmed);
  if (httpMatch !== undefined) {
    current.method = httpMatch.method;
    current.url = httpMatch.url;
  }
  if (trimmed.startsWith(NAP_KEY_METHOD) && trimmed.includes(EQUALS_CHAR)) {
    current.method = valueAfterFirstEquals(trimmed);
  }
  if (trimmed.startsWith(NAP_KEY_URL) && trimmed.includes(EQUALS_CHAR)) {
    current.url = valueAfterFirstEquals(trimmed);
  }
};

export const parseMethodAndUrl = (
  text: string
): { readonly method: string; readonly url: string } => {
  const result = { method: DEFAULT_METHOD, url: "" },
   lines = text.split("\n");
  for (const line of lines) {
    parseLine(line.trim(), result);
  }
  return result;
};

export const copyAsCurl = async (
  uri?: vscode.Uri
): Promise<void> => {
  const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (fileUri === undefined) { return; }

  const doc = await vscode.workspace.openTextDocument(fileUri),
   { method, url } = parseMethodAndUrl(doc.getText()),

   curl = `${CURL_CMD_PREFIX}${method} '${url}'`;
  await vscode.env.clipboard.writeText(curl);
  void vscode.window.showInformationMessage(MSG_COPIED);
};
