// Implements [LSP-VSCODE-CLIENT]
// Napper LSP client — spawns 'napper lsp' and connects via vscode-languageclient.
// Decoupled from the CLI resolver: receives the resolved cliPath.

import * as vscode from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { NAP_EXTENSION, NAPENV_EXTENSION, NAPLIST_EXTENSION } from './constants';

const LSP_CLIENT_ID = 'napper-lsp';
const LSP_CLIENT_NAME = 'Napper Language Server';
const LSP_SUBCOMMAND = 'lsp';

const documentSelector = [
  { scheme: 'file', language: 'nap' },
  { scheme: 'file', language: 'naplist' },
  { scheme: 'file', language: 'napenv' },
];

const filePattern = `**/*{${NAP_EXTENSION},${NAPLIST_EXTENSION},${NAPENV_EXTENSION}}`;

let client: LanguageClient | undefined;

const buildServerOptions = (cliPath: string): ServerOptions => ({
  command: cliPath,
  args: [LSP_SUBCOMMAND],
  transport: TransportKind.stdio,
});

const buildClientOptions = (outputChannel: vscode.OutputChannel): LanguageClientOptions => ({
  documentSelector,
  synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher(filePattern) },
  outputChannel,
});

/** Start the Napper language server using the resolved CLI path. */
export const startLspClient = (
  cliPath: string,
  outputChannel: vscode.OutputChannel,
  context: vscode.ExtensionContext,
): void => {
  if (client !== undefined) {
    return;
  }
  const serverOptions = buildServerOptions(cliPath);
  const clientOptions = buildClientOptions(outputChannel);
  const newClient = new LanguageClient(LSP_CLIENT_ID, LSP_CLIENT_NAME, serverOptions, clientOptions);
  client = newClient;
  void newClient.start();
  context.subscriptions.push(newClient);
};

/** Stop the Napper language server (called on deactivate). */
export const stopLspClient = async (): Promise<void> => {
  const current = client;
  if (current === undefined) {
    return;
  }
  client = undefined;
  await current.stop();
};

/**
 * Send napper.requestInfo custom command to the LSP.
 * Returns { method, url, headers } or undefined if LSP not available.
 */
export const requestInfo = async (
  uri: vscode.Uri,
): Promise<{ method: string; url: string; headers: Record<string, string> } | undefined> => {
  if (client === undefined) {
    return undefined;
  }
  const result = await client.sendRequest<
    { method: string; url: string; headers: Record<string, string> } | null
  >('workspace/executeCommand', {
    command: 'napper.requestInfo',
    arguments: [uri.toString()],
  });
  return result ?? undefined;
};

/**
 * Send napper.copyCurl custom command to the LSP.
 * Returns the curl string or undefined if LSP not available.
 */
export const copyCurl = async (uri: vscode.Uri): Promise<string | undefined> => {
  if (client === undefined) {
    return undefined;
  }
  const result = await client.sendRequest<string | null>('workspace/executeCommand', {
    command: 'napper.copyCurl',
    arguments: [uri.toString()],
  });
  return result ?? undefined;
};

/**
 * Send napper.listEnvironments custom command to the LSP.
 * Returns the list of env names or undefined if LSP not available.
 */
export const listEnvironments = async (rootUri: vscode.Uri): Promise<string[] | undefined> => {
  if (client === undefined) {
    return undefined;
  }
  const result = await client.sendRequest<string[] | null>('workspace/executeCommand', {
    command: 'napper.listEnvironments',
    arguments: [rootUri.toString()],
  });
  return result ?? undefined;
};
