module Napper.Lsp.Workspace

open System.Collections.Concurrent

/// A tracked document: version + full text content
type TrackedDocument =
    { Version: int
      Text: string
      Uri: string }

/// In-memory store for all open documents synced from the IDE
let private documents = ConcurrentDictionary<string, TrackedDocument>()

/// Track a newly opened document
let openDocument (uri: string) (version: int) (text: string) : unit =
    let doc =
        { Version = version
          Text = text
          Uri = uri }

    documents.AddOrUpdate(uri, doc, fun _ _ -> doc) |> ignore
    Napper.Core.Logger.debug $"Workspace: opened {uri} (v{version})"

/// Update an existing document with new content
let changeDocument (uri: string) (version: int) (text: string) : unit =
    let doc =
        { Version = version
          Text = text
          Uri = uri }

    documents.AddOrUpdate(uri, doc, fun _ old -> if version > old.Version then doc else old)
    |> ignore

    Napper.Core.Logger.debug $"Workspace: changed {uri} (v{version})"

/// Remove a closed document
let closeDocument (uri: string) : unit =
    documents.TryRemove(uri) |> ignore
    Napper.Core.Logger.debug $"Workspace: closed {uri}"

/// Get a tracked document by URI
let tryGetDocument (uri: string) : TrackedDocument option =
    match documents.TryGetValue(uri) with
    | true, doc -> Some doc
    | false, _ -> None

/// Get all currently tracked document URIs
let trackedUris () : string list = documents.Keys |> Seq.toList

/// Number of currently tracked documents
let documentCount () : int = documents.Count
