"use client";

import { useId, useState } from "react";

export function DomainPreview() {
  const inputId = useId();
  const helpId = useId();
  const [domain, setDomain] = useState("");

  return (
    <form className="domain-form" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor={inputId}>Домен</label>
      <div className="input-row">
        <input
          id={inputId}
          name="domain"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="example.ru"
          aria-describedby={helpId}
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
        />
        <button
          type="submit"
          disabled
          title="Guest Scan будет доступен после прохождения Gate B1"
        >
          Проверка готовится
        </button>
      </div>
      <p id={helpId}>
        Введите домен без https://, пути и порта. Запуск проверки пока отключён.
      </p>
    </form>
  );
}
