// VSIX/ZIP extraction strips Unix execute bits — restore them before Shipwright version-checks the binary.
import * as fs from 'fs';
import * as path from 'path';

export const bundledBinaryPath = (extensionPath: string): string => {
  const platform = `${process.platform}-${process.arch}`;
  const binaryName = process.platform === 'win32' ? 'napper.exe' : 'napper';
  return path.join(extensionPath, 'bin', platform, binaryName);
};

export const ensureExecutable = (binaryPath: string): void => {
  if (process.platform === 'win32') return;
  if (fs.existsSync(binaryPath)) {
    fs.chmodSync(binaryPath, 0o755);
  }
};
