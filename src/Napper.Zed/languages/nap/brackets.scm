; Section header brackets
("[" @open "]" @close)

; Variable interpolation brackets
("{{" @open "}}" @close)

; Triple-quoted string delimiters
("\"\"\"" @open "\"\"\"" @close)

; Array brackets
(array_value "[" @open "]" @close)

; Quoted string delimiters
(quoted_string "\"" @open "\"" @close)
