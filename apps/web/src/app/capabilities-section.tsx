import {
  getV1PublicCapabilities,
  type PublicCapability,
} from "@outscan/capabilities";

interface CapabilitiesSectionProps {
  capabilities?: readonly PublicCapability[];
}

export function getHomepageCapabilities(): readonly PublicCapability[] {
  try {
    return getV1PublicCapabilities();
  } catch {
    return [];
  }
}

function accessLabel(access: PublicCapability["access"]): string {
  switch (access) {
    case "PUBLIC_SAFE":
      return "Базовая проверка";
    case "VERIFIED":
      return "После подтверждения домена";
    case "CONTROLLED":
      return "После подтверждения и согласия";
    case "SYSTEM":
      return "Системная возможность";
  }
}

export function CapabilitiesSection({
  capabilities = getHomepageCapabilities(),
}: CapabilitiesSectionProps = {}) {
  if (capabilities.length === 0) return null;

  return (
    <section
      className="section shell"
      id="coverage"
      aria-labelledby="coverage-title"
    >
      <div className="section-heading">
        <p className="eyebrow dark">ВОЗМОЖНОСТИ</p>
        <h2 id="coverage-title">Возможности OUTSCAN</h2>
        <p>
          Доступность функции не означает, что конкретный актив уже проверен.
          Для расширенных проверок требуется подтверждение домена.
        </p>
      </div>
      <div className="capability-grid">
        {capabilities.map((capability) => (
          <article key={capability.slug}>
            <p className="capability-access">
              {accessLabel(capability.access)}
            </p>
            <h3>{capability.name}</h3>
            <p>{capability.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
