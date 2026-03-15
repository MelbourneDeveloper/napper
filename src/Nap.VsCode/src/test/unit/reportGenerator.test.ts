import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { generatePlaylistReport } from "../../reportGenerator";
import type { RunResult } from "../../types";
import {
  REPORT_FILE_EXTENSION,
  REPORT_FILE_SUFFIX,
  SECTION_LABEL_REQUEST,
  SECTION_LABEL_REQUEST_BODY,
  SECTION_LABEL_REQUEST_HEADERS,
  SECTION_LABEL_RESPONSE,
  SECTION_LABEL_RESPONSE_HEADERS,
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
},

 MOCK_FAILED_STEP: RunResult = {
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
},

 MOCK_SCRIPT_STEP: RunResult = {
  file: "/workspace/scripts/echo.fsx",
  passed: true,
  duration: 320,
  log: ["Hello from script", "Done"],
  assertions: [],
},

 MOCK_POST_STEP: RunResult = {
  file: "/workspace/petstore/create-pet.nap",
  passed: true,
  statusCode: 201,
  duration: 95,
  requestMethod: "POST",
  requestUrl: "https://api.petstore.io/v1/pets",
  requestHeaders: { "Content-Type": "application/json", "Authorization": "Bearer xyz" },
  requestBody: '{"name":"Fido","species":"dog"}',
  requestBodyContentType: "application/json",
  headers: { "content-type": "application/json", "location": "/v1/pets/42" },
  body: '{"id":42,"name":"Fido"}',
  assertions: [
    { target: "status", passed: true, expected: "201", actual: "201" },
  ],
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

  test("includes response headers inside Response group", () => {
    const html = generatePlaylistReport("smoke", [MOCK_PASSED_STEP]);

    assert.ok(
      html.includes(SECTION_LABEL_RESPONSE),
      "Report must have Response group"
    );
    assert.ok(
      html.includes(SECTION_LABEL_RESPONSE_HEADERS),
      "Report must have response headers section title inside Response group"
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

  test("includes response body with JSON content inside Response group", () => {
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

  test("step detail has collapsible Request group (closed by default)", () => {
    const html = generatePlaylistReport("smoke", [MOCK_POST_STEP]);

    assert.ok(
      html.includes("report-group"),
      "Report must use report-group class for collapsible groups"
    );
    assert.ok(
      html.includes(SECTION_LABEL_REQUEST),
      "Report must have a Request group"
    );
    const requestGroupMatch = html.indexOf(`>${SECTION_LABEL_REQUEST}<`),
     responseGroupMatch = html.indexOf(`>${SECTION_LABEL_RESPONSE}<`);
    assert.ok(requestGroupMatch > -1, "Request group title must exist");
    assert.ok(responseGroupMatch > -1, "Response group title must exist");
    assert.ok(
      requestGroupMatch < responseGroupMatch,
      "Request group must appear before Response group"
    );
  });

  test("step detail has collapsible Response group (open by default)", () => {
    const html = generatePlaylistReport("smoke", [MOCK_POST_STEP]);

    assert.ok(
      html.includes('<details class="report-group" open>'),
      "Response group must have the open attribute"
    );
  });

  test("Request group shows request URL and method", () => {
    const html = generatePlaylistReport("smoke", [MOCK_POST_STEP]);

    assert.ok(
      html.includes("https://api.petstore.io/v1/pets"),
      "Report must show the request URL"
    );
    assert.ok(
      html.includes("POST"),
      "Report must show the request method"
    );
    assert.ok(
      html.includes("request-method-tag"),
      "Request method must use the styled tag class"
    );
  });

  test("Request group shows request headers", () => {
    const html = generatePlaylistReport("smoke", [MOCK_POST_STEP]);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST_HEADERS),
      "Report must have Request Headers subsection"
    );
    assert.ok(
      html.includes("Authorization"),
      "Request headers must show Authorization key"
    );
    assert.ok(
      html.includes("Bearer xyz"),
      "Request headers must show Authorization value"
    );
  });

  test("Request group shows request body with content type", () => {
    const html = generatePlaylistReport("smoke", [MOCK_POST_STEP]);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST_BODY),
      "Report must have Request Body subsection"
    );
    assert.ok(
      html.includes("Fido"),
      "Request body must show JSON content"
    );
    assert.ok(
      html.includes("content-type-hint"),
      "Request body must show content type hint"
    );
  });

  test("Response group contains assertions, headers, and body", () => {
    const html = generatePlaylistReport("smoke", [MOCK_POST_STEP]);

    assert.ok(
      html.includes(SECTION_LABEL_RESPONSE),
      "Report must have Response group"
    );
    assert.ok(
      html.includes("Assertions"),
      "Response group must contain assertions"
    );
    assert.ok(
      html.includes(SECTION_LABEL_RESPONSE_HEADERS),
      "Response group must contain response headers"
    );
    assert.ok(
      html.includes("location"),
      "Response headers must show location key"
    );
    assert.ok(
      html.includes("Response Body"),
      "Response group must contain response body"
    );
  });

  test("Request group without URL/body still renders (no request details hint)", () => {
    const html = generatePlaylistReport("smoke", [MOCK_PASSED_STEP]);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST),
      "Report must have Request group even without URL"
    );
  });

  test("report file can be written to and read from disk", () => {
    const tmpDir = os.tmpdir(),
     reportPath = path.join(
      tmpDir,
      `test-playlist${REPORT_FILE_SUFFIX}${REPORT_FILE_EXTENSION}`
    ),

     html = generatePlaylistReport("test-playlist", [MOCK_PASSED_STEP]);
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
