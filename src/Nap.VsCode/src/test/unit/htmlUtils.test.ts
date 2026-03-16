// Specs: vscode-layout
import * as assert from "assert";
import {
  buildResultDetailHtml,
  buildRequestGroupHtml,
  buildResponseGroupHtml,
  buildErrorHtml,
  buildLogHtml,
  buildCollapsibleSection,
  buildHeadersTableRows,
  escapeHtml,
  formatBodyHtml,
  highlightJson,
} from "../../htmlUtils";
import type { RunResult } from "../../types";
import {
  NO_REQUEST_HEADERS,
  SECTION_LABEL_ASSERTIONS,
  SECTION_LABEL_BODY,
  SECTION_LABEL_ERROR,
  SECTION_LABEL_OUTPUT,
  SECTION_LABEL_REQUEST,
  SECTION_LABEL_REQUEST_BODY,
  SECTION_LABEL_REQUEST_HEADERS,
  SECTION_LABEL_RESPONSE,
  SECTION_LABEL_RESPONSE_HEADERS,
} from "../../constants";

const MOCK_FULL_RESULT: RunResult = {
  file: "/workspace/api/get-users.nap",
  passed: true,
  statusCode: 200,
  duration: 150,
  requestMethod: "GET",
  requestUrl: "https://api.example.com/users",
  requestHeaders: { "Authorization": "Bearer tok123", "Accept": "application/json" },
  headers: { "content-type": "application/json", "x-request-id": "abc-def" },
  body: '{"users":[{"id":1}]}',
  assertions: [
    { target: "status", passed: true, expected: "200", actual: "200" },
    { target: "headers.Content-Type", passed: true, expected: "application/json", actual: "application/json" },
  ],
},

 MOCK_FAILED_RESULT: RunResult = {
  file: "/workspace/api/delete-user.nap",
  passed: false,
  statusCode: 403,
  duration: 42,
  requestMethod: "DELETE",
  requestUrl: "https://api.example.com/users/99",
  requestHeaders: {},
  headers: { "content-type": "text/plain" },
  body: "Forbidden",
  error: "Access denied: insufficient permissions",
  assertions: [
    { target: "status", passed: false, expected: "200", actual: "403" },
  ],
},

 MOCK_MINIMAL_RESULT: RunResult = {
  file: "/workspace/api/health.nap",
  passed: true,
  assertions: [],
},

 MOCK_SCRIPT_RESULT: RunResult = {
  file: "/workspace/scripts/setup.fsx",
  passed: true,
  duration: 500,
  log: ["Seeding database...", "Created 10 records", "Done"],
  assertions: [],
},

 MOCK_NO_URL_RESULT: RunResult = {
  file: "/workspace/api/check.nap",
  passed: true,
  statusCode: 200,
  requestHeaders: { "Accept": "text/html" },
  headers: { "content-type": "text/html" },
  body: "<html></html>",
  assertions: [
    { target: "status", passed: true, expected: "200", actual: "200" },
  ],
},

 MOCK_XSS_RESULT: RunResult = {
  file: "/workspace/api/xss.nap",
  passed: false,
  statusCode: 200,
  requestMethod: "POST",
  requestUrl: "https://api.example.com/search?q=<script>alert(1)</script>",
  requestHeaders: { "X-Evil": "<img onerror=alert(1)>" },
  headers: { "x-injected": "val\"onmouseover=alert(1)" },
  body: '{"msg":"<script>steal()</script>"}',
  error: "Error: <b>bold injection</b>",
  log: ["Log line with <script>alert('xss')</script>"],
  assertions: [
    {
      target: "body.<script>",
      passed: false,
      expected: "<expected>",
      actual: "<actual>",
    },
  ],
},

 MOCK_EMPTY_BODY_RESULT: RunResult = {
  file: "/workspace/api/no-content.nap",
  passed: true,
  statusCode: 204,
  body: "",
  headers: {},
  assertions: [],
},

 MOCK_INVALID_JSON_BODY: RunResult = {
  file: "/workspace/api/text-response.nap",
  passed: true,
  statusCode: 200,
  body: "this is not json {{{",
  headers: { "content-type": "text/plain" },
  assertions: [],
},

 MOCK_POST_WITH_BODY: RunResult = {
  file: "/workspace/api/create-user.nap",
  passed: true,
  statusCode: 201,
  duration: 200,
  requestMethod: "POST",
  requestUrl: "https://api.example.com/users",
  requestHeaders: { "Content-Type": "application/json", "Authorization": "Bearer abc" },
  requestBody: '{"name":"Alice","email":"alice@example.com"}',
  requestBodyContentType: "application/json",
  headers: { "content-type": "application/json" },
  body: '{"id":42,"name":"Alice"}',
  assertions: [
    { target: "status", passed: true, expected: "201", actual: "201" },
  ],
},

 MOCK_POST_PLAIN_TEXT_BODY: RunResult = {
  file: "/workspace/api/submit-text.nap",
  passed: true,
  statusCode: 200,
  requestMethod: "POST",
  requestUrl: "https://api.example.com/text",
  requestBody: "Hello, this is plain text content",
  requestBodyContentType: "text/plain",
  headers: {},
  assertions: [],
},

 MOCK_POST_NO_BODY: RunResult = {
  file: "/workspace/api/trigger-action.nap",
  passed: true,
  statusCode: 200,
  requestMethod: "POST",
  requestUrl: "https://api.example.com/trigger",
  requestHeaders: { "X-Action": "go" },
  headers: {},
  assertions: [],
},

 MOCK_XSS_REQUEST_BODY: RunResult = {
  file: "/workspace/api/xss-body.nap",
  passed: true,
  statusCode: 200,
  requestMethod: "POST",
  requestUrl: "https://api.example.com/data",
  requestBody: '<script>alert("xss")</script>',
  requestBodyContentType: '<img onerror="alert(1)">',
  headers: {},
  assertions: [],
};

