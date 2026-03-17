// Specs: vscode-openapi-ai
// AI enrichment for OpenAPI-generated .nap files
// Pure functions — NO VS Code SDK dependency — fully testable

import * as fs from 'fs';
import * as path from 'path';
import { type Result, err, ok } from './types';
import {
  NAP_EXTENSION,
  NAP_TRIPLE_QUOTE,
  SECTION_ASSERT,
  SECTION_REQUEST_BODY,
  SECTION_STEPS,
} from './constants';

// ─── Types ──────────────────────────────────────────────────

export interface OperationSummary {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly summary: string;
  readonly responseFields: readonly string[];
  readonly hasRequestBody: boolean;
}

export interface AssertionEnrichment {
  readonly operationId: string;
  readonly assertions: readonly string[];
}

export interface TestDataEnrichment {
  readonly operationId: string;
  readonly requestBody: string;
}

export interface GeneratedFile {
  readonly fileName: string;
  readonly content: string;
}

export interface EnrichmentResult {
  readonly files: readonly GeneratedFile[];
  readonly playlistContent: string;
}

// ─── Prompt builders ────────────────────────────────────────

const ASSERTION_SYSTEM = [
    'You are an API test engineer.',
    'Given API operations with their response fields,',
    "suggest semantic assertions that go beyond 'exists' checks.",
    'Return ONLY a JSON array.',
    'Each element: { operationId: string, assertions: string[] }.',
    'Assertions use napper syntax: body.field > 0, body.email contains @,',
    'body.name != "", headers.Content-Type contains json.',
    'Do NOT repeat status assertions. Only add value/format checks.',
  ].join(' '),
  TEST_DATA_SYSTEM = [
    'You are an API test data generator.',
    'Given API operations that accept request bodies,',
    'generate realistic JSON request body examples.',
    'Return ONLY a JSON array.',
    'Each element: { operationId: string, requestBody: string }.',
    'requestBody must be a valid JSON string with realistic values.',
    'Use real-looking names, emails, dates, IDs — not placeholders.',
  ].join(' '),
  PLAYLIST_SYSTEM = [
    'You are an API test orchestrator.',
    'Given a list of test file paths, reorder them for logical flow:',
    'auth/login first, then creates, then reads, then updates, then deletes.',
    'Return ONLY a JSON array of the file paths in the recommended order.',
  ].join(' ');

export const buildAssertionPrompt = (operations: readonly OperationSummary[]): string => {
  const lines = operations.map(
    (op) =>
      `- ${op.method.toUpperCase()} ${op.path} (${op.operationId}): ` +
      `response fields: [${op.responseFields.join(', ')}]`,
  );
  return lines.join('\n');
};

export const buildTestDataPrompt = (operations: readonly OperationSummary[]): string => {
  const withBody = operations.filter((op) => op.hasRequestBody),
    lines = withBody.map(
      (op) => `- ${op.method.toUpperCase()} ${op.path} (${op.operationId}): ${op.summary}`,
    );
  return lines.join('\n');
};

export const buildPlaylistOrderPrompt = (filePaths: readonly string[]): string =>
  filePaths.join('\n');

export const getAssertionSystemPrompt = (): string => ASSERTION_SYSTEM;
export const getTestDataSystemPrompt = (): string => TEST_DATA_SYSTEM;
export const getPlaylistSystemPrompt = (): string => PLAYLIST_SYSTEM;

// ─── Response parsers ───────────────────────────────────────

export const parseAssertionResponse = (
  json: string,
): Result<readonly AssertionEnrichment[], string> => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return err('Expected JSON array for assertion enrichments');
    }
    return ok(parsed as readonly AssertionEnrichment[]);
  } catch {
    return err('Failed to parse assertion enrichment response');
  }
};

export const parseTestDataResponse = (
  json: string,
): Result<readonly TestDataEnrichment[], string> => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return err('Expected JSON array for test data enrichments');
    }
    return ok(parsed as readonly TestDataEnrichment[]);
  } catch {
    return err('Failed to parse test data enrichment response');
  }
};

export const parsePlaylistOrderResponse = (json: string): Result<readonly string[], string> => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return err('Expected JSON array for playlist order');
    }
    return ok(parsed as readonly string[]);
  } catch {
    return err('Failed to parse playlist order response');
  }
};

// ─── Content enrichment (line-based, no regex) ──────────────

const isSectionHeader = (line: string): boolean => line.startsWith('[') && line.endsWith(']'),
  skipToNextSection = (lines: readonly string[], startIdx: number): number => {
    let idx = startIdx;
    while (idx < lines.length && !isSectionHeader(lines[idx] ?? '')) {
      idx++;
    }
    return idx;
  },
  trimTrailingBlanks = (lines: readonly string[], endIdx: number, minIdx: number): number => {
    let idx = endIdx;
    while (idx > minIdx && (lines[idx - 1] ?? '').trim().length === 0) {
      idx--;
    }
    return idx;
  },
  findSectionEnd = (lines: readonly string[], sectionHeader: string): number => {
    const sectionIdx = lines.indexOf(sectionHeader);
    if (sectionIdx < 0) {
      return -1;
    }
    const rawEnd = skipToNextSection(lines, sectionIdx + 1);
    return trimTrailingBlanks(lines, rawEnd, sectionIdx + 1);
  };

