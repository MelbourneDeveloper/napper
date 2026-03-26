; Section headers
(section_header "[" @punctuation.bracket)
(section_header "]" @punctuation.bracket)
(section_header "meta" @keyword)
(section_header "vars" @keyword)
(section_header "request" @keyword)
(section_header "headers" @keyword)
(section_header "body" @keyword)
(section_header "assert" @keyword)
(section_header "script" @keyword)
(section_header "." @punctuation.delimiter)

; Comments
(comment) @comment

; HTTP methods
(http_method) @function.method

; Key-value pairs
(pair (key) @property)
(pair "=" @operator)

; Values
(quoted_string "\"" @punctuation.delimiter)
(quoted_string (string_content) @string)
(text_fragment) @string
(triple_quoted_string "\"\"\"" @punctuation.delimiter)
(triple_quoted_string (body_content (body_text) @string))

; URLs (in shorthand requests)
(shorthand_request (value (text_fragment) @string.special.url))

; Variable interpolation
(variable_ref "{{" @punctuation.special)
(variable_ref "}}" @punctuation.special)
(variable_ref) @variable

; Arrays
(array_value "[" @punctuation.bracket)
(array_value "]" @punctuation.bracket)
(array_value "," @punctuation.delimiter)

; Assertions
(assertion_exists (key) @property)
(assertion_exists "exists" @keyword.operator)
(assertion_contains (key) @property)
(assertion_contains "contains" @keyword.operator)
(assertion_matches (key) @property)
(assertion_matches "matches" @keyword.operator)
(assertion_lt (key) @property)
(assertion_lt "<" @operator)
(assertion_gt (key) @property)
(assertion_gt ">" @operator)
(duration_value) @number
(raw_value) @string
