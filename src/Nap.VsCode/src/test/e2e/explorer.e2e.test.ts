import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import {
  activateExtension,
  sleep,
  getFixturePath,
  openDocument,
  closeAllEditors,
  writeFixtureFile,
  deleteFixtureFile,
} from "../helpers/helpers";
import type { ExtensionApi } from "../../extension";
import type { TreeNode } from "../../explorerProvider";
import {
  CONTEXT_PLAYLIST,
  CONTEXT_REQUEST_FILE,
  CONTEXT_PLAYLIST_SECTION,
} from "../../constants";

const EXTENSION_ID = "nimblesite.napper";

const getExplorerProvider = (): ExtensionApi["explorerProvider"] => {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  if (!ext) throw new Error(`Extension ${EXTENSION_ID} not found`);
  return ext.exports.explorerProvider;
};

const findNodeByLabel = (
  nodes: readonly TreeNode[],
  label: string
): TreeNode | undefined =>
  nodes.find((n: TreeNode) => n.label === label);

suite("Explorer Tree View", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("workspace contains .nap fixture files", () => {
    const httpbinPath = getFixturePath("get-httpbin.nap");
    assert.ok(
      fs.existsSync(httpbinPath),
      "get-httpbin.nap fixture should exist in workspace"
    );

    const postPath = getFixturePath("post-jsonplaceholder.nap");
    assert.ok(
      fs.existsSync(postPath),
      "post-jsonplaceholder.nap fixture should exist"
    );
  });

  test("workspace contains petstore subfolder with .nap files", () => {
    const listPetsPath = getFixturePath("petstore/list-pets.nap");
    assert.ok(
      fs.existsSync(listPetsPath),
      "petstore/list-pets.nap should exist"
    );

    const getPetPath = getFixturePath("petstore/get-pet.nap");
    assert.ok(
      fs.existsSync(getPetPath),
      "petstore/get-pet.nap should exist"
    );
  });

  test("workspace contains .naplist file", () => {
    const playlistPath = getFixturePath("petstore/smoke.naplist");
    assert.ok(
      fs.existsSync(playlistPath),
      "petstore/smoke.naplist should exist"
    );

    const content = fs.readFileSync(playlistPath, "utf-8");
    assert.ok(
      content.includes("[steps]"),
      "Playlist should have [steps] section"
    );
    assert.ok(
      content.includes("list-pets.nap"),
      "Playlist should reference list-pets.nap"
    );
  });

  test("opening a .nap file sets correct language mode", async function () {
    this.timeout(10000);
    const doc = await openDocument("get-httpbin.nap");
    assert.strictEqual(
      doc.languageId,
      "nap",
      "Language should be nap for .nap files"
    );
  });

  test("opening a .naplist file sets correct language mode", async function () {
    this.timeout(10000);
    const doc = await openDocument("petstore/smoke.naplist");
    assert.strictEqual(
      doc.languageId,
      "naplist",
      "Language should be naplist for .naplist files"
    );
  });

  test("file watcher detects new .nap file creation", async function () {
    this.timeout(15000);
    const testFileName = "temp-watcher-test.nap";

    writeFixtureFile(testFileName, "GET https://httpbin.org/status/200\n");
    await sleep(2000);

    const filePath = getFixturePath(testFileName);
    assert.ok(
      fs.existsSync(filePath),
      "Newly created .nap file should exist"
    );

    deleteFixtureFile(testFileName);
    await sleep(1000);
  });

  test(".nap file content is readable and valid", async function () {
    this.timeout(10000);
    const doc = await openDocument("post-jsonplaceholder.nap");
    const text = doc.getText();

    assert.ok(
      text.includes("[request]"),
      "Should have [request] section"
    );
    assert.ok(
      text.includes("[assert]"),
      "Should have [assert] section"
    );
    assert.ok(
      text.includes("jsonplaceholder.typicode.com"),
      "Should contain the API URL"
    );
  });

  test("nested playlist in tree view expands to show its own children", async function () {
    this.timeout(10000);
    const provider = getExplorerProvider();
    const rootNodes = await provider.getChildren();

    // Find the Playlists section
    const playlistSection = rootNodes.find(
      (n) => n.contextValue === CONTEXT_PLAYLIST_SECTION
    );
    assert.ok(
      playlistSection,
      "Tree must have a Playlists section"
    );
    assert.ok(
      playlistSection.children && playlistSection.children.length > 0,
      "Playlists section must have children"
    );

    // Find full.naplist — it references smoke.naplist (nested) and get-pet.nap
    const fullPlaylist = findNodeByLabel(playlistSection.children!, "full");
    assert.ok(
      fullPlaylist,
      "Playlists section must contain 'full' playlist (from full.naplist)"
    );
    assert.strictEqual(
      fullPlaylist.contextValue,
      CONTEXT_PLAYLIST,
      "full playlist must have playlist context"
    );
    assert.ok(
      fullPlaylist.children && fullPlaylist.children.length > 0,
      "full playlist must have children (its steps)"
    );

    // The nested smoke.naplist step must itself be a playlist with children
    const smokeChild = findNodeByLabel(fullPlaylist.children!, "smoke");
    assert.ok(
      smokeChild,
      "full playlist must contain 'smoke' as a child (the nested .naplist)"
    );
    assert.strictEqual(
      smokeChild.contextValue,
      CONTEXT_PLAYLIST,
      "Nested smoke.naplist must have playlist context, not requestFile"
    );
    assert.ok(
      smokeChild.children && smokeChild.children.length > 0,
      "Nested smoke.naplist MUST have its own children — it must be expandable"
    );

    // Verify smoke's children are the actual .nap step files
    const smokeChildLabels = smokeChild.children!.map((c) => c.label);
    assert.ok(
      smokeChildLabels.includes("list-pets"),
      "Nested smoke playlist must contain list-pets step"
    );
    assert.ok(
      smokeChildLabels.includes("get-pet"),
      "Nested smoke playlist must contain get-pet step"
    );

    // The get-pet.nap direct child of full.naplist is a leaf (not a playlist)
    const getPetChild = findNodeByLabel(fullPlaylist.children!, "get-pet");
    assert.ok(
      getPetChild,
      "full playlist must also contain 'get-pet' as a direct step"
    );
    assert.strictEqual(
      getPetChild.contextValue,
      CONTEXT_REQUEST_FILE,
      "get-pet.nap must be a requestFile (leaf node)"
    );
  });

  test("nested playlist in file tree also expands with children", async function () {
    this.timeout(10000);
    const provider = getExplorerProvider();
    const rootNodes = await provider.getChildren();

    // Find the petstore folder in the file tree
    const petstoreFolder = findNodeByLabel(rootNodes, "petstore");
    assert.ok(petstoreFolder, "File tree must contain petstore folder");

    const petstoreChildren = await provider.getChildren(petstoreFolder);

    // Find full.naplist in the petstore folder
    const fullNode = findNodeByLabel(petstoreChildren, "full");
    assert.ok(
      fullNode,
      "petstore folder must contain 'full' playlist node"
    );
    assert.ok(
      fullNode.children && fullNode.children.length > 0,
      "full playlist in file tree must have expandable children"
    );

    // The nested smoke.naplist must be a playlist with its own children
    const smokeInFileTree = findNodeByLabel(fullNode.children!, "smoke");
    assert.ok(
      smokeInFileTree,
      "full playlist in file tree must contain nested 'smoke' playlist"
    );
    assert.ok(
      smokeInFileTree.children && smokeInFileTree.children.length > 0,
      "Nested smoke.naplist in file tree MUST expand to show its own children"
    );
  });
});
