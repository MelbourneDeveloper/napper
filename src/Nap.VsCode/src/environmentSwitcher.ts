// Environment switcher — status bar item + quick pick
// Decoupled: detection logic is pure, only the adapter touches vscode

import * as path from "path";
import { NAPENV_EXTENSION, NAPENV_LOCAL_SUFFIX } from "./constants";

export const extractEnvName = (fileName: string): string | undefined => {
  const base = path.basename(fileName);

  if (base === NAPENV_EXTENSION.slice(1)) {
    return undefined;
  }
  if (base.endsWith(NAPENV_LOCAL_SUFFIX)) {
    return undefined;
  }

  const prefix = `${NAPENV_EXTENSION.slice(1)}.`;
  if (base.startsWith(prefix)) {
    return base.slice(prefix.length);
  }

  return undefined;
};

export const detectEnvironments = (
  filePaths: readonly string[]
): readonly string[] => {
  const envs: string[] = [];

  for (const fp of filePaths) {
    const name = extractEnvName(fp);
    if (name !== undefined && !envs.includes(name)) {
      envs.push(name);
    }
  }

  return envs.sort();
};
