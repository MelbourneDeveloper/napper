module HttpToNapConverterTests
// Specs: http-convert, http-convert-mapping, http-convert-env, http-convert-scripts,
//        http-convert-output, http-convert-naming

open Xunit
open DotHttp
open Nap.Core.HttpToNapConverter
open Nap.Core.OpenApiTypes

let private parseAndConvert (input: string) : ConvertResult =
    match DotHttp.Parser.parse input with
    | Ok httpFile -> convert httpFile
    | Error e -> failwith $"Parse failed: {e}"

let private firstContent (r: ConvertResult) : string = snd r.GeneratedFiles[0]
let private firstName (r: ConvertResult) : string = fst r.GeneratedFiles[0]
let private fileAt (r: ConvertResult) (i: int) : string * string = r.GeneratedFiles[i]

[<Fact>]
let ``Spec http-convert-mapping: GET mapped to request section`` () =
    let c = firstContent (parseAndConvert "GET https://api.example.com/users\n")
    Assert.Contains("[request]", c)
    Assert.Contains("GET https://api.example.com/users", c)

[<Fact>]
let ``Spec http-convert-mapping: headers mapped to request.headers`` () =
    let c =
        firstContent (
            parseAndConvert "GET https://api.example.com\nAuthorization: Bearer token123\nAccept: application/json\n"
        )

    Assert.Contains("[request.headers]", c)
    Assert.Contains("Authorization = Bearer token123", c)
    Assert.Contains("Accept = application/json", c)

[<Fact>]
let ``Spec http-convert-mapping: body mapped with triple quotes`` () =
    let c =
        firstContent (
            parseAndConvert
                "POST https://api.example.com/users\nContent-Type: application/json\n\n{\"name\":\"Alice\"}\n"
        )

    Assert.Contains("[request.body]", c)
    Assert.Contains("\"\"\"", c)
    Assert.Contains("{\"name\":\"Alice\"}", c)

[<Fact>]
let ``Spec http-convert-mapping: no body produces no body section`` () =
    Assert.DoesNotContain("[request.body]", firstContent (parseAndConvert "GET https://api.example.com\n"))

[<Fact>]
let ``Spec http-convert-mapping: variable interpolation preserved`` () =
    let c =
        firstContent (parseAndConvert "GET https://{{host}}/api/{{version}}/users\n")

    Assert.Contains("{{host}}", c)
    Assert.Contains("{{version}}", c)

[<Fact>]
let ``Spec http-convert-mapping: HTTP version dropped`` () =
    let c = firstContent (parseAndConvert "GET https://api.example.com HTTP/1.1\n")
    Assert.DoesNotContain("HTTP/1.1", c)
    Assert.Contains("GET https://api.example.com", c)

[<Fact>]
let ``Spec http-convert-mapping: separator name becomes meta`` () =
    let c =
        firstContent (parseAndConvert "### Get Users\nGET https://api.example.com/users\n")

    Assert.Contains("[meta]", c)
    Assert.Contains("name = Get Users", c)

[<Fact>]
let ``Spec http-convert-mapping: MS name directive becomes meta`` () =
    let c =
        firstContent (parseAndConvert "# @name GetUsers\nGET https://api.example.com/users\n")

    Assert.Contains("[meta]", c)
    Assert.Contains("name = GetUsers", c)

[<Fact>]
let ``Spec http-convert-mapping: unnamed request has no meta`` () =
    Assert.DoesNotContain("[meta]", firstContent (parseAndConvert "GET https://api.example.com/users\n"))

[<Fact>]
let ``Spec http-convert-mapping: MS file-level vars mapped`` () =
    let c =
        firstContent (parseAndConvert "@baseUrl = https://api.example.com\n@token = abc123\n\nGET {{baseUrl}}/users\n")

    Assert.Contains("[vars]", c)
    Assert.Contains("baseUrl = \"https://api.example.com\"", c)
    Assert.Contains("token = \"abc123\"", c)

[<Fact>]
let ``Spec http-convert-mapping: no vars when none defined`` () =
    Assert.DoesNotContain("[vars]", firstContent (parseAndConvert "GET https://api.example.com\n"))

[<Fact>]
let ``Spec http-convert-mapping: body content-type from headers`` () =
    Assert.Contains(
        "content-type = text/xml",
        firstContent (parseAndConvert "POST https://api.com\nContent-Type: text/xml\n\n<root/>\n")
    )

[<Fact>]
let ``Spec http-convert-mapping: body defaults to application/json`` () =
    Assert.Contains(
        "content-type = application/json",
        firstContent (parseAndConvert "POST https://api.com\n\n{\"x\":1}\n")
    )

[<Fact>]
let ``Spec http-convert-naming: numeric prefix`` () =
    let r =
        parseAndConvert "### First\nGET https://a.com\n\n### Second\nPOST https://b.com\n"

    Assert.StartsWith("01_", fst (fileAt r 0))
    Assert.StartsWith("02_", fst (fileAt r 1))

[<Fact>]
let ``Spec http-convert-naming: slugified name`` () =
    let n =
        firstName (parseAndConvert "### Get All Users\nGET https://api.example.com/users\n")

    Assert.Contains("get-all-users", n)
    Assert.EndsWith(".nap", n)

[<Fact>]
let ``Spec http-convert-naming: method-url slug for unnamed`` () =
    let n = firstName (parseAndConvert "GET https://api.example.com/users\n")
    Assert.Contains("get-", n)
    Assert.EndsWith(".nap", n)

