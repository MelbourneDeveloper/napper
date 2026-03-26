// Specs: vscode-http-convert
// E2E tests — prove the .http → .nap conversion works through the actual
// VSCode extension commands and CodeLens, not by calling the CLI directly.
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  activateExtension,
  closeAllEditors,
  getRegisteredCommands,
  openDocument,
  sleep,
  waitForCondition,
} from '../helpers/helpers';
import {
  CMD_CONVERT_HTTP_DIR,
  CMD_CONVERT_HTTP_FILE,
  ENCODING_UTF8,
  NAP_EXTENSION,
  SECTION_ASSERT,
  SECTION_REQUEST,
} from '../../constants';

const FIXTURE_HTTP_FILE = 'sample.http';
const EXPECTED_REQUEST_COUNT = 3;

const workspaceRoot = (): string => {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder');
  }
  const [first] = folders;
  if (!first) {
    throw new Error('No workspace folder');
  }
  return first.uri.fsPath;
};

const collectNapFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir)
    .filter((f: string) => f.endsWith(NAP_EXTENSION))
    .map((f: string) => path.join(dir, f));

const generatedNapFilesInWorkspace = (): string[] => {
  const root = workspaceRoot();
  return collectNapFiles(root).filter((f) => {
    const content = fs.readFileSync(f, ENCODING_UTF8);
    return (
      content.includes('jsonplaceholder.typicode.com') &&
      content.includes(SECTION_REQUEST) &&
      !content.includes(SECTION_ASSERT)
    );
  });
};

const cleanupGeneratedNapFiles = (): void => {
  for (const f of generatedNapFilesInWorkspace()) {
    fs.unlinkSync(f);
  }
};

suite('HTTP Convert — Command Registration', () => {
  suiteSetup(async function () {
    this.timeout(30_000);
    await activateExtension();
  });

  test('convertHttpFile command is registered', async () => {
    const commands = await getRegisteredCommands();
    assert.ok(
      commands.includes(CMD_CONVERT_HTTP_FILE),
      `Command ${CMD_CONVERT_HTTP_FILE} must be registered`,
    );
  });

  test('convertHttpDirectory command is registered', async () => {
    const commands = await getRegisteredCommands();
    assert.ok(
      commands.includes(CMD_CONVERT_HTTP_DIR),
      `Command ${CMD_CONVERT_HTTP_DIR} must be registered`,
    );
  });
});

