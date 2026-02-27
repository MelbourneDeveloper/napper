// Tree data provider for the Explorer view
// Shows .nap and .naplist files in workspace folder structure

import * as path from "path";
import {
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  FSX_EXTENSION,
  CSX_EXTENSION,
  CONTEXT_REQUEST_FILE,
  CONTEXT_PLAYLIST,
  CONTEXT_FOLDER,
  CONTEXT_PLAYLIST_SECTION,
  CONTEXT_SCRIPT_FILE,
  PLAYLIST_SECTION_LABEL,
  SECTION_STEPS,
  HTTP_METHODS,
  NAP_KEY_METHOD,
  NAP_NAME_KEY_PREFIX,
  NAP_NAME_KEY_SUFFIX,
} from "./constants";
import { RunState, type RunResult } from "./types";

// Decoupled node type — no vscode dependency
export interface TreeNode {
  readonly label: string;
  readonly filePath: string;
  readonly isDirectory: boolean;
  readonly contextValue: string;
  readonly httpMethod?: string;
  readonly runState: RunState;
  readonly children?: readonly TreeNode[];
}

const isScriptFile = (filePath: string): boolean =>
  filePath.endsWith(FSX_EXTENSION) || filePath.endsWith(CSX_EXTENSION);

const getContextValue = (filePath: string, isDirectory: boolean): string => {
  if (isDirectory) {
    return CONTEXT_FOLDER;
  }
  if (filePath.endsWith(NAPLIST_EXTENSION)) {
    return CONTEXT_PLAYLIST;
  }
  if (isScriptFile(filePath)) {
    return CONTEXT_SCRIPT_FILE;
  }
  return CONTEXT_REQUEST_FILE;
};

const isMethodLine = (trimmed: string, method: string): boolean =>
  trimmed.startsWith(`${method} `) ||
  trimmed === `${NAP_KEY_METHOD}  = ${method}` ||
  trimmed === `${NAP_KEY_METHOD} = ${method}`;

const extractHttpMethod = (fileContent: string): string | undefined => {
  const lines = fileContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      if (isMethodLine(trimmed, method)) {
        return method;
      }
    }
  }
  return undefined;
};

const getRunState = (
  filePath: string,
  results: ReadonlyMap<string, RunResult>
): RunState => {
  const result = results.get(filePath);
  if (result === undefined) {
    return RunState.Idle;
  }
  if (result.error !== undefined) {
    return RunState.Error;
  }
  return result.passed ? RunState.Passed : RunState.Failed;
};

export const createFileNode = (
  filePath: string,
  fileContent: string,
  results: ReadonlyMap<string, RunResult>,
): TreeNode => {
  const method = filePath.endsWith(NAP_EXTENSION)
    ? extractHttpMethod(fileContent)
    : undefined;
  const base = {
    label: path.basename(filePath, path.extname(filePath)),
    filePath,
    isDirectory: false as const,
    contextValue: getContextValue(filePath, false),
    runState: getRunState(filePath, results),
  };
  if (method !== undefined) {
    return { ...base, httpMethod: method };
  }
  return base;
};

export const createFolderNode = (
  folderPath: string,
  children: readonly TreeNode[]
): TreeNode => ({
  label: path.basename(folderPath),
  filePath: folderPath,
  isDirectory: true,
  contextValue: CONTEXT_FOLDER,
  runState: RunState.Idle,
  children,
});

const isSectionHeader = (trimmed: string): boolean =>
  trimmed.startsWith("[") && trimmed.endsWith("]");

export const parsePlaylistStepPaths = (content: string): readonly string[] => {
  const lines = content.split("\n");
  let inSteps = false;
  const steps: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (isSectionHeader(trimmed)) {
      inSteps = trimmed === SECTION_STEPS;
      continue;
    }
    if (!inSteps || trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    steps.push(trimmed);
  }
  return steps;
};

export const createPlaylistNode = (
  filePath: string,
  results: ReadonlyMap<string, RunResult>,
  stepChildren: readonly TreeNode[]
): TreeNode => ({
  label: path.basename(filePath, path.extname(filePath)),
  filePath,
  isDirectory: false,
  contextValue: CONTEXT_PLAYLIST,
  runState: getRunState(filePath, results),
  children: stepChildren,
});

export const createPlaylistSectionNode = (
  children: readonly TreeNode[]
): TreeNode => ({
  label: PLAYLIST_SECTION_LABEL,
  filePath: "",
  isDirectory: false,
  contextValue: CONTEXT_PLAYLIST_SECTION,
  runState: RunState.Idle,
  children,
});

export const appendStepToPlaylist = (
  content: string,
  stepPath: string
): string => {
  const lines = content.split("\n");
  let insertIndex = -1;
  let inSteps = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === SECTION_STEPS) {
      inSteps = true;
      continue;
    }
    if (inSteps && isSectionHeader(trimmed)) {
      insertIndex = i;
      break;
    }
  }
  if (!inSteps) {
    return `${content}\n${SECTION_STEPS}\n${stepPath}\n`;
  }
  if (insertIndex === -1) {
    insertIndex = lines.length;
  }
  lines.splice(insertIndex, 0, stepPath);
  return lines.join("\n");
};

export const updatePlaylistName = (
  content: string,
  newName: string
): string => {
  const lines = content.split("\n");
  const updated = lines.map((line) =>
    line.trim().startsWith(NAP_NAME_KEY_PREFIX)
      ? `${NAP_NAME_KEY_PREFIX}${newName}${NAP_NAME_KEY_SUFFIX}`
      : line
  );
  return updated.join("\n");
};
