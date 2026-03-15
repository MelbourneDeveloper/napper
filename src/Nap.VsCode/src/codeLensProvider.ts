// CodeLens provider for .nap and .naplist files
// Shows "Run" and "Copy as curl" actions above key sections

import * as vscode from "vscode";
import {
  SECTION_REQUEST,
  SECTION_META,
  CMD_RUN_FILE,
  CMD_COPY_CURL,
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  HTTP_METHODS,
} from "./constants";

const RUN_LENS_TITLE = "$(play) Run";
const COPY_CURL_TITLE = "$(clippy) Copy as curl";
const RUN_PLAYLIST_TITLE = "$(play) Run Playlist";

const makeRunLens = (
  range: vscode.Range,
  uri: vscode.Uri
): vscode.CodeLens =>
  new vscode.CodeLens(range, {
    title: RUN_LENS_TITLE,
    command: CMD_RUN_FILE,
    arguments: [uri],
  });

const makeCurlLens = (
  range: vscode.Range,
  uri: vscode.Uri
): vscode.CodeLens =>
  new vscode.CodeLens(range, {
    title: COPY_CURL_TITLE,
    command: CMD_COPY_CURL,
    arguments: [uri],
  });

const isShorthandMethod = (line: string): boolean =>
  HTTP_METHODS.some((m) => line.startsWith(`${m} `));

const buildRequestLenses = (
  document: vscode.TextDocument
): vscode.CodeLens[] => {
  const lenses: vscode.CodeLens[] = [];
  const firstLine = document.lineAt(0).text.trim();

  if (isShorthandMethod(firstLine)) {
    const range = new vscode.Range(0, 0, 0, firstLine.length);
    lenses.push(makeRunLens(range, document.uri));
    lenses.push(makeCurlLens(range, document.uri));
  }

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    if (line === SECTION_REQUEST) {
      const range = new vscode.Range(i, 0, i, line.length);
      lenses.push(makeRunLens(range, document.uri));
      lenses.push(makeCurlLens(range, document.uri));
    }
  }

  return lenses;
};

const buildPlaylistLenses = (
  document: vscode.TextDocument
): vscode.CodeLens[] => {
  const lenses: vscode.CodeLens[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    if (line === SECTION_META) {
      const range = new vscode.Range(i, 0, i, line.length);
      lenses.push(
        new vscode.CodeLens(range, {
          title: RUN_PLAYLIST_TITLE,
          command: CMD_RUN_FILE,
          arguments: [document.uri],
        })
      );
    }
  }

  return lenses;
};

export class CodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses =
    new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const isNap = document.fileName.endsWith(NAP_EXTENSION);
    const isNapList = document.fileName.endsWith(NAPLIST_EXTENSION);

    if (isNap) {return buildRequestLenses(document);}
    if (isNapList) {return buildPlaylistLenses(document);}
    return [];
  }
}
