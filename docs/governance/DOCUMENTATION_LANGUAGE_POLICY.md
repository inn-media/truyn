# TRUYN Documentation Language Policy

**Effective:** October 13, 2026. **Scope:** inn-media/truyn and inn-media/truyn-platform, without exceptions for either repository.

## Mandatory English

All documentation and explanatory prose MUST be written **exclusively in English at all times**. This applies to README files, specifications, RFCs, ADRs, protocols, architecture, SDK and API guides, governance, runbooks, comments and docstrings, benchmark/evidence narratives, changelogs, release notes, generated documentation, PR/issue descriptions and user-facing technical material. English-only applies to every new and modified document, not only final published pages. Human reviewers MUST reject foreign-language prose, including languages written with Latin characters. Mixed-language and bilingual documents are prohibited.

## Immutable technical evidence

The rule does not authorize changing historical signed bytes, Ed25519/TCJ1, Node IDs, hashes, Unicode interoperability test vectors, frozen fixtures, benchmark evidence, canonical tokens or protocol identifiers. Original non-English strings may appear only where they are **literal test data** inside fenced or inline code samples and exact-byte artifacts. All adjacent prose, explanatory comments and labels must be English. Original external foreign-language source material must stay outside the current documentation tree; preserve its cryptographic digest and publish a faithful English translation with its own new digest. An English translation cannot claim byte identity with its foreign-language source.

## Mandatory review and CI

The existing required CI workflows execute the full tracked-tree scanner at scripts/check-documentation-language.mjs and its built-in self-tests on each PR and main push. No default exclusions or whole-document language waivers. The scanner rejects non-Latin script prose and non-English filenames while protecting cryptographic Unicode examples; because it cannot prove English for other Latin-script languages, English language review remains mandatory. Skipped, neutral and failed checks cannot be counted as PASS. Every change spanning both repositories needs independent, English-only documentation in the correct ownership scope.

No deployment, provider requests, paid benchmarks or changes to existing network acceptance criteria are allowed solely for language cleanup.

## Closure

Both repositories must have full tracked-documentation checker PASS, reviewed English-only source documentation, complete CI at exact HEAD and again on merged main. Until then the English-only repository sanitation gate remains OPEN.
