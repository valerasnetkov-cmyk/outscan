import type {
  AssetCandidateDraft,
  ExternalAssetSourceObservation,
  ExternalSourceRole,
} from "../../external-assets/index.js";
import type { YandexMetrikaCounter } from "./model.js";
import {
  normalizeMetrikaSite,
  type MetrikaSiteRejectionCode,
} from "./normalize-site.js";

export interface RejectedMetrikaSite {
  counterId: number;
  sourceRole: ExternalSourceRole;
  code: MetrikaSiteRejectionCode;
}

export interface MetrikaCandidateSnapshot {
  candidates: readonly AssetCandidateDraft[];
  rejectedSites: readonly RejectedMetrikaSite[];
}

function observation(
  counter: YandexMetrikaCounter,
  sourceRole: ExternalSourceRole,
  canonicalHostname: string,
): ExternalAssetSourceObservation {
  return Object.freeze({
    provider: "YANDEX_METRIKA",
    externalId: String(counter.id),
    sourceRole,
    canonicalHostname,
    sourceName: counter.name,
    sourcePermission: counter.permission,
  });
}

export function createMetrikaAssetCandidates(
  counters: readonly YandexMetrikaCounter[],
): MetrikaCandidateSnapshot {
  const sourcesByHostname = new Map<
    string,
    Map<string, ExternalAssetSourceObservation>
  >();
  const rejectedSites: RejectedMetrikaSite[] = [];

  for (const counter of counters) {
    const values: Array<readonly [ExternalSourceRole, string]> = [];
    if (counter.primarySite) {
      values.push(["PRIMARY_SITE", counter.primarySite]);
    }
    for (const site of counter.mirrors) values.push(["MIRROR", site]);
    for (const [sourceRole, site] of values) {
      const normalized = normalizeMetrikaSite(site);
      if (!normalized.ok) {
        rejectedSites.push(
          Object.freeze({
            counterId: counter.id,
            sourceRole,
            code: normalized.code,
          }),
        );
        continue;
      }
      const source = observation(
        counter,
        sourceRole,
        normalized.canonicalHostname,
      );
      const sources =
        sourcesByHostname.get(source.canonicalHostname) ?? new Map();
      sources.set(
        `${source.externalId}\u0000${source.sourceRole}\u0000${source.canonicalHostname}`,
        source,
      );
      sourcesByHostname.set(source.canonicalHostname, sources);
    }
  }

  const candidates = [...sourcesByHostname.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([canonicalHostname, sourceMap]): AssetCandidateDraft =>
      Object.freeze({
        assetType: "HOSTNAME",
        canonicalHostname,
        status: "DISCOVERED",
        sources: Object.freeze(
          [...sourceMap.values()].sort((left, right) =>
            `${left.externalId}:${left.sourceRole}`.localeCompare(
              `${right.externalId}:${right.sourceRole}`,
              "en",
            ),
          ),
        ),
      }),
    );

  return Object.freeze({
    candidates: Object.freeze(candidates),
    rejectedSites: Object.freeze(rejectedSites),
  });
}
