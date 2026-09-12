# Security Glossary seed review

Status: DRAFT editorial input; not approved registry data
Parent contract: current canonical `docs/SECURITY_GLOSSARY.md`

## Structural reconciliation performed in this package

The four supplied content files were preserved as editorial seed and received only two mechanical corrections:

1. the blank `Monitoring` slug is set to `monitoring`;
2. nine `Category: infrastructure` values are normalized to the accepted glossary category `network-infrastructure`.

The capability slug `infrastructure` is not renamed by this correction. Glossary category names and ProductCapability slugs are separate vocabularies.

After the blank slug is corrected, the source set contains 91 term headings/records. This count is a seed inventory observation, not proof that all 91 terms are approved for publication.

## Semantic blockers still requiring review before import

At minimum, review and correct:

- `passive-scan`: do not describe the entire Guest flow as passive. Current Guest is safe/non-intrusive but may perform direct DNS/TLS/HTTP requests in addition to passive/public sources.
- `active-scan`: describe ACTIVE as a general/future security-testing concept. Current V1 keeps ACTIVE disabled; verified scope alone must not imply it is currently available.
- any IP/CIDR/raw TCP/Naabu/headless/DAST/SAST/SCA wording that could imply current V1 capability;
- Potential/Probable/Confirmed wording so editorial terms do not invent unsupported machine states;
- scanner/tool wording so a glossary definition cannot grant ProductCapability publication or ScanAuthorization;
- all public-copy claims against Claim Inventory and current Capability evidence.

## Integration rule

Copy `docs/glossary-seed/*.md` only as DRAFT source material. Do not import it into a runtime registry, sitemap, public API or page during this documentation-sync task.

Before runtime import:

1. complete content/security review term by term;
2. resolve every blocker above;
3. validate slugs/categories/aliases/relations/capability references against the implemented registry schema;
4. set review states only through the canonical registry workflow;
5. run the canonical glossary tests and claim review;
6. publish only after post-B1 product/accessibility evidence.
