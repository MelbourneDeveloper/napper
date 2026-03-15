// VSCode adapter for the environment switcher
// Status bar item and quick pick integration

import * as vscode from "vscode";
import { detectEnvironments } from "./environmentSwitcher";
import {
  NAPENV_GLOB,
  CONFIG_SECTION,
  CONFIG_DEFAULT_ENV,
  STATUS_BAR_PREFIX,
  STATUS_BAR_NO_ENV,
  STATUS_BAR_PRIORITY,
  CMD_SWITCH_ENV,
  PROMPT_SELECT_ENV,
} from "./constants";

export class EnvironmentStatusBar implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private _currentEnv: string;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      STATUS_BAR_PRIORITY
    );
    this._statusBarItem.command = CMD_SWITCH_ENV;

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    this._currentEnv = config.get<string>(CONFIG_DEFAULT_ENV, "");

    this._updateLabel();
    this._statusBarItem.show();

    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_DEFAULT_ENV}`)) {
          const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
          this._currentEnv = cfg.get<string>(CONFIG_DEFAULT_ENV, "");
          this._updateLabel();
        }
      })
    );
  }

  get currentEnv(): string {
    return this._currentEnv;
  }

  async showPicker(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      NAPENV_GLOB,
      "**/node_modules/**"
    );

    const envNames = detectEnvironments(files.map((f) => f.fsPath));
    const items = envNames.map((name) => ({
      label: name,
      picked: name === this._currentEnv,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: PROMPT_SELECT_ENV,
    });

    if (selected) {
      await this._applySelection(selected.label);
    }
  }

  private async _applySelection(envName: string): Promise<void> {
    this._currentEnv = envName;
    this._updateLabel();

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(
      CONFIG_DEFAULT_ENV,
      this._currentEnv,
      vscode.ConfigurationTarget.Workspace
    );
  }

  private _updateLabel(): void {
    const envDisplay = this._currentEnv || STATUS_BAR_NO_ENV;
    this._statusBarItem.text = `$(globe) ${STATUS_BAR_PREFIX}${envDisplay}`;
    this._statusBarItem.tooltip = `Active Napper environment: ${envDisplay}`;
  }

  dispose(): void {
    this._statusBarItem.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