suite('HTTP Convert — CodeLens on .http files', () => {
  suiteSetup(async function () {
    this.timeout(30_000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("CodeLens 'Convert to .nap' appears on .http file", async function () {
    this.timeout(15_000);
    const doc = await openDocument(FIXTURE_HTTP_FILE);
    await sleep(3000);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri,
    );

    assert.ok(lenses.length > 0, 'Must have at least one CodeLens on .http file');

    const convertLens = lenses.find((l) => l.command?.command === CMD_CONVERT_HTTP_FILE);
    assert.ok(convertLens, `Must have a CodeLens with command ${CMD_CONVERT_HTTP_FILE}`);
    const title = convertLens.command?.title ?? '';
    assert.ok(
      title.includes('Convert to .nap'),
      `CodeLens title must contain "Convert to .nap", got: ${title}`,
    );
  });

  test('CodeLens passes file URI as argument', async function () {
    this.timeout(15_000);
    const doc = await openDocument(FIXTURE_HTTP_FILE);
    await sleep(3000);

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri,
    );

    const convertLens = lenses.find((l) => l.command?.command === CMD_CONVERT_HTTP_FILE);
    assert.ok(convertLens, 'Convert CodeLens must exist');
    assert.ok(convertLens.command?.arguments !== undefined, 'Convert CodeLens must have arguments');
    assert.ok(
      convertLens.command.arguments.length > 0,
      'Convert CodeLens must pass at least one argument (the file URI)',
    );
  });
});

suite('HTTP Convert — Execute via VSCode Command', () => {
  suiteSetup(async function () {
    this.timeout(30_000);
    await activateExtension();
    await sleep(3000);
    cleanupGeneratedNapFiles();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
    cleanupGeneratedNapFiles();
  });

  setup(() => {
    cleanupGeneratedNapFiles();
  });

  teardown(() => {
    cleanupGeneratedNapFiles();
  });

  test('executing convertHttpFile command with .http URI creates .nap files on disk', async function () {
    this.timeout(30_000);
    const httpFilePath = path.join(workspaceRoot(), FIXTURE_HTTP_FILE);
    assert.ok(fs.existsSync(httpFilePath), `Fixture .http file must exist at ${httpFilePath}`);

    const fixturePath = path.join(workspaceRoot(), 'post-jsonplaceholder.nap');
    assert.ok(fs.existsSync(fixturePath), 'Hand-written fixture must survive cleanup');

    const napFilesBefore = generatedNapFilesInWorkspace();
    assert.strictEqual(
      napFilesBefore.length,
      0,
      'No converted .nap files should exist before running command',
    );

    const fileUri = vscode.Uri.file(httpFilePath);
    await vscode.commands.executeCommand(CMD_CONVERT_HTTP_FILE, fileUri);

    await waitForCondition(() => generatedNapFilesInWorkspace().length > 0, 15_000);

    const napFilesAfter = generatedNapFilesInWorkspace();
    assert.strictEqual(
      napFilesAfter.length,
      EXPECTED_REQUEST_COUNT,
      `Command must produce exactly ${EXPECTED_REQUEST_COUNT} .nap files, got ${napFilesAfter.length}`,
    );
  });

  test('generated .nap files have [request] sections with correct content', async function () {
    this.timeout(30_000);
    const httpFilePath = path.join(workspaceRoot(), FIXTURE_HTTP_FILE),
      fileUri = vscode.Uri.file(httpFilePath);

    await vscode.commands.executeCommand(CMD_CONVERT_HTTP_FILE, fileUri);

    await waitForCondition(
      () => generatedNapFilesInWorkspace().length >= EXPECTED_REQUEST_COUNT,
      15_000,
    );

    const napFiles = generatedNapFilesInWorkspace();
    for (const napFile of napFiles) {
      const content = fs.readFileSync(napFile, ENCODING_UTF8);
      assert.ok(
        content.includes(SECTION_REQUEST),
        `${path.basename(napFile)} must contain [request] section`,
      );
      assert.ok(
        content.includes('jsonplaceholder.typicode.com'),
        `${path.basename(napFile)} must preserve the URL`,
      );
      assert.ok(content.length > 10, `${path.basename(napFile)} must have substantive content`);
      assert.ok(
        !content.includes(SECTION_ASSERT),
        `${path.basename(napFile)} must not have [assert] section (generated, not hand-written)`,
      );
      assert.ok(
        content.includes('method'),
        `${path.basename(napFile)} must specify an HTTP method`,
      );
    }
  });

  test('generated .nap files contain GET and POST methods from source .http', async function () {
    this.timeout(30_000);
    const httpFilePath = path.join(workspaceRoot(), FIXTURE_HTTP_FILE),
      fileUri = vscode.Uri.file(httpFilePath);

    await vscode.commands.executeCommand(CMD_CONVERT_HTTP_FILE, fileUri);

    await waitForCondition(
      () => generatedNapFilesInWorkspace().length >= EXPECTED_REQUEST_COUNT,
      15_000,
    );

    const napFiles = generatedNapFilesInWorkspace(),
      allContent = napFiles.map((f) => fs.readFileSync(f, ENCODING_UTF8)).join('\n');

    assert.ok(allContent.includes('GET'), 'Converted output must contain a GET request');
    assert.ok(allContent.includes('POST'), 'Converted output must contain a POST request');
  });

  test('POST .nap file preserves Content-Type header and JSON body', async function () {
    this.timeout(30_000);
    const httpFilePath = path.join(workspaceRoot(), FIXTURE_HTTP_FILE),
      fileUri = vscode.Uri.file(httpFilePath);

    await vscode.commands.executeCommand(CMD_CONVERT_HTTP_FILE, fileUri);

    await waitForCondition(
      () => generatedNapFilesInWorkspace().length >= EXPECTED_REQUEST_COUNT,
      15_000,
    );

    const napFiles = generatedNapFilesInWorkspace(),
      postFile = napFiles.find((f) => {
        const content = fs.readFileSync(f, ENCODING_UTF8);
        return content.includes('POST');
      });

    assert.ok(postFile !== undefined, 'Must have a .nap file containing POST method');

    const content = fs.readFileSync(postFile, ENCODING_UTF8);
    assert.ok(content.includes('Content-Type'), 'POST .nap must preserve Content-Type header');
    assert.ok(content.includes('application/json'), 'POST .nap must preserve application/json');
    assert.ok(content.includes('John Doe'), 'POST .nap must preserve request body content');
    assert.ok(
      content.includes('jsonplaceholder.typicode.com'),
      'POST .nap must preserve the target URL',
    );
    assert.ok(
      !content.includes(SECTION_ASSERT),
      'POST .nap must not have [assert] section (converter output)',
    );
  });

  test('running convert command twice does not fail', async function () {
    this.timeout(30_000);
    const httpFilePath = path.join(workspaceRoot(), FIXTURE_HTTP_FILE),
      fileUri = vscode.Uri.file(httpFilePath);

    await vscode.commands.executeCommand(CMD_CONVERT_HTTP_FILE, fileUri);
    await waitForCondition(() => generatedNapFilesInWorkspace().length > 0, 15_000);

    await vscode.commands.executeCommand(CMD_CONVERT_HTTP_FILE, fileUri);
    await sleep(3000);

    const napFiles = generatedNapFilesInWorkspace();
    assert.ok(
      napFiles.length >= EXPECTED_REQUEST_COUNT,
      `Must still have at least ${EXPECTED_REQUEST_COUNT} .nap files after re-running`,
    );
    for (const napFile of napFiles) {
      const content = fs.readFileSync(napFile, ENCODING_UTF8);
      assert.ok(
        content.includes(SECTION_REQUEST),
        `${path.basename(napFile)} must still have [request] after re-run`,
      );
      assert.ok(
        !content.includes(SECTION_ASSERT),
        `${path.basename(napFile)} must still be a generated file (no [assert]) after re-run`,
      );
    }
  });
});