suite("Result Detail HTML — Request/Response grouping", () => {
  test("output has a Request details section that is NOT open", () => {
    const html = buildResultDetailHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes(`<details class="section">`),
      "Request section must be a <details> element WITHOUT the open attribute"
    );
    assert.ok(
      html.includes(SECTION_LABEL_REQUEST),
      "Request section must have the Request title"
    );
  });

  test("output has a Response details section that IS open", () => {
    const html = buildResultDetailHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes(`<details class="section" open>`),
      "Response section must be a <details> element WITH the open attribute"
    );
    assert.ok(
      html.includes(SECTION_LABEL_RESPONSE),
      "Response section must have the Response title"
    );
  });

  test("Request section appears before Response section", () => {
    const html = buildResultDetailHtml(MOCK_FULL_RESULT),
     requestIdx = html.indexOf(SECTION_LABEL_REQUEST),
     responseIdx = html.indexOf(SECTION_LABEL_RESPONSE);

    assert.ok(requestIdx > -1, "Request section must exist");
    assert.ok(responseIdx > -1, "Response section must exist");
    assert.ok(
      requestIdx < responseIdx,
      "Request section must appear before Response section in the DOM"
    );
  });

  test("Request section contains the request URL and method", () => {
    const html = buildRequestGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes("https://api.example.com/users"),
      "Request section must contain the request URL"
    );
    assert.ok(
      html.includes("GET"),
      "Request section must contain the HTTP method"
    );
    assert.ok(
      html.includes("request-url"),
      "Request URL must use the request-url CSS class"
    );
    assert.ok(
      html.includes("request-method"),
      "HTTP method must use the request-method CSS class"
    );
  });

  test("Request section contains request headers", () => {
    const html = buildRequestGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST_HEADERS),
      "Request section must have a Request Headers subsection"
    );
    assert.ok(
      html.includes("Authorization"),
      "Request headers must include the Authorization header key"
    );
    assert.ok(
      html.includes("Bearer tok123"),
      "Request headers must include the Authorization header value"
    );
    assert.ok(
      html.includes("Accept"),
      "Request headers must include the Accept header key"
    );
  });

  test("Response section contains assertions", () => {
    const html = buildResponseGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes(SECTION_LABEL_ASSERTIONS),
      "Response section must have an Assertions subsection"
    );
    assert.ok(
      html.includes("status"),
      "Assertions must include the status assertion target"
    );
    assert.ok(
      html.includes("headers.Content-Type"),
      "Assertions must include the Content-Type assertion target"
    );
  });

  test("Response section contains response headers", () => {
    const html = buildResponseGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes(SECTION_LABEL_RESPONSE_HEADERS),
      "Response section must have a Response Headers subsection"
    );
    assert.ok(
      html.includes("content-type"),
      "Response headers must include the content-type key"
    );
    assert.ok(
      html.includes("x-request-id"),
      "Response headers must include the x-request-id key"
    );
    assert.ok(
      html.includes("abc-def"),
      "Response headers must include the x-request-id value"
    );
  });

  test("Response section contains response body", () => {
    const html = buildResponseGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes(SECTION_LABEL_BODY),
      "Response section must have a Body subsection"
    );
    assert.ok(
      html.includes("users"),
      "Body must contain the JSON key from the response"
    );
  });
});

