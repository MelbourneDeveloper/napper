// Specs: vscode-impl
// CLI Installer — downloads the correct Napper CLI binary from GitHub releases
// Decoupled from vscode SDK — takes config values as parameters

import type * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { type Result, err, ok } from './types';
import {
  CLI_ARCH_ARM64,
  CLI_ARCH_X64,
  CLI_ASSET_PREFIX,
  CLI_BINARY_NAME,
  CLI_BIN_DIR,
  CLI_DOWNLOAD_ERROR_PREFIX,
  CLI_DOWNLOAD_HOST,
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
  CLI_UNSUPPORTED_PLATFORM_MSG,
  CLI_VERSION_CHECK_ERROR,
  CLI_VERSION_CHECK_TIMEOUT,
  CLI_VERSION_FLAG,
  CLI_WIN_EXE_SUFFIX,
  HTTP_STATUS_CLIENT_ERROR_MIN,
  HTTP_STATUS_OK,
  HTTP_STATUS_REDIRECT_MIN,
  cliDownloadPath,
} from './constants';

const PLATFORM_RID_MAP: ReadonlyMap<string, string> = new Map([
  [`${CLI_PLATFORM_DARWIN}-${CLI_ARCH_ARM64}`, CLI_RID_OSX_ARM64],
  [`${CLI_PLATFORM_DARWIN}-${CLI_ARCH_X64}`, CLI_RID_OSX_X64],
  [`${CLI_PLATFORM_LINUX}-${CLI_ARCH_X64}`, CLI_RID_LINUX_X64],
  [`${CLI_PLATFORM_WIN32}-${CLI_ARCH_X64}`, CLI_RID_WIN_X64],
]);

export const platformToRid = (platform: string, arch: string): Result<string, string> => {
  const key = `${platform}-${arch}`,
    rid = PLATFORM_RID_MAP.get(key);
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
  platform === CLI_PLATFORM_WIN32 ? `${CLI_BINARY_NAME}${CLI_WIN_EXE_SUFFIX}` : CLI_BINARY_NAME;

export const installedCliPath = (storageDir: string, platform: string): string =>
  path.join(storageDir, CLI_BIN_DIR, localBinaryName(platform));

export const isCliInstalled = (cliPath: string): boolean => fs.existsSync(cliPath);

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

interface RedirectContext {
  readonly dest: string;
  readonly redirectCount: number;
  readonly resolve: (value: Result<void, string>) => void;
}

const handleRedirect = (response: http.IncomingMessage, ctx: RedirectContext): void => {
    const { location } = response.headers;
    if (location === undefined || location === '') {
      ctx.resolve(err(CLI_REDIRECT_ERROR));
      return;
    }
    response.resume();
    followRedirect(location, ctx.dest, ctx.redirectCount + 1)
      .then(ctx.resolve)
      .catch(() => {
        ctx.resolve(err(CLI_REDIRECT_ERROR));
      });
  },
  handleDownload = (
    response: http.IncomingMessage,
    dest: string,
    resolve: (value: Result<void, string>) => void,
  ): void => {
    const file = fs.createWriteStream(dest);
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      resolve(ok(undefined));
    });
    file.on('error', (e) => {
      resolve(err(e.message));
    });
  },
  buildRequestOptions = (
    url: string,
  ): { hostname: string; path: string; headers: Record<string, string> } => {
    const parsedUrl = new URL(url);
    return {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: { 'User-Agent': CLI_BINARY_NAME },
    };
  },
  isRedirectStatus = (status: number): boolean =>
    status >= HTTP_STATUS_REDIRECT_MIN && status < HTTP_STATUS_CLIENT_ERROR_MIN,
  handleResponse = (response: http.IncomingMessage, ctx: RedirectContext): void => {
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
  redirectCount: number,
): Promise<Result<void, string>> {
  if (redirectCount > CLI_MAX_REDIRECTS) {
    return err(CLI_TOO_MANY_REDIRECTS);
  }

  const options = buildRequestOptions(url);

  return new Promise((resolve) => {
    const ctx: RedirectContext = { dest, redirectCount, resolve };
    https
      .get(options, (response) => {
        handleResponse(response, ctx);
      })
      .on('error', (e) => {
        resolve(err(e.message));
      });
  });
}

export const downloadBinary = async (
  rid: string,
  destPath: string,
  version: string,
): Promise<Result<void, string>> => {
  const asset = assetName(rid),
    url = `https://${CLI_DOWNLOAD_HOST}${cliDownloadPath(version)}${asset}`,
    dir = path.dirname(destPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return followRedirect(url, destPath, 0);
};

export const makeExecutable = (filePath: string, platform: string): void => {
  if (platform !== CLI_PLATFORM_WIN32) {
    fs.chmodSync(filePath, CLI_FILE_MODE_EXECUTABLE);
  }
};

export interface InstallResult {
  readonly cliPath: string;
}

export interface InstallCliParams {
  readonly storageDir: string;
  readonly platform: string;
  readonly arch: string;
  readonly version: string;
}

export const installCli = async (
  params: InstallCliParams,
): Promise<Result<InstallResult, string>> => {
  const ridResult = platformToRid(params.platform, params.arch);
  if (!ridResult.ok) {
    return err(ridResult.error);
  }

  const destPath = installedCliPath(params.storageDir, params.platform),
    downloadResult = await downloadBinary(ridResult.value, destPath, params.version);
  if (!downloadResult.ok) {
    return err(downloadResult.error);
  }

  makeExecutable(destPath, params.platform);
  return ok({ cliPath: destPath });
};
