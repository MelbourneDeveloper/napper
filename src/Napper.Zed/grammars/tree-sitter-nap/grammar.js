/// <reference types="tree-sitter-cli/dsl" />

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

module.exports = grammar({
  name: "nap",

  extras: ($) => [/[ \t]/],

  rules: {
    source_file: ($) =>
      repeat(
        choice(
          $.section_header,
          $.shorthand_request,
          $.pair,
          $.assertion_exists,
          $.assertion_contains,
          $.assertion_matches,
          $.assertion_lt,
          $.assertion_gt,
          $.triple_quoted_string,
          $.comment,
          $.newline,
        ),
      ),

    newline: (_) => /\r?\n/,

    comment: (_) => seq("#", /[^\r\n]*/),

    // --- Shorthand: `GET https://example.com` ---
    shorthand_request: ($) =>
      seq($.http_method, $.value),

    // --- Section headers (flat) ---
    section_header: (_) =>
      choice(
        seq("[", "meta", "]"),
        seq("[", "vars", "]"),
        seq("[", "request", "]"),
        seq("[", "request", ".", "headers", "]"),
        seq("[", "request", ".", "body", "]"),
        seq("[", "assert", "]"),
        seq("[", "script", "]"),
      ),

    // --- Key = value pair (covers all sections) ---
    pair: ($) =>
      seq($.key, "=", choice($.array_value, $.value)),

    // --- Assertions (each operator is its own rule — no ambiguity with `=`) ---
    assertion_exists: ($) =>
      seq($.key, "exists"),

    assertion_contains: ($) =>
      seq($.key, "contains", $.assertion_value),

    assertion_matches: ($) =>
      seq($.key, "matches", $.assertion_value),

    assertion_lt: ($) =>
      seq($.key, "<", $.assertion_value),

    assertion_gt: ($) =>
      seq($.key, ">", $.assertion_value),

    assertion_value: ($) =>
      choice($.duration_value, $.variable_ref, $.quoted_string, $.raw_value),

    duration_value: (_) => /[0-9]+ms/,
    raw_value: (_) => /[^\r\n]+/,

    // --- Tokens ---
    http_method: (_) => choice(...HTTP_METHODS),

    key: (_) => /[a-zA-Z_][a-zA-Z0-9_.\-]*/,

    value: ($) =>
      repeat1(choice($.variable_ref, $.quoted_string, $.text_fragment)),

    text_fragment: (_) => /[^\s"{\r\n][^{"\r\n]*/,

    quoted_string: ($) =>
      seq('"', repeat(choice($.variable_ref, $.string_content)), '"'),

    string_content: (_) => /[^"\\{}\r\n]+|\\./,

    triple_quoted_string: ($) =>
      seq('"""', /\r?\n/, optional($.body_content), '"""'),

    body_content: ($) =>
      repeat1(choice($.variable_ref, $.body_text)),

    body_text: (_) => /[^{}\r\n]+|\r?\n|[{}]/,

    array_value: ($) =>
      seq("[", optional(seq($.quoted_string, repeat(seq(",", $.quoted_string)))), "]"),

    variable_ref: (_) => seq("{{", /[a-zA-Z_][a-zA-Z0-9_\-]*/, "}}"),
  },
});
