import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  activateExtension,
  getRegisteredCommands,
} from "../helpers/helpers";
import { downloadSpec, saveTempSpec } from "../../openApiImport";
import {
  CMD_IMPORT_OPENAPI_URL,
  CMD_IMPORT_OPENAPI_FILE,
  OPENAPI_URL_PLACEHOLDER,
  OPENAPI_DOWNLOAD_FAILED_PREFIX,
} from "../../constants";

const PETSTORE_URL = OPENAPI_URL_PLACEHOLDER;
const NONEXISTENT_URL = "https://httpbin.org/status/404";
const TEMP_SPEC_FILENAME = ".openapi-spec.json";

suite("OpenAPI Import", () => {
  suiteSetup(async function () {
    this.timeout(30_000);
    await activateExtension();
  });

  test("import URL command is registered", async () => {
    const commands = await getRegisteredCommands();
    assert.ok(
      commands.includes(CMD_IMPORT_OPENAPI_URL),
      `Command ${CMD_IMPORT_OPENAPI_URL} should be registered`
    );
  });

  test("import file command is registered", async () => {
    const commands = await getRegisteredCommands();
    assert.ok(
      commands.includes(CMD_IMPORT_OPENAPI_FILE),
      `Command ${CMD_IMPORT_OPENAPI_FILE} should be registered`
    );
  });

  test("downloadSpec fetches valid OpenAPI from petstore URL", async function () {
    this.timeout(30_000);
    const result = await downloadSpec(PETSTORE_URL);
    assert.ok(result.ok, "Download should succeed");
    const parsed: unknown = JSON.parse(result.value);
    const spec = parsed as { openapi?: string; paths?: Record<string, unknown> };
    assert.ok(
      spec.openapi !== undefined,
      "Downloaded spec must have an openapi version field"
    );
    assert.ok(
      spec.paths !== undefined,
      "Downloaded spec must have paths"
    );
    assert.ok(
      Object.keys(spec.paths ?? {}).length > 0,
      "Downloaded spec must have at least one path"
    );
  });

  test("downloadSpec returns error for 404 URL", async function () {
    this.timeout(15_000);
    const result = await downloadSpec(NONEXISTENT_URL);
    assert.ok(!result.ok, "Download should fail for 404");
    assert.ok(
      result.error.startsWith(OPENAPI_DOWNLOAD_FAILED_PREFIX),
      `Error should start with download failed prefix, got: ${result.error}`
    );
  });

  test("downloadSpec follows redirects", async function () {
    this.timeout(15_000);
    const redirectUrl = "https://httpbin.org/redirect-to?url=https%3A%2F%2Fpetstore3.swagger.io%2Fapi%2Fv3%2Fopenapi.json&status_code=302";
    const result = await downloadSpec(redirectUrl);
    assert.ok(result.ok, "Download should succeed after redirect");
    const parsed: unknown = JSON.parse(result.value);
    const spec = parsed as { openapi?: string };
    assert.ok(
      spec.openapi !== undefined,
      "Redirected spec must have openapi version field"
    );
  });

  test("saveTempSpec writes file and returns path", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "napper-test-"));
    const content = '{"openapi":"3.0.0","paths":{}}';
    const specPath = saveTempSpec(content, tmpDir);
    assert.ok(
      fs.existsSync(specPath),
      "Temp spec file must exist after save"
    );
    assert.ok(
      specPath.endsWith(TEMP_SPEC_FILENAME),
      `Spec path must end with ${TEMP_SPEC_FILENAME}`
    );
    const written = fs.readFileSync(specPath, "utf-8");
    assert.strictEqual(
      written,
      content,
      "Written content must match input"
    );
    // cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  test("saveTempSpec overwrites existing file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "napper-test-"));
    const first = '{"openapi":"3.0.0"}';
    const second = '{"openapi":"3.1.0","paths":{"/pets":{}}}';
    saveTempSpec(first, tmpDir);
    const specPath = saveTempSpec(second, tmpDir);
    const written = fs.readFileSync(specPath, "utf-8");
    assert.strictEqual(
      written,
      second,
      "Second write must overwrite the first"
    );
    fs.rmSync(tmpDir, { recursive: true });
  });
});
