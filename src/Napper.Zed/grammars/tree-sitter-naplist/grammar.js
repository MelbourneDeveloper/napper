/// <reference types="tree-sitter-cli/dsl" />

module.exports = grammar({
  name: "naplist",

  extras: ($) => [/[ \t]/],

  rules: {
    source_file: ($) =>
      repeat(
        choice(
          $.section_header,
          $.pair,
          $.step,
          $.comment,
          $.newline,
        ),
      ),

    newline: (_) => /\r?\n/,

    comment: (_) => seq("#", /[^\r\n]*/),

    // --- Section headers (flat) ---
    section_header: (_) =>
      choice(
        seq("[", "meta", "]"),
        seq("[", "vars", "]"),
        seq("[", "steps", "]"),
      ),

    // --- Key-value pairs ---
    pair: ($) =>
      seq($.key, "=", choice($.quoted_string, $.unquoted_value)),

    // --- Steps (file paths) ---
    step: (_) => /[.\/][^\s#\r\n][^\r\n]*/,

    // --- Tokens ---
    key: (_) => /[a-zA-Z_][a-zA-Z0-9_\-]*/,

    unquoted_value: (_) => /[^\r\n]+/,

    quoted_string: ($) =>
      seq('"', optional($.string_content), '"'),

    string_content: (_) => /[^"\\\r\n]+|\\./,
  },
});