suite("Result Detail HTML — Error and Log sections", () => {
  test("error section is open and appears before request/response groups", () => {
    const html = buildResultDetailHtml(MOCK_FAILED_RESULT),
     errorIdx = html.indexOf(SECTION_LABEL_ERROR),
     requestIdx = html.indexOf(SECTION_LABEL_REQUEST);

    assert.ok(errorIdx > -1, "Error section must exist for failed results");
    assert.ok(
      errorIdx < requestIdx,
      "Error section must appear before the Request group"
    );
    assert.ok(
      html.includes("Access denied: insufficient permissions"),
      "Error section must show the error message"
    );
  });

  test("error section uses open details element", () => {
    const html = buildErrorHtml("Something went wrong");
    const detailsMatch = html.indexOf('<details class="section" open>');

    assert.ok(
      detailsMatch > -1,
      "Error section must be an open <details> element"
    );
  });

  test("no error section when error is undefined", () => {
    const html = buildErrorHtml(undefined);
    assert.strictEqual(html, "", "Error HTML must be empty when error is undefined");
  });

  test("no error section when error is empty string", () => {
    const html = buildErrorHtml("");
    assert.strictEqual(html, "", "Error HTML must be empty when error is empty string");
  });

  test("log section appears and shows all log lines", () => {
    const html = buildResultDetailHtml(MOCK_SCRIPT_RESULT);

    assert.ok(
      html.includes(SECTION_LABEL_OUTPUT),
      "Output section must exist for results with log lines"
    );
    assert.ok(
      html.includes("Seeding database..."),
      "Log must show first log line"
    );
    assert.ok(
      html.includes("Created 10 records"),
      "Log must show second log line"
    );
    assert.ok(
      html.includes("Done"),
      "Log must show last log line"
    );
  });

  test("no log section when log is undefined", () => {
    const html = buildLogHtml(undefined);
    assert.strictEqual(html, "", "Log HTML must be empty when log is undefined");
  });

  test("no log section when log is empty array", () => {
    const html = buildLogHtml([]);
    assert.strictEqual(html, "", "Log HTML must be empty when log is empty array");
  });

  test("log section appears before request/response groups", () => {
    const html = buildResultDetailHtml(MOCK_SCRIPT_RESULT),
     logIdx = html.indexOf(SECTION_LABEL_OUTPUT),
     requestIdx = html.indexOf(SECTION_LABEL_REQUEST);

    assert.ok(
      logIdx < requestIdx,
      "Log section must appear before the Request group"
    );
  });
});

