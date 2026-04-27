// Implements [LSP-VSCODE-CURL]
// Specs: vscode-commands
// Curl copy command — delegates to LSP napper.copyCurl command.

import * as vscode from 'vscode';
import { MSG_COPIED } from './constants';
import { copyCurl } from './lspClient';

export const copyAsCurl = async (uri?: vscode.Uri): Promise<void> => {
  const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (fileUri === undefined) {
    return;
  }
  const curl = await copyCurl(fileUri);
  if (curl === undefined) {
    return;
  }
  await vscode.env.clipboard.writeText(curl);
  void vscode.window.showInformationMessage(MSG_COPIED);
};
