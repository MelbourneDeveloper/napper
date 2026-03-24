// Specs: vscode-openapi, vscode-openapi-import
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { activateExtension, getRegisteredCommands, readFixtureFile } from '../helpers/helpers';
import { downloadSpec, saveTempSpec } from '../../openApiImport';
import {
  BASE_URL_KEY,
  CLI_CMD_GENERATE,
  CLI_FLAG_OUTPUT,
  CLI_FLAG_OUTPUT_DIR,
  CLI_OUTPUT_JSON,
  CLI_SPAWN_FAILED_PREFIX,
  CLI_SUBCMD_OPENAPI,
  CMD_IMPORT_OPENAPI_FILE,
  CMD_IMPORT_OPENAPI_URL,
  CONFIG_CLI_PATH,
  CONFIG_SECTION,
  DEFAULT_CLI_PATH,
  ENCODING_UTF8,
  NAPENV_EXTENSION,
  NAP_EXTENSION,
  OPENAPI_DOWNLOAD_FAILED_PREFIX,
  OPENAPI_URL_PLACEHOLDER,
  SECTION_ASSERT,
  SECTION_META,
  SECTION_REQUEST,
  SECTION_STEPS,
} from '../../constants';

const PETSTORE_URL = OPENAPI_URL_PLACEHOLDER,
  BEECEPTOR_URL = 'https://beeceptor.com/docs/storefront-sample.json',
  BEECEPTOR_EXPECTED_ENDPOINTS = 11,
  BEECEPTOR_BASE_URL_DOMAIN = 'api.demo-ecommerce.com',
  BEECEPTOR_AUTH_REGISTER_PATH = '/auth/register',
  BEECEPTOR_CHECKOUT_PATH = '/checkout',
  BEECEPTOR_SPEC_TITLE = 'E-commerce API',
  NONEXISTENT_URL = 'https://httpbin.org/status/404',
  TEMP_SPEC_FILENAME = '.openapi-spec.json';

suite('OpenAPI Import', () => {
  suiteSetup(async function () {
    this.timeout(30_000);
    await activateExtension();
  });

  test('import URL command is registered', async () => {
    const commands = await getRegisteredCommands();
    assert.ok(
      commands.includes(CMD_IMPORT_OPENAPI_URL),
      `Command ${CMD_IMPORT_OPENAPI_URL} should be registered`,
    );
  });

  test('import file command is registered', async () => {
    const commands = await getRegisteredCommands();
    assert.ok(
      commands.includes(CMD_IMPORT_OPENAPI_FILE),
      `Command ${CMD_IMPORT_OPENAPI_FILE} should be registered`,
    );
  });

  test('downloadSpec fetches valid OpenAPI from petstore URL', async function () {
    this.timeout(30_000);
    const result = await downloadSpec(PETSTORE_URL);
    assert.ok(result.ok, 'Download should succeed');
    const parsed: unknown = JSON.parse(result.value),
      spec = parsed as { openapi?: string; paths?: Record<string, unknown> };
    assert.ok(spec.openapi !== undefined, 'Downloaded spec must have an openapi version field');
    assert.ok(spec.paths !== undefined, 'Downloaded spec must have paths');
    assert.ok(
      Object.keys(spec.paths ?? {}).length > 0,
      'Downloaded spec must have at least one path',
    );
  });

  test('downloadSpec returns error for 404 URL', async function () {
    this.timeout(15_000);
    const result = await downloadSpec(NONEXISTENT_URL);
    assert.ok(!result.ok, 'Download should fail for 404');
    assert.ok(
      result.error.startsWith(OPENAPI_DOWNLOAD_FAILED_PREFIX),
      `Error should start with download failed prefix, got: ${result.error}`,
    );
  });

  test('downloadSpec follows redirects', async function () {
    this.timeout(15_000);
    const redirectUrl =
        'https://httpbin.org/redirect-to?url=https%3A%2F%2Fpetstore3.swagger.io%2Fapi%2Fv3%2Fopenapi.json&status_code=302',
      result = await downloadSpec(redirectUrl);
    assert.ok(result.ok, 'Download should succeed after redirect');
    const parsed: unknown = JSON.parse(result.value),
      spec = parsed as { openapi?: string };
    assert.ok(spec.openapi !== undefined, 'Redirected spec must have openapi version field');
  });

  test('saveTempSpec writes file and returns path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napper-test-')),
      content = '{"openapi":"3.0.0","paths":{}}',
      specPath = saveTempSpec(content, tmpDir);
    assert.ok(fs.existsSync(specPath), 'Temp spec file must exist after save');
    assert.ok(
      specPath.endsWith(TEMP_SPEC_FILENAME),
      `Spec path must end with ${TEMP_SPEC_FILENAME}`,
    );
    const written = fs.readFileSync(specPath, 'utf-8');
    assert.strictEqual(written, content, 'Written content must match input');
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('saveTempSpec overwrites existing file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napper-test-')),
      first = '{"openapi":"3.0.0"}',
      second = '{"openapi":"3.1.0","paths":{"/pets":{}}}';
    saveTempSpec(first, tmpDir);
    const specPath = saveTempSpec(second, tmpDir),
      written = fs.readFileSync(specPath, 'utf-8');
    assert.strictEqual(written, second, 'Second write must overwrite the first');
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ─── CLI generate openapi E2E ────────────────────────────────