suite("Result Detail HTML — Minimal and edge-case results", () => {
  test("minimal result still produces Request group", () => {
    const html = buildResultDetailHtml(MOCK_MINIMAL_RESULT);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST),
      "Even a minimal result must have a Request section"
    );
  });

  test("minimal result with no assertions/headers/body produces no Response group", () => {
    const html = buildResponseGroupHtml(MOCK_MINIMAL_RESULT);

    assert.strictEqual(
      html,
      "",
      "Response group must be empty when there are no assertions, headers, or body"
    );
  });

  test("request group without URL shows no request-url div", () => {
    const html = buildRequestGroupHtml(MOCK_MINIMAL_RESULT);

    assert.ok(
      !html.includes("request-url"),
      "Request group must not contain request-url div when URL is undefined"
    );
  });

  test("request group without request headers shows empty hint", () => {
    const html = buildRequestGroupHtml(MOCK_MINIMAL_RESULT);

    assert.ok(
      html.includes(NO_REQUEST_HEADERS),
      "Request group must show empty-hint text when no request headers exist"
    );
  });

  test("result with empty body produces no Body subsection", () => {
    const html = buildResponseGroupHtml(MOCK_EMPTY_BODY_RESULT);

    assert.ok(
      !html.includes(SECTION_LABEL_BODY),
      "Response group must not contain a Body subsection when body is empty string"
    );
  });

  test("result with empty headers object produces no Response Headers subsection", () => {
    const html = buildResponseGroupHtml(MOCK_EMPTY_BODY_RESULT);

    assert.ok(
      !html.includes(SECTION_LABEL_RESPONSE_HEADERS),
      "Response group must not contain a Response Headers subsection when headers is empty"
    );
  });

  test("result without URL but with request headers still shows headers", () => {
    const html = buildRequestGroupHtml(MOCK_NO_URL_RESULT);

    assert.ok(
      !html.includes("request-url"),
      "Request group must not show request-url when URL is undefined"
    );
    assert.ok(
      html.includes("Accept"),
      "Request group must still show request headers when present"
    );
    assert.ok(
      html.includes("text/html"),
      "Request group must show request header values"
    );
  });

  test("non-JSON body is rendered as escaped plain text", () => {
    const html = buildResponseGroupHtml(MOCK_INVALID_JSON_BODY);

    assert.ok(
      html.includes("this is not json"),
      "Non-JSON body text must appear in the output"
    );
    assert.ok(
      !html.includes("json-key"),
      "Non-JSON body must not have JSON syntax highlighting classes"
    );
  });
});

suite("Result Detail HTML — Failed assertion details", () => {
  test("failed assertions show expected and actual values", () => {
    const html = buildResponseGroupHtml(MOCK_FAILED_RESULT);

    assert.ok(
      html.includes("expected"),
      "Failed assertion must show 'expected' label"
    );
    assert.ok(
      html.includes("actual"),
      "Failed assertion must show 'actual' label"
    );
    assert.ok(
      html.includes("200"),
      "Failed assertion must show the expected value"
    );
    assert.ok(
      html.includes("403"),
      "Failed assertion must show the actual value"
    );
  });

  test("failed assertions use the fail CSS class", () => {
    const html = buildResponseGroupHtml(MOCK_FAILED_RESULT);

    assert.ok(
      html.includes('class="assert-row fail"'),
      "Failed assertion row must have the 'fail' CSS class"
    );
  });

  test("passed assertions use the pass CSS class", () => {
    const html = buildResponseGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      html.includes('class="assert-row pass"'),
      "Passed assertion row must have the 'pass' CSS class"
    );
  });

  test("passed assertions do NOT show expected/actual detail", () => {
    const html = buildResponseGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      !html.includes("assert-detail"),
      "Passed assertions must not show the expected/actual detail div"
    );
  });
});

