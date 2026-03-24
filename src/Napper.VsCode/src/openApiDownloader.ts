// Specs: vscode-openapi
// OpenAPI spec download — fetches specs via HTTPS with redirect support
// Pure function — no VS Code SDK dependency

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import type { IncomingMessage } from 'http';
import { type Result, err, ok } from './types';
import {
  HTTP_STATUS_CLIENT_ERROR_MIN,
  HTTP_STATUS_REDIRECT_MIN,
  OPENAPI_DOWNLOAD_FAILED_PREFIX,
} from './constants';

const isRedirect = (code: number): boolean =>
    code >= HTTP_STATUS_REDIRECT_MIN && code < HTTP_STATUS_CLIENT_ERROR_MIN,
  isClientError = (code: number): boolean => code >= HTTP_STATUS_CLIENT_ERROR_MIN,
  collectBody = (res: IncomingMessage, resolve: (r: Result<string, string>) => void): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    res.on('end', () => {
      resolve(ok(Buffer.concat(chunks).toString('utf-8')));
    });
    res.on('error', (e) => {
      resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}${e.message}`));
    });
  };

function handleHttpResponse(
  res: IncomingMessage,
  resolve: (r: Result<string, string>) => void,
): void {
  const status = res.statusCode ?? 0;
  if (isRedirect(status) && res.headers.location !== undefined) {
    downloadSpec(res.headers.location)
      .then(resolve)
      .catch(() => {
        resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}redirect`));
      });
    return;
  }
  if (isClientError(status)) {
    resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}HTTP ${status}`));
    return;
  }
  collectBody(res, resolve);
}

export async function downloadSpec(url: string): Promise<Result<string, string>> {
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        handleHttpResponse(res, resolve);
      })
      .on('error', (e) => {
        resolve(err(`${OPENAPI_DOWNLOAD_FAILED_PREFIX}${e.message}`));
      });
  });
}

export const saveTempSpec = (content: string, outDir: string): string => {
  const specPath = path.join(outDir, '.openapi-spec.json');
  fs.writeFileSync(specPath, content, 'utf-8');
  return specPath;
};