const ECOMMERCE_SPEC_FIXTURE = 'ecommerce-spec.json',
  EXPECTED_ENDPOINT_COUNT = 11,
  resolveCliPath = (): string => {
    const configured = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<string>(CONFIG_CLI_PATH, '');
    return configured.length > 0 ? configured : DEFAULT_CLI_PATH;
  },
  runCliGenerate = async (specPath: string, outDir: string): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      execFile(
        resolveCliPath(),
        [
          CLI_CMD_GENERATE,
          CLI_SUBCMD_OPENAPI,
          specPath,
          CLI_FLAG_OUTPUT_DIR,
          outDir,
          CLI_FLAG_OUTPUT,
          CLI_OUTPUT_JSON,
        ],
        { timeout: 30_000 },
        (error: Error | null, stdout: string, stderr: string) => {
          if (error !== null && stdout.length === 0) {
            reject(new Error(`${CLI_SPAWN_FAILED_PREFIX}${stderr}`));
            return;
          }
          resolve(stdout);
        },
      );
    }),
  collectNapFiles = (dir: string): string[] =>
    fs
      .readdirSync(dir)
      .filter((f: string) => f.endsWith(NAP_EXTENSION))
      .map((f: string) => path.join(dir, f));

suite('OpenAPI CLI Generate', () => {
  suiteSetup(async function () {
    this.timeout(30_000);
    await activateExtension();
  });

  test('CLI generates .nap files from ecommerce spec', async function () {
    this.timeout(30_000);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napper-generate-'));

    try {
      const specContent = readFixtureFile(ECOMMERCE_SPEC_FIXTURE),
        specPath = path.join(tmpDir, ECOMMERCE_SPEC_FIXTURE);
      fs.writeFileSync(specPath, specContent, ENCODING_UTF8);

      const stdout = await runCliGenerate(specPath, tmpDir),
        generated = JSON.parse(stdout) as { files: number; playlist: string };

      assert.strictEqual(
        generated.files,
        EXPECTED_ENDPOINT_COUNT,
        `CLI must generate exactly ${EXPECTED_ENDPOINT_COUNT} .nap files`,
      );

      const playlistPath = path.join(tmpDir, generated.playlist);
      assert.ok(fs.existsSync(playlistPath), `Playlist file must exist at ${generated.playlist}`);

      const playlistContent = fs.readFileSync(playlistPath, ENCODING_UTF8);
      assert.ok(playlistContent.includes(SECTION_META), 'Playlist must have [meta] section');
      assert.ok(playlistContent.includes(SECTION_STEPS), 'Playlist must have [steps] section');

      const napenvPath = path.join(tmpDir, NAPENV_EXTENSION);
      assert.ok(fs.existsSync(napenvPath), '.napenv file must exist with base URL');

      const envContent = fs.readFileSync(napenvPath, ENCODING_UTF8);
      assert.ok(envContent.includes(BASE_URL_KEY), '.napenv must contain baseUrl key');

      const napFiles = collectNapFiles(tmpDir);
      assert.strictEqual(
        napFiles.length,
        EXPECTED_ENDPOINT_COUNT,
        `Must find exactly ${EXPECTED_ENDPOINT_COUNT} .nap files on disk`,
      );

      for (const napFile of napFiles) {
        const content = fs.readFileSync(napFile, ENCODING_UTF8);
        assert.ok(
          content.includes(SECTION_META),
          `${path.basename(napFile)} must have [meta] section`,
        );
        assert.ok(
          content.includes(SECTION_REQUEST),
          `${path.basename(napFile)} must have [request] section`,
        );
        assert.ok(
          content.includes(SECTION_ASSERT),
          `${path.basename(napFile)} must have [assert] section`,
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ─── Beeceptor URL → CLI generate E2E ───────────────────────
// Proves the URL content drives generated output — not a fixture

suite('OpenAPI URL-to-Generate E2E (Beeceptor)', () => {
  suiteSetup(async function () {
    this.timeout(30_000);
    await activateExtension();
  });

  test('downloadSpec + CLI generate produces beeceptor-specific output', async function () {
    this.timeout(60_000);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napper-beeceptor-'));

    try {
      const specResult = await downloadSpec(BEECEPTOR_URL);
      assert.ok(
        specResult.ok,
        `Beeceptor URL download must succeed, got: ${specResult.ok ? '' : specResult.error}`,
      );

      const specPath = saveTempSpec(specResult.value, tmpDir);
      assert.ok(
        fs.existsSync(specPath),
        'Temp spec file must exist after saving downloaded content',
      );

      const stdout = await runCliGenerate(specPath, tmpDir),
        generated = JSON.parse(stdout) as { files: number; playlist: string };

      assert.strictEqual(
        generated.files,
        BEECEPTOR_EXPECTED_ENDPOINTS,
        `Beeceptor spec must produce exactly ${BEECEPTOR_EXPECTED_ENDPOINTS} endpoints`,
      );

      const napenvPath = path.join(tmpDir, NAPENV_EXTENSION),
        envContent = fs.readFileSync(napenvPath, ENCODING_UTF8);
      assert.ok(
        envContent.includes(BEECEPTOR_BASE_URL_DOMAIN),
        `Environment must contain beeceptor base URL domain ${BEECEPTOR_BASE_URL_DOMAIN}`,
      );

      const playlistPath = path.join(tmpDir, generated.playlist),
        playlistContent = fs.readFileSync(playlistPath, ENCODING_UTF8);
      assert.ok(
        playlistContent.includes(BEECEPTOR_SPEC_TITLE),
        `Playlist must contain beeceptor spec title "${BEECEPTOR_SPEC_TITLE}"`,
      );

      const napFiles = collectNapFiles(tmpDir);
      const hasAuthRegister = napFiles.some((f: string) => {
        const content = fs.readFileSync(f, ENCODING_UTF8);
        return content.includes(BEECEPTOR_AUTH_REGISTER_PATH);
      });
      assert.ok(hasAuthRegister, 'Must have auth/register endpoint from beeceptor spec');

      const hasCheckout = napFiles.some((f: string) => {
        const content = fs.readFileSync(f, ENCODING_UTF8);
        return content.includes(BEECEPTOR_CHECKOUT_PATH);
      });
      assert.ok(hasCheckout, 'Must have checkout endpoint from beeceptor spec');

      for (const napFile of napFiles) {
        const content = fs.readFileSync(napFile, ENCODING_UTF8);
        assert.ok(
          content.includes(SECTION_META),
          `${path.basename(napFile)} must have [meta] section`,
        );
        assert.ok(
          content.includes(SECTION_REQUEST),
          `${path.basename(napFile)} must have [request] section`,
        );
        assert.ok(
          content.includes(SECTION_ASSERT),
          `${path.basename(napFile)} must have [assert] section`,
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('beeceptor URL produces different output than petstore URL', async function () {
    this.timeout(60_000);
    const beeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napper-bee-')),
      petDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napper-pet-'));

    try {
      const beeResult = await downloadSpec(BEECEPTOR_URL);
      assert.ok(beeResult.ok, 'Beeceptor download must succeed');
      const beePath = saveTempSpec(beeResult.value, beeDir);
      await runCliGenerate(beePath, beeDir);

      const petResult = await downloadSpec(PETSTORE_URL);
      assert.ok(petResult.ok, 'Petstore download must succeed');
      const petPath = saveTempSpec(petResult.value, petDir);
      await runCliGenerate(petPath, petDir);

      const beeEnv = fs.readFileSync(path.join(beeDir, NAPENV_EXTENSION), ENCODING_UTF8),
        petEnv = fs.readFileSync(path.join(petDir, NAPENV_EXTENSION), ENCODING_UTF8);

      assert.ok(
        beeEnv.includes(BEECEPTOR_BASE_URL_DOMAIN),
        'Beeceptor env must have beeceptor domain',
      );
      assert.ok(
        !petEnv.includes(BEECEPTOR_BASE_URL_DOMAIN),
        'Petstore env must NOT have beeceptor domain',
      );

      const beeNaps = collectNapFiles(beeDir),
        petNaps = collectNapFiles(petDir);
      assert.notStrictEqual(
        beeNaps.length,
        petNaps.length,
        'Different specs must produce different number of files',
      );
    } finally {
      fs.rmSync(beeDir, { recursive: true });
      fs.rmSync(petDir, { recursive: true });
    }
  });
});
