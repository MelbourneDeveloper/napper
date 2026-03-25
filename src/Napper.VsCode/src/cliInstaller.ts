// Specs: vscode-impl
// CLI Installer — downloads matching binary with checksum verification,
// falls back to dotnet tool if binary cannot run.
// Decoupled from vscode SDK — takes config values as parameters

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { type Result, err, ok } from './types';
import {
  CLI_ARCH_ARM64,
  CLI_ARCH_X64,
  CLI_ASSET_PREFIX,
  CLI_BINARY_NAME,
  CLI_BIN_DIR,
  CLI_CHECKSUM_MISMATCH_MSG,
  CLI_CHECKSUM_NOT_FOUND_MSG,
  CLI_CHECKSUMS_FILE,
  CLI_DOTNET_CMD,
  CLI_DOTNET_FALLBACK_MSG,
  CLI_DOTNET_INSTALL_ERROR_PREFIX,
  CLI_DOTNET_TOOL_INSTALL_TIMEOUT,
  CLI_DOWNLOAD_BASE_URL,
  CLI_DOWNLOAD_ERROR_PREFIX,
  CLI_FILE_MODE_EXECUTABLE,
  CLI_MAX_REDIRECTS,
  CLI_PLATFORM_DARWIN,
  CLI_PLATFORM_LINUX,
  CLI_PLATFORM_WIN32,
  CLI_REDIRECT_ERROR,
  CLI_RID_LINUX_X64,
  CLI_RID_OSX_ARM64,
  CLI_RID_OSX_X64,
  CLI_RID_WIN_X64,
  CLI_TOO_MANY_REDIRECTS,
  CLI_TOOL_ARG,
  CLI_TOOL_GLOBAL_FLAG,
  CLI_TOOL_INSTALL_ARG,
  CLI_TOOL_LIST_ARG,
  CLI_TOOL_UPDATE_ARG,
  CLI_TOOL_VERSION_FLAG,
  CLI_UNSUPPORTED_PLATFORM_MSG,
  CLI_VERSION_CHECK_ERROR,
  CLI_VERSION_CHECK_TIMEOUT,
  CLI_VERSION_FLAG,
  CLI_WIN_EXE_SUFFIX,
} from './constants';

// ── Platform detection ──────────────────────────────────────────────

const PLATFORM_RID_MAP: ReadonlyMap<string, string> = new Map([
  [`${CLI_PLATFORM_DARWIN}-${CLI_ARCH_ARM64}`, CLI_RID_OSX_ARM64],
  [`${CLI_PLATFORM_DARWIN}-${CLI_ARCH_X64}`, CLI_RID_OSX_X64],
  [`${CLI_PLATFORM_LINUX}-${CLI_ARCH_X64}`, CLI_RID_LINUX_X64],
  [`${CLI_PLATFORM_WIN32}-${CLI_ARCH_X64}`, CLI_RID_WIN_X64],
]);

const platformToRid = (): Result<string, string> => {
  const key = `${os.platform()}-${os.arch()}`,
    rid = PLATFORM_RID_MAP.get(key);
  return rid !== undefined ? ok(rid) : err(`${CLI_UNSUPPORTED_PLATFORM_MSG}${key}`);
};

const assetName = (rid: string): string => {
  const base = `${CLI_ASSET_PREFIX}${rid}`;
  return rid === CLI_RID_WIN_X64 ? `${base}${CLI_WIN_EXE_SUFFIX}` : base;
};

const localBinaryName = (): string =>
  os.platform() === CLI_PLATFORM_WIN32
    ? `${CLI_BINARY_NAME}${CLI_WIN_EXE_SUFFIX}`
    : CLI_BINARY_NAME;

// ── Version check ───────────────────────────────────────────────────

export const getCliVersion = async (cliPath: string): Promise<Result<string, string>> =>
  new Promise((resolve) => {
    execFile(
      cliPath,
      [CLI_VERSION_FLAG],
      { timeout: CLI_VERSION_CHECK_TIMEOUT },
      (error: Error | null, stdout: string) => {
        if (error !== null) {
          resolve(err(`${CLI_VERSION_CHECK_ERROR}${error.message}`));
          return;
        }
        resolve(ok(stdout.trim()));
      },
    );
  });