suite("Result Detail HTML — XSS prevention", () => {
  test("HTML in request URL is escaped", () => {
    const html = buildRequestGroupHtml(MOCK_XSS_RESULT);

    assert.ok(
      !html.includes("<script>alert(1)</script>"),
      "Raw script tags in URL must be escaped"
    );
    assert.ok(
      html.includes("&lt;script&gt;"),
      "Script tags in URL must be HTML-escaped"
    );
  });

  test("HTML in request header values is escaped", () => {
    const html = buildRequestGroupHtml(MOCK_XSS_RESULT);

    assert.ok(
      !html.includes("<img onerror=alert(1)>"),
      "Raw HTML in request header values must be escaped"
    );
    assert.ok(
      html.includes("&lt;img onerror=alert(1)&gt;"),
      "HTML in request header values must be escaped"
    );
  });

  test("HTML in response header values is escaped", () => {
    const html = buildResponseGroupHtml(MOCK_XSS_RESULT);

    assert.ok(
      !html.includes('val"onmouseover=alert(1)'),
      "Raw quotes in response header values must be escaped"
    );
    assert.ok(
      html.includes("&quot;onmouseover"),
      "Quotes in response header values must be HTML-escaped"
    );
  });

  test("HTML in error message is escaped", () => {
    const html = buildErrorHtml(MOCK_XSS_RESULT.error);

    assert.ok(
      !html.includes("<b>bold injection</b>"),
      "Raw HTML in error must be escaped"
    );
    assert.ok(
      html.includes("&lt;b&gt;bold injection&lt;/b&gt;"),
      "HTML tags in error must be escaped"
    );
  });

  test("HTML in log lines is escaped", () => {
    const html = buildLogHtml(MOCK_XSS_RESULT.log);

    assert.ok(
      !html.includes("<script>alert('xss')</script>"),
      "Raw script tags in log lines must be escaped"
    );
    assert.ok(
      html.includes("&lt;script&gt;"),
      "Script tags in log lines must be escaped"
    );
  });

  test("HTML in assertion targets is escaped", () => {
    const html = buildResponseGroupHtml(MOCK_XSS_RESULT);

    assert.ok(
      !html.includes("body.<script>"),
      "Raw HTML in assertion targets must be escaped"
    );
    assert.ok(
      html.includes("body.&lt;script&gt;"),
      "HTML in assertion targets must be escaped"
    );
  });
});

suite("Result Detail HTML — Collapsible section structure", () => {
  test("collapsible section with open=true has open attribute", () => {
    const html = buildCollapsibleSection({
      title: "Test",
      content: "content",
      open: true,
    });

    assert.ok(
      html.includes('<details class="section" open>'),
      "Open section must have the open attribute on the details element"
    );
  });

  test("collapsible section with open=false has no open attribute", () => {
    const html = buildCollapsibleSection({
      title: "Test",
      content: "content",
      open: false,
    });

    assert.ok(
      html.includes('<details class="section">'),
      "Closed section must have a details element without the open attribute"
    );
    assert.ok(
      !html.includes("open>") || html.includes('<details class="section">'),
      "Closed section must NOT have the open attribute"
    );
  });

  test("collapsible section contains chevron for expand/collapse indicator", () => {
    const html = buildCollapsibleSection({
      title: "Test",
      content: "content",
      open: false,
    });

    assert.ok(
      html.includes("chevron"),
      "Collapsible section must contain a chevron element"
    );
  });

  test("collapsible section wraps content in section-content div", () => {
    const html = buildCollapsibleSection({
      title: "Test",
      content: "my-content-here",
      open: false,
    });

    assert.ok(
      html.includes('class="section-content"'),
      "Content must be wrapped in a section-content div"
    );
    assert.ok(
      html.includes("my-content-here"),
      "Content must appear inside the section"
    );
  });
});

