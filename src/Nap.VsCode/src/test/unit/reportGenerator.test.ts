import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { generatePlaylistReport } from "../../reportGenerator";
import { type RunResult } from "../../types";
import {
  REPORT_FILE_SUFFIX,
  REPORT_FILE_EXTENSION,
} from "../../constants";

const MOCK_PASSED_STEP: RunResult = {
  file: "/workspace/petstore/list-pets.nap",
  passed: true,
  statusCode: 200,
  duration: 142,
  body: '{"pets":[]}',
  headers: { "content-type": "application/json" },
  assertions: [
    { target: "status", passed: true, expected: "200", actual: "200" },
  ],
};

const MOCK_FAILED_STEP: RunResult = {
  file: "/workspace/petstore/get-pet.nap",
  passed: false,
  statusCode: 404,
  duration: 87,
  error: "Not Found",
  body: '{"message":"not found"}',
  headers: { "content-type": "application/json" },
  assertions: [
    { target: "status", passed: false, expected: "200", actual: "404" },
  ],
};

const MOCK_SCRIPT_STEP: RunResult = {
  file: "/workspace/scripts/echo.fsx",
  passed: true,
  duration: 320,
  log: ["Hello from script", "Done"],
  assertions: [],
};

suite("Report Generator", () => {
  test("produces valid HTML document with playlist name", () => {
    const html = generatePlaylistReport("smoke", [MOCK_PASSED_STEP]);

    assert.ok(
      html.includes("<!DOCTYPE html>"),
      "Report must be a valid HTML document"
    );
    assert.ok(
      html.includes("smoke"),
      "Report must contain the playlist name in the hero"
    );
    assert.ok(
      html.includes("<title>"),
      "Report must have an HTML title element"
    );
  });

  test("shows all step file names and HTTP status codes", () => {
    const html = generatePlaylistReport("smoke", [
      MOCK_PASSED_STEP,
      MOCK_FAILED_STEP,
    ]);

    assert.ok(
      html.includes("list-pets.nap"),
      "Report must contain passed step file name"
    );
    assert.ok(
      html.includes("get-pet.nap"),
      "Report must contain failed step file name"
    );
    assert.ok(
      html.includes("200"),
      "Report must show 200 status code"
    );
    assert.ok(
      html.includes("404"),
      "Report must show 404 status code"
    );
  });

  test("shows PASSED and FAILED badges on individual steps", () => {
    const html = generatePlaylistReport("smoke", [
      MOCK_PASSED_STEP,
      MOCK_FAILED_STEP,
    ]);

    assert.ok(
      html.includes("PASSED"),
      "Report must show PASSED badge"
    );
    assert.ok(
      html.includes("FAILED"),
      "Report must show FAILED badge"
    );
  });

  test("shows step durations", () => {
    const html = generatePlaylistReport("smoke", [
      MOCK_PASSED_STEP,
      MOCK_FAILED_STEP,
    ]);

    assert.ok(html.includes("142ms"), "Report must show 142ms duration");
    assert.ok(html.includes("87ms"), "Report must show 87ms duration");
  });

  test("shows error details for failed steps", () => {
    const html = generatePlaylistReport("smoke", [MOCK_FAILED_STEP]);

    assert.ok(
      html.includes("Not Found"),
      "Report must show error message for failed step"
    );
    assert.ok(
      html.includes("error-box"),
      "Report must render error in styled error box"
    );
  });

  test("includes response headers section", () => {
    const html = generatePlaylistReport("smoke", [MOCK_PASSED_STEP]);

    assert.ok(
      html.includes("Response Headers"),
      "Report must have response headers section title"
    );
    assert.ok(
      html.includes("content-type"),
      "Report must show header key"
    );
    assert.ok(
      html.includes("application/json"),
      "Report must show header value"
    );
  });

  test("includes response body with JSON content", () => {
    const html = generatePlaylistReport("smoke", [MOCK_PASSED_STEP]);

    assert.ok(
      html.includes("Response Body"),
      "Report must have response body section title"
    );
    assert.ok(
      html.includes("pets"),
      "Report must show JSON content from response body"
    );
  });

  test("shows assertions with pass/fail indicators", () => {
    const html = generatePlaylistReport("smoke", [
      MOCK_PASSED_STEP,
      MOCK_FAILED_STEP,
    ]);

    assert.ok(
      html.includes("Assertions"),
      "Report must have assertions section"
    );
    assert.ok(
      html.includes("status"),
      "Report must show assertion target name"
    );
    assert.ok(
      html.includes("expected"),
      "Report must show expected vs actual for failures"
    );
  });

  test("calculates correct pass rate for mixed results", () => {
    const html = generatePlaylistReport("smoke", [
      MOCK_PASSED_STEP,
      MOCK_FAILED_STEP,
    ]);

    assert.ok(
      html.includes("50%"),
      "Report must show 50% pass rate for 1 of 2 passing"
    );
    assert.ok(
      html.includes("Pass Rate"),
      "Report must have pass rate stat card"
    );
  });

  test("shows 100% pass rate when all steps pass", () => {
    const html = generatePlaylistReport("smoke", [MOCK_PASSED_STEP]);

    assert.ok(
      html.includes("100%"),
      "Report must show 100% pass rate when all pass"
    );
    assert.ok(
      html.includes("All Steps Passed"),
      "Report must show all-passed status banner"
    );
  });

  test("shows summary stats: passed, failed, duration", () => {
    const html = generatePlaylistReport("smoke", [
      MOCK_PASSED_STEP,
      MOCK_FAILED_STEP,
    ]);

    assert.ok(html.includes("Duration"), "Report must show duration stat");
    assert.ok(html.includes("Passed"), "Report must show passed stat label");
    assert.ok(html.includes("Failed"), "Report must show failed stat label");
  });

  test("renders script step output/log section", () => {
    const html = generatePlaylistReport("scripts", [MOCK_SCRIPT_STEP]);

    assert.ok(
      html.includes("echo.fsx"),
      "Report must show script step file name"
    );
    assert.ok(
      html.includes("Hello from script"),
      "Report must show script log output"
    );
    assert.ok(
      html.includes("Output"),
      "Report must have output section title for script logs"
    );
  });

  test("has interactive expand/collapse for step details", () => {
    const html = generatePlaylistReport("smoke", [MOCK_PASSED_STEP]);

    assert.ok(
      html.includes("toggleStep"),
      "Report must have toggleStep function for expand/collapse"
    );
    assert.ok(
      html.includes("step-chevron"),
      "Report must have chevron indicators"
    );
  });

  test("zero results produces FAILED status, never PASSED", () => {
    const html = generatePlaylistReport("empty-run", []);

    assert.ok(
      html.includes("Some Steps Failed"),
      "Zero results must show failure status banner — playlist must NEVER pass by default"
    );
    assert.ok(
      !html.includes("All Steps Passed"),
      "Zero results must NOT show 'All Steps Passed' — 0 steps executed is a failure"
    );
    assert.ok(
      html.includes("0%"),
      "Zero results must show 0% pass rate"
    );
  });

  test("report file can be written to and read from disk", () => {
    const tmpDir = os.tmpdir();
    const reportPath = path.join(
      tmpDir,
      `test-playlist${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`
    );

    const html = generatePlaylistReport("test-playlist", [MOCK_PASSED_STEP]);
    fs.writeFileSync(reportPath, html, "utf-8");

    assert.ok(
      fs.existsSync(reportPath),
      "Report file must exist on disk after write"
    );

    const content = fs.readFileSync(reportPath, "utf-8");
    assert.ok(
      content.includes("<!DOCTYPE html>"),
      "Read-back content must be valid HTML"
    );
    assert.ok(
      content.includes("test-playlist"),
      "Read-back content must contain playlist name"
    );

    fs.unlinkSync(reportPath);
  });
});
