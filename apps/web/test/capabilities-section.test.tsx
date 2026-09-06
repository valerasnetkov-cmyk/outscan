import type { PublicCapability } from "@outscan/capabilities";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapabilitiesSection } from "../src/app/capabilities-section";

const capabilities = Object.freeze([
  Object.freeze({
    slug: "domain-security",
    name: "Domain Security",
    description: "Состояние DNS и настроек домена.",
    access: "PUBLIC_SAFE",
    maturity: "BETA",
    status: "ACTIVE",
    sortOrder: 10,
  }),
  Object.freeze({
    slug: "vulnerability-detection",
    name: "Vulnerability Detection",
    description: "Проверка подтверждённого актива.",
    access: "VERIFIED",
    maturity: "EXPERIMENTAL",
    status: "ACTIVE",
    sortOrder: 20,
  }),
]) satisfies readonly PublicCapability[];

describe("CapabilitiesSection", () => {
  it("renders canonical projection with textual access labels", () => {
    const markup = renderToStaticMarkup(
      <CapabilitiesSection capabilities={capabilities} />,
    );
    expect(markup).toContain("Возможности OUTSCAN");
    expect(markup).toContain("Domain Security");
    expect(markup).toContain("Базовая проверка");
    expect(markup).toContain("Vulnerability Detection");
    expect(markup).toContain("После подтверждения домена");
    expect(markup).toContain('aria-labelledby="coverage-title"');
  });

  it("fails safely when no production-approved capabilities exist", () => {
    expect(
      renderToStaticMarkup(<CapabilitiesSection capabilities={[]} />),
    ).toBe("");
  });

  it("uses the canonical registry by default without a local capability list", () => {
    expect(renderToStaticMarkup(<CapabilitiesSection />)).toBe("");
  });
});