suite("Result Detail HTML — Headers table rows", () => {
  test("undefined headers returns empty string", () => {
    assert.strictEqual(
      buildHeadersTableRows(undefined),
      "",
      "Undefined headers must produce empty string"
    );
  });

  test("empty headers object returns empty string", () => {
    assert.strictEqual(
      buildHeadersTableRows({}),
      "",
      "Empty headers object must produce empty string"
    );
  });

  test("headers produce table rows with key and value cells", () => {
    const html = buildHeadersTableRows({ "Content-Type": "application/json" });

    assert.ok(
      html.includes("<tr>"),
      "Headers must produce table rows"
    );
    assert.ok(
      html.includes('class="header-key"'),
      "Header key cell must have the header-key class"
    );
    assert.ok(
      html.includes("Content-Type"),
      "Header key must appear in the output"
    );
    assert.ok(
      html.includes("application/json"),
      "Header value must appear in the output"
    );
  });

  test("multiple headers produce multiple rows", () => {
    const html = buildHeadersTableRows({
      "Accept": "text/html",
      "Authorization": "Bearer xyz",
    }),
     rowCount = (html.match(/<tr>/g) ?? []).length;

    assert.strictEqual(
      rowCount,
      2,
      "Two headers must produce exactly two table rows"
    );
  });

  test("special characters in header values are escaped", () => {
    const html = buildHeadersTableRows({ "X-Data": "a<b>&c\"d" });

    assert.ok(
      html.includes("a&lt;b&gt;&amp;c&quot;d"),
      "Special characters in header values must be HTML-escaped"
    );
  });
});

suite("Result Detail HTML — Request body", () => {
  test("POST with JSON body shows Request Body subsection with formatted JSON", () => {
    const html = buildRequestGroupHtml(MOCK_POST_WITH_BODY);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST_BODY),
      "Request section must have a Request Body subsection when body is present"
    );
    assert.ok(
      html.includes("Alice"),
      "Request body must show JSON content (name value)"
    );
    assert.ok(
      html.includes("alice@example.com"),
      "Request body must show JSON content (email value)"
    );
    assert.ok(
      html.includes("json-key"),
      "JSON request body must have syntax highlighting"
    );
  });

  test("Request body shows content type hint", () => {
    const html = buildRequestGroupHtml(MOCK_POST_WITH_BODY);

    assert.ok(
      html.includes("content-type-hint"),
      "Request body must show content type hint CSS class"
    );
    assert.ok(
      html.includes("application/json"),
      "Request body must show the content type value"
    );
  });

  test("Plain text request body is shown without JSON highlighting", () => {
    const html = buildRequestGroupHtml(MOCK_POST_PLAIN_TEXT_BODY);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST_BODY),
      "Plain text body must still show Request Body subsection"
    );
    assert.ok(
      html.includes("Hello, this is plain text content"),
      "Plain text body content must appear in the output"
    );
    assert.ok(
      !html.includes("json-key"),
      "Plain text body must NOT have JSON syntax highlighting"
    );
    assert.ok(
      html.includes("text/plain"),
      "Plain text body must show content type hint"
    );
  });

  test("POST without request body does NOT show Request Body subsection", () => {
    const html = buildRequestGroupHtml(MOCK_POST_NO_BODY);

    assert.ok(
      !html.includes(SECTION_LABEL_REQUEST_BODY),
      "Request section must NOT have Request Body when requestBody is undefined"
    );
  });

  test("Request body with no requestBody shows no body subsection", () => {
    const html = buildRequestGroupHtml(MOCK_FULL_RESULT);

    assert.ok(
      !html.includes(SECTION_LABEL_REQUEST_BODY),
      "GET request must NOT have Request Body subsection"
    );
  });

  test("full detail HTML includes request body in Request group", () => {
    const html = buildResultDetailHtml(MOCK_POST_WITH_BODY);

    assert.ok(
      html.includes(SECTION_LABEL_REQUEST_BODY),
      "Full detail HTML must include Request Body within the Request group"
    );
    assert.ok(
      html.includes(SECTION_LABEL_REQUEST),
      "Full detail HTML must have the Request group"
    );

    const requestBodyIdx = html.indexOf(SECTION_LABEL_REQUEST_BODY),
     responseIdx = html.indexOf(SECTION_LABEL_RESPONSE);
    assert.ok(
      requestBodyIdx < responseIdx,
      "Request Body must appear before the Response section"
    );
  });

  test("full detail HTML for POST shows URL, method, headers, AND body", () => {
    const html = buildResultDetailHtml(MOCK_POST_WITH_BODY);

    assert.ok(
      html.includes("https://api.example.com/users"),
      "Must show request URL"
    );
    assert.ok(
      html.includes("POST"),
      "Must show request method"
    );
    assert.ok(
      html.includes("Authorization"),
      "Must show request header key"
    );
    assert.ok(
      html.includes("Bearer abc"),
      "Must show request header value"
    );
    assert.ok(
      html.includes(SECTION_LABEL_REQUEST_BODY),
      "Must show request body subsection"
    );
    assert.ok(
      html.includes("Alice"),
      "Must show request body content"
    );
  });

  test("HTML in request body is escaped", () => {
    const html = buildRequestGroupHtml(MOCK_XSS_REQUEST_BODY);

    assert.ok(
      !html.includes('<script>alert("xss")</script>'),
      "Raw script tags in request body must be escaped"
    );
    assert.ok(
      html.includes("&lt;script&gt;"),
      "Script tags in request body must be HTML-escaped"
    );
  });

  test("HTML in request body content type is escaped", () => {
    const html = buildRequestGroupHtml(MOCK_XSS_REQUEST_BODY);

    assert.ok(
      !html.includes('<img onerror="alert(1)">'),
      "Raw HTML in content type hint must be escaped"
    );
    assert.ok(
      html.includes("&lt;img"),
      "HTML in content type hint must be escaped"
    );
  });
});

