import { describe, expect, it } from "vitest";

import {
  createMetrikaAssetCandidates,
  type YandexMetrikaCounter,
} from "../src/integrations/yandex-metrika/index.js";

function counter(
  id: number,
  primarySite: string,
  mirrors: readonly string[],
): YandexMetrikaCounter {
  return {
    id,
    name: `Counter ${id}`,
    ownerLogin: "owner",
    permission: "view",
    status: "Active",
    source: "turbodirect",
    primarySite,
    mirrors,
  };
}

describe("Yandex Metrika asset candidate projection", () => {
  it("deduplicates canonical hosts while retaining provenance", () => {
    const snapshot = createMetrikaAssetCandidates([
      counter(1, "https://EXAMPLE.RU/path", ["www.example.ru"]),
      counter(2, "example.ru", ["example.ru", "bad.invalid"]),
    ]);

    expect(
      snapshot.candidates.map((candidate) => candidate.canonicalHostname),
    ).toEqual(["example.ru", "www.example.ru"]);
    expect(snapshot.candidates[0]?.sources).toHaveLength(3);
    expect(snapshot.candidates[0]).toMatchObject({
      assetType: "HOSTNAME",
      status: "DISCOVERED",
    });
    expect(snapshot.rejectedSites).toEqual([
      { counterId: 2, sourceRole: "MIRROR", code: "NON_PUBLIC_SUFFIX" },
    ]);
  });

  it("deduplicates the same source observation", () => {
    const snapshot = createMetrikaAssetCandidates([
      counter(1, "example.ru", ["EXAMPLE.RU", "example.ru"]),
    ]);
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.candidates[0]?.sources).toHaveLength(2);
  });

  it("does not turn discovery metadata into scan authorization", () => {
    const json = JSON.stringify(
      createMetrikaAssetCandidates([counter(1, "example.ru", [])]),
    );
    expect(json).not.toContain("VerifiedScope");
    expect(json).not.toContain("ScanAuthorization");
    expect(json).not.toContain("accessToken");
  });
});
