// CLI Installer — downloads the correct Napper CLI binary from GitHub releases
// Decoupled from vscode SDK — takes config values as parameters

import type * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { type Result, ok, err } from "./types";
import {
  CLI_BINARY_NAME,
  CLI_BIN_DIR,
  CLI_DOWNLOAD_HOST,
  CLI_DOWNLOAD_PATH_PREFIX,
  CLI_ASSET_PREFIX,
  CLI_WIN_EXE_SUFFIX,
  CLI_MAX_REDIRECTS,
  CLI_PLATFORM_DARWIN,
  CLI_PLATFORM_LINUX,
  CLI_PLATFORM_WIN32,
  CLI_ARCH_ARM64,
  CLI_ARCH_X64,
  CLI_RID_OSX_ARM64,
  CLI_RID_OSX_X64,
  CLI_RID_LINUX_X64,
  CLI_RID_WIN_X64,
  CLI_UNSUPPORTED_PLATFORM_MSG,
  CLI_DOWNLOAD_ERROR_PREFIX,
  CLI_REDIRECT_ERROR,
  CLI_TOO_MANY_REDIRECTS,
  CLI_FILE_MODE_EXECUTABLE,
  HTTP_STATUS_OK,
  HTTP_STATUS_REDIRECT_MIN,
  HTTP_STATUS_CLIENT_ERROR_MIN,
} from "./constants";

const PLATFORM_RID_MAP: ReadonlyMap<string, string> = new Map([
  [`${CLI_PLATFORM_DARWIN}-${CLI_ARCH_ARM64}`, CLI_RID_OSX_ARM64],
  [`${CLI_PLATFORM_DARWIN}-${CLI_ARCH_X64}`, CLI_RID_OSX_X64],
  [`${CLI_PLATFORM_LINUX}-${CLI_ARCH_X64}`, CLI_RID_LINUX_X64],
  [`${CLI_PLATFORM_WIN32}-${CLI_ARCH_X64}`, CLI_RID_WIN_X64],
]);

export const platformToRid = (
  platform: string,
  arch: string
): Result<string, string> => {
  const key = `${platform}-${arch}`;
  const rid = PLATFORM_RID_MAP.get(key);
  if (rid !== undefined) {
    return ok(rid);
  }
  return err(`${CLI_UNSUPPORTED_PLATFORM_MSG}${key}`);
};

export const assetName = (rid: string): string => {
  const base = `${CLI_ASSET_PREFIX}${rid}`;
  return rid === CLI_RID_WIN_X64 ? `${base}${CLI_WIN_EXE_SUFFIX}` : base;
};

export const localBinaryName = (platform: string): string =>
  platform === CLI_PLATFORM_WIN32
    ? `${CLI_BINARY_NAME}${CLI_WIN_EXE_SUFFIX}`
    : CLI_BINARY_NAME;

export const installedCliPath = (
  storageDir: string,
  platform: string
): string => path.join(storageDir, CLI_BIN_DIR, localBinaryName(platform));

export const isCliInstalled = (cliPath: string): boolean =>
  fs.existsSync(cliPath);

interface RedirectContext {
  readonly dest: string;
  readonly redirectCount: number;
  readonly resolve: (value: Result<void, string>) => void;
}

const handleRedirect = (
  response: http.IncomingMessage,
  ctx: RedirectContext,
): void => {
  const location = response.headers.location;
  if (location === undefined || location === "") {
    ctx.resolve(err(CLI_REDIRECT_ERROR));
    return;
  }
  response.resume();
  followRedirect(location, ctx.dest, ctx.redirectCount + 1)
    .then(ctx.resolve)
    .catch(() => { ctx.resolve(err(CLI_REDIRECT_ERROR)); });
};

const handleDownload = (
  response: http.IncomingMessage,
  dest: string,
  resolve: (value: Result<void, string>) => void
): void => {
  const file = fs.createWriteStream(dest);
  response.pipe(file);
  file.on("finish", () => {
    file.close();
    resolve(ok(undefined));
  });
  file.on("error", (e) => { resolve(err(e.message)); });
};

const buildRequestOptions = (url: string): { hostname: string; path: string; headers: Record<string, string> } => {
  const parsedUrl = new URL(url);
  return {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    headers: { "User-Agent": CLI_BINARY_NAME },
  };
};

const isRedirectStatus = (status: number): boolean =>
  status >= HTTP_STATUS_REDIRECT_MIN && status < HTTP_STATUS_CLIENT_ERROR_MIN;

const handleResponse = (
  response: http.IncomingMessage,
  ctx: RedirectContext,
): void => {
  const status = response.statusCode ?? 0;
  if (isRedirectStatus(status)) {
    handleRedirect(response, ctx);
  } else if (status !== HTTP_STATUS_OK) {
    response.resume();
    ctx.resolve(err(`${CLI_DOWNLOAD_ERROR_PREFIX}${status}`));
  } else {
    handleDownload(response, ctx.dest, ctx.resolve);
  }
};

async function followRedirect(
  url: string,
  dest: string,
  redirectCount: number
): Promise<Result<void, string>> {
  if (redirectCount > CLI_MAX_REDIRECTS) {
    return err(CLI_TOO_MANY_REDIRECTS);
  }

  const options = buildRequestOptions(url);

  return await new Promise((resolve) => {
    const ctx: RedirectContext = { dest, redirectCount, resolve };
    https
      .get(options, (response) => { handleResponse(response, ctx); })
      .on("error", (e) => { resolve(err(e.message)); });
  });
}

export const downloadBinary = async (
  rid: string,
  destPath: string
): Promise<Result<void, string>> => {
  const asset = assetName(rid);
  const url = `https://${CLI_DOWNLOAD_HOST}${CLI_DOWNLOAD_PATH_PREFIX}${asset}`;
  const dir = path.dirname(destPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return await followRedirect(url, destPath, 0);
};

export const makeExecutable = (
  filePath: string,
  platform: string
): void => {
  if (platform !== CLI_PLATFORM_WIN32) {
    fs.chmodSync(filePath, CLI_FILE_MODE_EXECUTABLE);
  }
};

export interface InstallResult {
  readonly cliPath: string;
}

export const installCli = async (
  storageDir: string,
  platform: string,
  arch: string
): Promise<Result<InstallResult, string>> => {
  const ridResult = platformToRid(platform, arch);
  if (!ridResult.ok) {
    return err(ridResult.error);
  }

  const destPath = installedCliPath(storageDir, platform);
  const downloadResult = await downloadBinary(ridResult.value, destPath);
  if (!downloadResult.ok) {
    return err(downloadResult.error);
  }

  makeExecutable(destPath, platform);
  return ok({ cliPath: destPath });
};