// ── HTTPS download with redirect following ──────────────────────────

import type * as http from 'http';

type ResultResolver = (value: Result<Buffer, string>) => void;

const collectBody = (response: http.IncomingMessage, resolve: ResultResolver): void => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });
  response.on('end', () => {
    resolve(ok(Buffer.concat(chunks)));
  });
  response.on('error', (e) => {
    resolve(err(e.message));
  });
};

interface HttpGetResult {
  readonly response: http.IncomingMessage;
  readonly status: number;
}

const httpsGetOnce = async (url: string): Promise<Result<HttpGetResult, string>> =>
  new Promise((resolve) => {
    https
      .get(url, { headers: { 'User-Agent': CLI_BINARY_NAME } }, (response) => {
        resolve(ok({ response, status: response.statusCode ?? 0 }));
      })
      .on('error', (e) => {
        resolve(err(e.message));
      });
  });

const resolveRedirect = (response: http.IncomingMessage): Result<string, string> => {
  response.resume();
  const { location } = response.headers;
  return location !== undefined && location !== '' ? ok(location) : err(CLI_REDIRECT_ERROR);
};

const followRedirects = async (
  url: string,
  depth: number,
): Promise<Result<http.IncomingMessage, string>> => {
  if (depth > CLI_MAX_REDIRECTS) {
    return err(CLI_TOO_MANY_REDIRECTS);
  }
  const result = await httpsGetOnce(url);
  if (!result.ok) {
    return err(result.error);
  }
  const { response, status } = result.value;
  if (status >= 300 && status < 400) {
    const loc = resolveRedirect(response);
    return loc.ok ? followRedirects(loc.value, depth + 1) : err(loc.error);
  }
  if (status !== 200) {
    response.resume();
    return err(`${CLI_DOWNLOAD_ERROR_PREFIX}HTTP ${String(status)}`);
  }
  return ok(response);
};

const downloadFile = async (url: string): Promise<Result<Buffer, string>> => {
  const result = await followRedirects(url, 0);
  if (!result.ok) {
    return err(result.error);
  }
  return new Promise((resolve) => {
    collectBody(result.value, resolve);
  });
};

// ── Checksum verification ───────────────────────────────────────────

const verifyChecksum = (
  data: Buffer,
  checksumFileContent: string,
  asset: string,
): Result<void, string> => {
  const line = checksumFileContent.split('\n').find((l) => l.includes(asset));

  if (line === undefined) {
    return err(CLI_CHECKSUM_NOT_FOUND_MSG);
  }

  const expectedHash = line.split(/\s+/)[0]?.toLowerCase() ?? '',
    actualHash = crypto.createHash('sha256').update(data).digest('hex');

  return actualHash === expectedHash
    ? ok(undefined)
    : err(`${CLI_CHECKSUM_MISMATCH_MSG} — expected ${expectedHash}, got ${actualHash}`);
};

// ── Binary download + verify ────────────────────────────────────────

const buildDownloadUrls = (
  version: string,
  rid: string,
): { readonly binaryUrl: string; readonly checksumUrl: string; readonly asset: string } => {
  const asset = assetName(rid),
    tag = `v${version}`;
  return {
    binaryUrl: `${CLI_DOWNLOAD_BASE_URL}/${tag}/${asset}`,
    checksumUrl: `${CLI_DOWNLOAD_BASE_URL}/${tag}/${CLI_CHECKSUMS_FILE}`,
    asset,
  };
};

const writeBinaryToDisk = (destPath: string, data: Buffer): void => {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(destPath, data);
  if (os.platform() !== CLI_PLATFORM_WIN32) {
    fs.chmodSync(destPath, CLI_FILE_MODE_EXECUTABLE);
  }
};

