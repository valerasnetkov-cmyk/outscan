import Image from "next/image";
import {
  CapabilitiesSection,
  getHomepageCapabilities,
} from "./capabilities-section";
import { DomainPreview } from "./domain-preview";

const steps = [
  [
    "01",
    "Базовая проверка",
    "Безопасная проверка публично доступной конфигурации.",
  ],
  [
    "02",
    "Подтверждение владения",
    "DNS TXT открывает проверку точного подтверждённого хоста.",
  ],
  [
    "03",
    "Мониторинг",
    "Подключается отдельно после подтверждения и явного выбора.",
  ],
] as const;

export default function HomePage() {
  const capabilities = getHomepageCapabilities();

  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <header className="site-header shell">
          <a className="brand" href="#top" aria-label="OUTSCAN — на главную">
            <Image
              src="/logo-white.svg"
              alt="OUTSCAN"
              width={157}
              height={42}
              priority
            />
          </a>
          <nav aria-label="Основная навигация">
            {capabilities.length > 0 ? (
              <a href="#coverage">Возможности</a>
            ) : null}
            <a href="#process">Как это работает</a>
            <a href="#principles">Подход</a>
          </nav>
          <span className="build-status">PREVIEW · GATE A</span>
        </header>

        <div className="hero-content shell" id="top">
          <p className="eyebrow">EXTERNAL RISK MONITORING</p>
          <h1 id="hero-title">Внешние риски под контролем.</h1>
          <p className="lede">
            OUTSCAN помогает видеть публичный цифровой периметр, обнаруженные
            риски и изменения — с понятным контекстом для бизнеса и технической
            команды.
          </p>
          <DomainPreview />
        </div>
      </section>

      <CapabilitiesSection capabilities={capabilities} />

      <section
        className="section section-muted"
        id="process"
        aria-labelledby="process-title"
      >
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow dark">ПРОЦЕСС</p>
            <h2 id="process-title">От наблюдения к мониторингу</h2>
          </div>
          <ol className="steps">
            {steps.map(([number, title, description]) => (
              <li key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="principles shell"
        id="principles"
        aria-labelledby="principles-title"
      >
        <div>
          <p className="eyebrow dark">ПРИНЦИПЫ</p>
          <h2 id="principles-title">
            Результат с честной границей уверенности
          </h2>
        </div>
        <p>
          Отсутствие находок не означает безопасность. OUTSCAN показывает
          покрытие проверки, состояние наблюдений и основания для приоритета —
          без абсолютных обещаний.
        </p>
      </section>

      <footer className="footer">
        <div className="shell footer-content">
          <Image src="/logo.svg" alt="OUTSCAN" width={142} height={38} />
          <p>© 2026 OUTSCAN · outscan.ru</p>
        </div>
      </footer>
    </main>
  );
}
