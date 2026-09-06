export const EXTERNAL_ASSET_PROVIDERS = ["YANDEX_METRIKA"] as const;
export type ExternalAssetProvider = (typeof EXTERNAL_ASSET_PROVIDERS)[number];

export const EXTERNAL_SOURCE_ROLES = ["PRIMARY_SITE", "MIRROR"] as const;
export type ExternalSourceRole = (typeof EXTERNAL_SOURCE_ROLES)[number];

export interface ExternalAssetSourceObservation {
  provider: ExternalAssetProvider;
  externalId: string;
  sourceRole: ExternalSourceRole;
  canonicalHostname: string;
  sourceName: string;
  sourcePermission: string;
}

export interface AssetCandidateDraft {
  assetType: "HOSTNAME";
  canonicalHostname: string;
  status: "DISCOVERED";
  sources: readonly ExternalAssetSourceObservation[];
}
