import * as assert from "assert";
import * as vscode from "vscode";
import {
  activateExtension,
  sleep,
  openDocument,
  closeAllEditors,
  executeCommand,
} from "../helpers/helpers";
import { CMD_COPY_CURL } from "../../constants";

suite("Copy as Curl", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test("copy curl for shorthand GET request", async function () {
    this.timeout(15000);
    const doc = await openDocument("get-httpbin.nap");
    await sleep(1000);

    await executeCommand(CMD_COPY_CURL, doc.uri);
    await sleep(1000);

    const clipboard = await vscode.env.clipboard.readText();
    assert.ok(
      clipboard.includes("curl"),
      "Clipboard should contain curl command"
    );
    assert.ok(
      clipboard.includes("httpbin.org/get"),
      "Clipboard should contain the request URL"
    );
    assert.ok(
      clipboard.includes("GET"),
      "Clipboard should contain GET method"
    );
  });

  test("copy curl for POST request with [request] section", async function () {
    this.timeout(15000);
    const doc = await openDocument("post-jsonplaceholder.nap");
    await sleep(1000);

    await executeCommand(CMD_COPY_CURL, doc.uri);
    await sleep(1000);

    const clipboard = await vscode.env.clipboard.readText();
    assert.ok(
      clipboard.includes("curl"),
      "Clipboard should contain curl"
    );
    assert.ok(
      clipboard.includes("POST"),
      "Clipboard should contain POST method"
    );
    assert.ok(
      clipboard.includes("jsonplaceholder.typicode.com"),
      "Clipboard should contain the URL"
    );
  });

  test("copy curl for GET with [request] section", async function () {
    this.timeout(15000);
    const doc = await openDocument("petstore/list-pets.nap");
    await sleep(1000);

    await executeCommand(CMD_COPY_CURL, doc.uri);
    await sleep(1000);

    const clipboard = await vscode.env.clipboard.readText();
    assert.ok(
      clipboard.includes("curl"),
      "Clipboard should contain curl"
    );
    assert.ok(
      clipboard.includes("petstore.swagger.io"),
      "Clipboard should contain petstore URL"
    );
  });
});