suite("escapeHtml", () => {
  test("escapes ampersands", () => {
    assert.strictEqual(escapeHtml("a&b"), "a&amp;b");
  });

  test("escapes angle brackets", () => {
    assert.strictEqual(escapeHtml("<div>"), "&lt;div&gt;");
  });

  test("escapes double quotes", () => {
    assert.strictEqual(escapeHtml('a"b'), "a&quot;b");
  });

  test("handles string with all special chars", () => {
    assert.strictEqual(
      escapeHtml('<a href="x">&'),
      "&lt;a href=&quot;x&quot;&gt;&amp;"
    );
  });

  test("returns empty string unchanged", () => {
    assert.strictEqual(escapeHtml(""), "");
  });

  test("returns plain text unchanged", () => {
    assert.strictEqual(escapeHtml("hello world"), "hello world");
  });
});

suite("JSON highlighting — null, boolean, and empty object", () => {
  test("null value gets json-null class", () => {
    const html = highlightJson(null, 0);

    assert.ok(html.includes("json-null"), "null must use json-null CSS class");
    assert.ok(html.includes("null"), "null must render as text 'null'");
  });

  test("boolean true gets json-bool class", () => {
    const html = highlightJson(true, 0);

    assert.ok(html.includes("json-bool"), "boolean must use json-bool CSS class");
    assert.ok(html.includes("true"), "true must render as text 'true'");
  });

  test("boolean false gets json-bool class", () => {
    const html = highlightJson(false, 0);

    assert.ok(html.includes("json-bool"), "boolean must use json-bool CSS class");
    assert.ok(html.includes("false"), "false must render as text 'false'");
  });

  test("empty object renders as {}", () => {
    const html = highlightJson({}, 0);

    assert.strictEqual(html, "{}", "empty object must render as '{}'");
  });

  test("formatBodyHtml handles JSON with null and boolean values", () => {
    const html = formatBodyHtml('{"active":true,"deleted":null}');

    assert.ok(html.includes("json-bool"), "boolean in body must be highlighted");
    assert.ok(html.includes("json-null"), "null in body must be highlighted");
    assert.ok(html.includes("json-key"), "keys must be highlighted");
  });

  test("empty array renders as []", () => {
    const html = highlightJson([], 0);

    assert.strictEqual(html, "[]", "empty array must render as '[]'");
  });
});
