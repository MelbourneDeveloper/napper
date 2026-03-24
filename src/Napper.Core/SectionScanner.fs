/// Scan .nap and .naplist files for section headers and their line positions.
/// Complements Parser.fs — the parser gives you the data, this gives you the positions.
/// Used by the LSP for document symbols / outline navigation.
module Napper.Core.SectionScanner

/// A located section header with its line number (0-based) and name
type SectionLocation =
    { Name: string
      Line: int
      EndLine: int }

/// Known .nap section names
let private napSections =
    Set.ofList
        [ "meta"
          "vars"
          "request"
          "request.headers"
          "request.body"
          "assert"
          "script" ]

/// Known .naplist section names
let private naplistSections = Set.ofList [ "meta"; "vars"; "steps" ]

let private isSectionHeader (line: string) : string option =
    let trimmed = line.Trim()

    if trimmed.StartsWith "[" && trimmed.EndsWith "]" then
        Some(trimmed.TrimStart('[').TrimEnd(']').ToLowerInvariant())
    else
        None

let private isShorthandRequest (line: string) : bool =
    let methods = [ "GET"; "POST"; "PUT"; "PATCH"; "DELETE"; "HEAD"; "OPTIONS" ]
    let trimmed = line.TrimStart()
    methods |> List.exists (fun m -> trimmed.StartsWith(m + " "))

/// Scan a .nap file for section locations. Returns sections in file order.
/// Also detects shorthand requests (e.g. "GET https://...") as a synthetic "request" section.
let scanNapSections (content: string) : SectionLocation list =
    let lines = content.Split([| '\n' |])
    let mutable sections: SectionLocation list = []
    let mutable lastSectionStart = -1
    let mutable lastName = ""

    let closeSection (endLine: int) =
        if lastSectionStart >= 0 then
            sections <-
                sections
                @ [ { Name = lastName
                      Line = lastSectionStart
                      EndLine = endLine } ]

    for i in 0 .. lines.Length - 1 do
        let line = lines[i]

        match isSectionHeader line with
        | Some name when napSections.Contains name ->
            closeSection (i - 1)
            lastSectionStart <- i
            lastName <- name
        | _ ->
            if i = 0 && isShorthandRequest line then
                closeSection (i - 1)
                lastSectionStart <- 0
                lastName <- "request"

    closeSection (lines.Length - 1)
    sections

/// Scan a .naplist file for section locations. Returns sections in file order.
let scanNaplistSections (content: string) : SectionLocation list =
    let lines = content.Split([| '\n' |])
    let mutable sections: SectionLocation list = []
    let mutable lastSectionStart = -1
    let mutable lastName = ""

    let closeSection (endLine: int) =
        if lastSectionStart >= 0 then
            sections <-
                sections
                @ [ { Name = lastName
                      Line = lastSectionStart
                      EndLine = endLine } ]

    for i in 0 .. lines.Length - 1 do
        match isSectionHeader lines[i] with
        | Some name when naplistSections.Contains name ->
            closeSection (i - 1)
            lastSectionStart <- i
            lastName <- name
        | _ -> ()

    closeSection (lines.Length - 1)
    sections
