import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import {
  artifactRemoteWithCredentials,
  cloudflareArtifactsConfigFromEnv,
  cloudflareImportRequest,
  isCloudflareImportableRemote
} from "../src/services/cloudflare-artifacts.ts"

describe("Cloudflare Artifacts", () => {
  test("derives REST configuration from Cloudflare environment", () => {
    const config = cloudflareArtifactsConfigFromEnv({
      ACCOUNT_ID: "acc_123",
      ARTIFACTS_NAMESPACE: "agents",
      CLOUDFLARE_API_TOKEN: "cf_token"
    })

    expect(config).toEqual({
      apiToken: "cf_token",
      baseUrl: "https://api.cloudflare.com/client/v4/accounts/acc_123/artifacts/namespaces/agents"
    })
  })

  test("builds an import request for a public HTTPS remote", () => {
    const request = cloudflareImportRequest({
      branch: "main",
      config: {
        apiToken: "cf_token",
        baseUrl: "https://api.cloudflare.com/client/v4/accounts/a/artifacts/namespaces/default"
      },
      depth: Option.some(100),
      name: "effect",
      url: "https://github.com/Effect-TS/effect.git"
    })

    expect(request.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/a/artifacts/namespaces/default/repos/effect/import"
    )
    expect(request.init.method).toBe("POST")
    expect(request.init.headers).toMatchObject({
      Authorization: "Bearer cf_token",
      "Content-Type": "application/json"
    })
    expect(JSON.parse(String(request.init.body))).toEqual({
      url: "https://github.com/Effect-TS/effect.git",
      branch: "main",
      read_only: true,
      depth: 100
    })
  })

  test("embeds short-lived artifact tokens only in the clone URL", () => {
    expect(
      artifactRemoteWithCredentials({
        remote: "https://abc.artifacts.cloudflare.net/git/default/effect.git",
        token: "art_v1_secret?expires=1760000000"
      })
    ).toBe(
      "https://x:art_v1_secret%3Fexpires%3D1760000000@abc.artifacts.cloudflare.net/git/default/effect.git"
    )
  })

  test("accepts only HTTPS remotes for REST imports", () => {
    expect(isCloudflareImportableRemote("https://github.com/Effect-TS/effect.git")).toBe(true)
    expect(isCloudflareImportableRemote("git@github.com:Effect-TS/effect.git")).toBe(false)
  })
})