[<Fact>]
let ``Spec http-convert-naming: nap extension on all files`` () =
    for (name, _) in (parseAndConvert "GET https://a.com\n\n###\nPOST https://b.com\n").GeneratedFiles do
        Assert.EndsWith(NapExtension, name)

[<Fact>]
let ``Spec http-convert-output: one nap per request`` () =
    Assert.Equal(
        3,
        (parseAndConvert
            "GET https://a.com\n\n###\nPOST https://b.com\nContent-Type: application/json\n\n{\"n\":1}\n\n###\nDELETE https://c.com\n")
            .GeneratedFiles.Length
    )

[<Fact>]
let ``Spec http-convert-output: correct method per file`` () =
    let r =
        parseAndConvert "GET https://a.com\n\n###\nPOST https://b.com\n\n###\nDELETE https://c.com\n"

    Assert.Contains("GET https://a.com", snd (fileAt r 0))
    Assert.Contains("POST https://b.com", snd (fileAt r 1))
    Assert.Contains("DELETE https://c.com", snd (fileAt r 2))

[<Fact>]
let ``Spec http-convert-scripts: pre-script generates warning`` () =
    let r = parseAndConvert "< {% console.log('setup') %}\nGET https://api.com\n"
    Assert.True(r.Warnings.Length >= 1)
    Assert.Contains("Script block not converted", r.Warnings[0].Message)

[<Fact>]
let ``Spec http-convert-scripts: post-script generates warning`` () =
    let r =
        parseAndConvert "GET https://api.com\n> {% client.test('ok', function(){}) %}\n"

    Assert.True(r.Warnings.Length >= 1)
    Assert.Contains("Script block not converted", r.Warnings[0].Message)

[<Fact>]
let ``Spec http-convert-scripts: warning includes request name`` () =
    let r =
        parseAndConvert "### Auth Test\nGET https://api.com\n> {% client.test('ok', function(){}) %}\n"

    Assert.Equal(Some "Auth Test", r.Warnings[0].RequestName)

[<Fact>]
let ``Spec http-convert-scripts: no scripts no warnings`` () =
    Assert.Empty((parseAndConvert "GET https://api.com\n").Warnings)

[<Fact>]
let ``Spec http-convert-env: public env generates named napenv`` () =
    match
        convertEnvJson """{"dev":{"host":"localhost:8080","token":"abc"},"prod":{"host":"api.example.com"}}""" false
    with
    | Ok files ->
        Assert.Equal(2, files.Length)
        Assert.Equal(".napenv.dev", fst (files |> List.find (fun (n, _) -> n.Contains("dev"))))
        Assert.Contains("host = \"localhost:8080\"", snd files[0])
    | Error e -> failwith e

[<Fact>]
let ``Spec http-convert-env: private env generates napenv.local`` () =
    match convertEnvJson """{"dev":{"secret":"s3cret"}}""" true with
    | Ok files ->
        Assert.Equal(".napenv.local", fst files[0])
        Assert.Contains("secret = \"s3cret\"", snd files[0])
    | Error e -> failwith e

[<Fact>]
let ``Spec http-convert-env: invalid JSON returns error`` () =
    match convertEnvJson "not json{" false with
    | Error e -> Assert.Contains("Failed to parse environment JSON", e)
    | Ok _ -> failwith "Expected error"

[<Fact>]
let ``Spec http-convert-env: empty object produces empty list`` () =
    match convertEnvJson "{}" false with
    | Ok files -> Assert.Empty(files)
    | Error e -> failwith e

[<Fact>]
let ``Spec http-convert: full REST API round-trip`` () =
    let input =
        "@baseUrl = https://api.example.com\n@token = mytoken\n\n### List Users\nGET {{baseUrl}}/users\nAuthorization: Bearer {{token}}\nAccept: application/json\n\n### Create User\nPOST {{baseUrl}}/users\nContent-Type: application/json\n\n{\"name\": \"Alice\"}\n\n### Delete User\nDELETE {{baseUrl}}/users/42\nAuthorization: Bearer {{token}}\n"

    let r = parseAndConvert input
    Assert.Equal(3, r.GeneratedFiles.Length)
    Assert.Contains("name = List Users", snd (fileAt r 0))
    Assert.Contains("GET {{baseUrl}}/users", snd (fileAt r 0))
    Assert.DoesNotContain("[request.body]", snd (fileAt r 0))
    Assert.Contains("POST {{baseUrl}}/users", snd (fileAt r 1))
    Assert.Contains("[request.body]", snd (fileAt r 1))
    Assert.Contains("DELETE {{baseUrl}}/users/42", snd (fileAt r 2))

[<Fact>]
let ``Spec http-convert: comments preserved`` () =
    Assert.Contains(
        "# This is a health check",
        firstContent (parseAndConvert "# This is a health check\nGET https://api.com/health\n")
    )

[<Fact>]
let ``Spec http-convert: sections in correct order`` () =
    let c =
        firstContent (
            parseAndConvert
                "@baseUrl = https://api.com\n\n### Create\nPOST {{baseUrl}}/items\nContent-Type: application/json\n\n{\"name\":\"test\"}\n"
        )

    Assert.True(c.IndexOf("[meta]") < c.IndexOf("[vars]"))
    Assert.True(c.IndexOf("[vars]") < c.IndexOf("[request]"))
    Assert.True(c.IndexOf("[request]") < c.IndexOf("[request.headers]"))
    Assert.True(c.IndexOf("[request.headers]") < c.IndexOf("[request.body]"))