const fetchAndVerify = async (
  version: string,
  rid: string,
): Promise<Result<{ readonly data: Buffer; readonly asset: string }, string>> => {
  const { binaryUrl, checksumUrl, asset } = buildDownloadUrls(version, rid),
    [binaryResult, checksumResult] = await Promise.all([
      downloadFile(binaryUrl),
      downloadFile(checksumUrl),
    ]);
  if (!binaryResult.ok) {
    return err(`${CLI_DOWNLOAD_ERROR_PREFIX}${binaryResult.error}`);
  }
  if (!checksumResult.ok) {
    return err(`${CLI_DOWNLOAD_ERROR_PREFIX}checksums: ${checksumResult.error}`);
  }
  const verifyResult = verifyChecksum(
    binaryResult.value,
    checksumResult.value.toString('utf-8'),
    asset,
  );
  return verifyResult.ok ? ok({ data: binaryResult.value, asset }) : err(verifyResult.error);
};

const downloadAndVerifyBinary = async (
  version: string,
  destPath: string,
): Promise<Result<void, string>> => {
  const ridResult = platformToRid();
  if (!ridResult.ok) {
    return err(ridResult.error);
  }
  const fetchResult = await fetchAndVerify(version, ridResult.value);
  if (!fetchResult.ok) {
    return err(fetchResult.error);
  }
  writeBinaryToDisk(destPath, fetchResult.value.data);
  return ok(undefined);
};

// ── Dotnet tool fallback ────────────────────────────────────────────

const parseToolVersion = (stdout: string): Result<string, string> => {
  const line = stdout.split('\n').find((l) => l.toLowerCase().startsWith(CLI_BINARY_NAME));
  if (line === undefined) {
    return err('not installed');
  }
  const parts = line.split(/\s+/);
  return ok(parts[1] ?? '');
};

const isToolInstalled = async (): Promise<Result<string, string>> =>
  new Promise((resolve) => {
    execFile(
      CLI_DOTNET_CMD,
      [CLI_TOOL_ARG, CLI_TOOL_LIST_ARG, CLI_TOOL_GLOBAL_FLAG],
      { timeout: CLI_VERSION_CHECK_TIMEOUT },
      (error: Error | null, stdout: string) => {
        if (error !== null) {
          resolve(err(error.message));
          return;
        }
        resolve(parseToolVersion(stdout));
      },
    );
  });

const runDotnetTool = async (action: string, version: string): Promise<Result<void, string>> =>
  new Promise((resolve) => {
    execFile(
      CLI_DOTNET_CMD,
      [CLI_TOOL_ARG, action, CLI_TOOL_GLOBAL_FLAG, CLI_BINARY_NAME, CLI_TOOL_VERSION_FLAG, version],
      { timeout: CLI_DOTNET_TOOL_INSTALL_TIMEOUT },
      (error: Error | null, _stdout: string, stderr: string) => {
        if (error !== null) {
          resolve(err(`${CLI_DOTNET_INSTALL_ERROR_PREFIX}${stderr || error.message}`));
          return;
        }
        resolve(ok(undefined));
      },
    );
  });

const installViaDotnetTool = async (version: string): Promise<Result<void, string>> => {
  const existing = await isToolInstalled(),
    action = existing.ok ? CLI_TOOL_UPDATE_ARG : CLI_TOOL_INSTALL_ARG;
  return runDotnetTool(action, version);
};

// ── Public API ──────────────────────────────────────────────────────

export interface DownloadBinaryParams {
  readonly version: string;
  readonly storageDir: string;
  readonly log: (msg: string) => void;
}

export const installedBinaryPath = (dir: string): string =>
  path.join(dir, CLI_BIN_DIR, localBinaryName());

export const downloadBinary = async (
  params: DownloadBinaryParams,
): Promise<Result<string, string>> => {
  const destPath = installedBinaryPath(params.storageDir);
  params.log(`Downloading binary v${params.version}...`);
  const downloadResult = await downloadAndVerifyBinary(params.version, destPath);
  if (!downloadResult.ok) {
    return err(downloadResult.error);
  }
  params.log(`Binary written to ${destPath}`);
  return ok(destPath);
};

export const installDotnetTool = async (
  params: DownloadBinaryParams,
): Promise<Result<void, string>> => {
  params.log(CLI_DOTNET_FALLBACK_MSG);
  return installViaDotnetTool(params.version);
};
