# Legal and compliance notes

## Status

This document is a project risk register, not legal advice.

## Russian market

Before commercial launch in РФ, obtain professional legal review of the exact service model, contract language and functionality.

Material question:

- software/SaaS for customer self-service diagnostics and monitoring;
- versus professional security monitoring, protectedness assessment, pentest or related services that can create licensing/regulatory obligations.

Do not assume naming a service `SaaS` automatically removes regulatory requirements.

## Product language

Avoid contractual/marketing claims:

- absolute protection;
- guaranteed vulnerability absence;
- guaranteed prevention of compromise;
- certification/compliance without applicable assessment process.

## Authorization to scan

Guest mode remains safe/passive.

Active/deep scanning requires:

- verified asset scope;
- customer authorization in terms/product flow;
- explicit opt-in where scanning mode carries additional operational risk.

Before introducing authenticated DAST, intrusive testing or internal scanner, review legal/contractual scope again.

## Data protection

Before production define:

- privacy policy;
- personal-data processing basis;
- data retention;
- storage region/data residency;
- subprocessors;
- customer deletion/export;
- incident process.

Scan evidence must follow minimization principles because technical responses can contain personal or confidential data.
