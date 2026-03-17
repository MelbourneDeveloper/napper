module HttpMethodTests

open Xunit
open Nap.Core

[<Fact>]
let ``GET.ToNetMethod returns HttpMethod.Get`` () =
    Assert.Equal(System.Net.Http.HttpMethod.Get, GET.ToNetMethod())

[<Fact>]
let ``POST.ToNetMethod returns HttpMethod.Post`` () =
    Assert.Equal(System.Net.Http.HttpMethod.Post, POST.ToNetMethod())

[<Fact>]
let ``PUT.ToNetMethod returns HttpMethod.Put`` () =
    Assert.Equal(System.Net.Http.HttpMethod.Put, PUT.ToNetMethod())

[<Fact>]
let ``PATCH.ToNetMethod returns HttpMethod.Patch`` () =
    Assert.Equal(System.Net.Http.HttpMethod.Patch, PATCH.ToNetMethod())

[<Fact>]
let ``DELETE.ToNetMethod returns HttpMethod.Delete`` () =
    Assert.Equal(System.Net.Http.HttpMethod.Delete, DELETE.ToNetMethod())

[<Fact>]
let ``HEAD.ToNetMethod returns HttpMethod.Head`` () =
    Assert.Equal(System.Net.Http.HttpMethod.Head, HEAD.ToNetMethod())

[<Fact>]
let ``OPTIONS.ToNetMethod returns HttpMethod.Options`` () =
    Assert.Equal(System.Net.Http.HttpMethod.Options, OPTIONS.ToNetMethod())