export const enrichAssertions = (napContent: string, newAssertions: readonly string[]): string => {
  if (newAssertions.length === 0) {
    return napContent;
  }
  const lines = napContent.split('\n'),
    insertAt = findSectionEnd(lines, SECTION_ASSERT);
  if (insertAt < 0) {
    return napContent;
  }
  const before = lines.slice(0, insertAt),
    after = lines.slice(insertAt);
  return [...before, ...newAssertions, ...after].join('\n');
};

const findTripleQuoteBounds = (
  lines: readonly string[],
  startIdx: number,
): { readonly start: number; readonly end: number } | undefined => {
  let startQuote = -1;
  for (let i = startIdx; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === NAP_TRIPLE_QUOTE) {
      if (startQuote < 0) {
        startQuote = i;
      } else {
        return { start: startQuote, end: i };
      }
    }
  }
  return undefined;
};

export const enrichRequestBody = (napContent: string, newBody: string): string => {
  const lines = napContent.split('\n'),
    bodyIdx = lines.indexOf(SECTION_REQUEST_BODY);
  if (bodyIdx < 0) {
    return napContent;
  }
  const bounds = findTripleQuoteBounds(lines, bodyIdx + 1);
  if (bounds === undefined) {
    return napContent;
  }
  const before = lines.slice(0, bounds.start + 1),
    after = lines.slice(bounds.end);
  return [...before, newBody, ...after].join('\n');
};

export const reorderPlaylistSteps = (
  playlistContent: string,
  orderedFiles: readonly string[],
): string => {
  if (orderedFiles.length === 0) {
    return playlistContent;
  }
  const lines = playlistContent.split('\n'),
    stepsIdx = lines.indexOf(SECTION_STEPS);
  if (stepsIdx < 0) {
    return playlistContent;
  }
  const before = lines.slice(0, stepsIdx + 1),
    newSteps = orderedFiles.map((f) => (f.startsWith('./') ? f : `./${f}`));
  return [...before, ...newSteps, ''].join('\n');
};

// ─── File-level enrichment ──────────────────────────────────

const fileMatchesOperation = (file: GeneratedFile, operationId: string): boolean =>
  file.content.includes(operationId);

export const applyAssertionEnrichments = (
  files: readonly GeneratedFile[],
  enrichments: readonly AssertionEnrichment[],
): readonly GeneratedFile[] =>
  files.map((file) => {
    const match = enrichments.find((e) => fileMatchesOperation(file, e.operationId));
    if (match === undefined) {
      return file;
    }
    return {
      fileName: file.fileName,
      content: enrichAssertions(file.content, match.assertions),
    };
  });

export const applyTestDataEnrichments = (
  files: readonly GeneratedFile[],
  enrichments: readonly TestDataEnrichment[],
): readonly GeneratedFile[] =>
  files.map((file) => {
    const match = enrichments.find((e) => fileMatchesOperation(file, e.operationId));
    if (match === undefined) {
      return file;
    }
    return {
      fileName: file.fileName,
      content: enrichRequestBody(file.content, match.requestBody),
    };
  });

// ─── File scanning & summary extraction ─────────────────────

const NAME_PREFIX = 'name = ',
  BODY_PREFIX = 'body.',
  EXISTS_SUFFIX = ' exists',
  HTTP_METHOD_PREFIXES = [
    'GET ',
    'POST ',
    'PUT ',
    'PATCH ',
    'DELETE ',
    'HEAD ',
    'OPTIONS ',
  ] as const,
  isRequestLine = (line: string): boolean =>
    HTTP_METHOD_PREFIXES.some((prefix) => line.startsWith(prefix));

export const extractSummary = (file: GeneratedFile): OperationSummary => {
  const lines = file.content.split('\n'),
    nameLine = lines.find((l) => l.startsWith(NAME_PREFIX)),
    requestLine = lines.find(isRequestLine),
    name = nameLine?.slice(NAME_PREFIX.length) ?? file.fileName;
  return {
    operationId: name,
    method: requestLine?.split(' ')[0] ?? 'GET',
    path: requestLine?.split(' ')[1] ?? '',
    summary: name,
    responseFields: lines
      .filter((l) => l.startsWith(BODY_PREFIX) && l.includes(EXISTS_SUFFIX))
      .map((l) => l.slice(BODY_PREFIX.length, l.indexOf(EXISTS_SUFFIX))),
    hasRequestBody: file.content.includes(SECTION_REQUEST_BODY),
  };
};

const collectNapFiles = (dir: string, baseDir: string, out: GeneratedFile[]): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectNapFiles(full, baseDir, out);
    } else if (entry.name.endsWith(NAP_EXTENSION)) {
      out.push({
        fileName: path.relative(baseDir, full),
        content: fs.readFileSync(full, 'utf-8'),
      });
    }
  }
};

export const readGeneratedFiles = (outDir: string): readonly GeneratedFile[] => {
  const files: GeneratedFile[] = [];
  collectNapFiles(outDir, outDir, files);
  return files;
};
