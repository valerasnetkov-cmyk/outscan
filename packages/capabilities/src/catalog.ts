import type {
  CapabilityPublicationState,
  ProductCapabilityDefinition,
} from "./model.js";
import {
  validateCapabilityDefinitions,
  validateCapabilityPublications,
} from "./validate.js";

const V1_DEFINITION_INPUT = [
  {
    slug: "domain-security",
    name: "Domain Security",
    category: "posture",
    description: "Состояние DNS, DNSSEC, CAA и базовых настроек домена.",
    accessClass: "PUBLIC_SAFE",
    maturity: "BETA",
    publicCopyKey: "capability.domain-security",
    requiredEvidenceClass: "guest-domain-posture",
    tags: ["dns", "domain"],
    sortOrder: 10,
  },
  {
    slug: "tls-https",
    name: "TLS / HTTPS",
    category: "posture",
    description: "Состояние сертификата, TLS и публичной HTTPS-конфигурации.",
    accessClass: "PUBLIC_SAFE",
    maturity: "BETA",
    publicCopyKey: "capability.tls-https",
    requiredEvidenceClass: "guest-tls-posture",
    tags: ["tls", "https"],
    sortOrder: 20,
  },
  {
    slug: "email-security",
    name: "Email Security",
    category: "posture",
    description: "Состояние SPF, DMARC, MTA-STS и TLS-RPT.",
    accessClass: "PUBLIC_SAFE",
    maturity: "BETA",
    publicCopyKey: "capability.email-security",
    requiredEvidenceClass: "guest-email-posture",
    tags: ["email", "dns"],
    sortOrder: 30,
  },
  {
    slug: "web-security",
    name: "Web Security",
    category: "posture",
    description: "Наблюдения за защитными заголовками публичного веб-ответа.",
    accessClass: "PUBLIC_SAFE",
    maturity: "BETA",
    publicCopyKey: "capability.web-security",
    requiredEvidenceClass: "guest-web-posture",
    tags: ["http", "headers"],
    sortOrder: 40,
  },
  {
    slug: "infrastructure",
    name: "Infrastructure",
    category: "posture",
    description:
      "Публично наблюдаемая инфраструктура точного указанного хоста.",
    accessClass: "PUBLIC_SAFE",
    maturity: "EXPERIMENTAL",
    publicCopyKey: "capability.infrastructure",
    requiredEvidenceClass: "guest-infrastructure-posture",
    tags: ["infrastructure"],
    sortOrder: 50,
  },
  {
    slug: "technology-detection",
    name: "Technology Detection",
    category: "posture",
    description: "Безопасные признаки публично наблюдаемых веб-технологий.",
    accessClass: "PUBLIC_SAFE",
    maturity: "EXPERIMENTAL",
    publicCopyKey: "capability.technology-detection",
    requiredEvidenceClass: "guest-technology-posture",
    tags: ["technology", "http"],
    sortOrder: 60,
  },
  {
    slug: "attack-surface-discovery",
    name: "Attack Surface Discovery",
    category: "discovery",
    description: "Инвентаризация подтверждённого внешнего цифрового периметра.",
    accessClass: "VERIFIED",
    maturity: "EXPERIMENTAL",
    publicCopyKey: "capability.attack-surface-discovery",
    requiredEvidenceClass: "verified-discovery",
    tags: ["discovery", "verified"],
    sortOrder: 70,
  },
  {
    slug: "vulnerability-detection",
    name: "Vulnerability Detection",
    category: "detection",
    description:
      "Контролируемая проверка подтверждённых активов на уязвимости.",
    accessClass: "VERIFIED",
    maturity: "EXPERIMENTAL",
    publicCopyKey: "capability.vulnerability-detection",
    requiredEvidenceClass: "verified-vulnerability-detection",
    tags: ["vulnerability", "verified"],
    sortOrder: 80,
  },
  {
    slug: "threat-intelligence",
    name: "Threat Intelligence",
    category: "intelligence",
    description: "Контекст угроз и эксплуатации для приоритизации рисков.",
    accessClass: "SYSTEM",
    maturity: "EXPERIMENTAL",
    publicCopyKey: "capability.threat-intelligence",
    requiredEvidenceClass: "production-threat-intelligence",
    tags: ["threat-intelligence", "risk"],
    sortOrder: 90,
  },
] as const satisfies readonly ProductCapabilityDefinition[];

export const V1_CAPABILITY_DEFINITIONS =
  validateCapabilityDefinitions(V1_DEFINITION_INPUT);

const V1_PUBLICATION_INPUT = V1_CAPABILITY_DEFINITIONS.map(
  ({ slug, accessClass }) =>
    ({
      capabilitySlug: slug,
      releaseState: accessClass === "PUBLIC_SAFE" ? "DEVELOPMENT" : "PLANNED",
      publicVisible: true,
      claimApproved: false,
      evidenceValid: false,
    }) as const,
) satisfies readonly CapabilityPublicationState[];

export const V1_CAPABILITY_PUBLICATIONS = validateCapabilityPublications(
  V1_PUBLICATION_INPUT,
  V1_CAPABILITY_DEFINITIONS,
);
