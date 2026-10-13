# TRUYN/1 — FINAL WIRE FREEZE ARCHITECTURE: CORE

**Версия документа:** согласованный проект к утверждению, 11 октября 2026. **Статус реализации:** `PROPOSAL / NOT DEPLOYED / NOT STABLE-V1`. Ни один статус действующей сети не меняется данным документом. После одобрения только по квалифицированным изменениям в двух репозиториях.

**Репозитории:** `inn-media/truyn` — открытая нормативная спецификация, справочный Node/Relay, SDK, conformance и публичное evidence; `inn-media/truyn-platform` — private managed runtime/control plane, leases, metering, authority, закрытая топология и billing. Приватный репозиторий **потребляет** только опубликованные, versioned, digest-pinned public contracts/artifacts. Никаких private → public runtime зависимостей.

**Источники:** три переданных документа (`TRUYN_CORE_WIRE_TYPES`, `TRUYN_NON_CORE_WIRE_TYPES`, `TRUYN_ENVELOPE_EXT`), проверенные текущие `spec/protocol/v1/envelope.md`, `core.md`, `migration.md`, `docs/compatibility/TRUYN1_RC_GAP_LEDGER.md` и private README. При противоречии между предложением и работающим протоколом защищаем legacy wire, не выдаём предложения за существующий runtime.

## 1. Замороженная модель и нерушимые инварианты

1. **Расширенный CORE сохраняется полностью:** классы `A SESSION`, `B CONTROL`, `C ENVELOPE / IDENTITY / OFFER / NEED / RESULT / REVOKE / CAPABILITY / COMMITMENT`, `D COMPACT`, `E OUTCOME`, `F TELEMETRY`, `G DATA`, `H TRUST`, `I COMPUTE`. Не удалять и не понижать COMMITMENT, DATA, TRUST, COMPUTE, METRICS/TRACE/HEARTBEAT или иные согласованные CORE строки.
2. **Registry entry ≠ physical Envelope type ≠ mandatory execution.** Запись CORE означает *канонический, резервируемый идентификатор и семантическое семейство*. В текущем signed-envelope профиле физических `MVP_TYPES` остаётся ровно пять: `IDENTITY`, `OFFER`, `NEED`, `RESULT`, `REVOKE`. Остальные CORE записи остаются семантическими объектами, subprotocol method, result/error status, compact frame или role-scoped/negotiated feature до отдельного wire admission. Так весь CORE остаётся CORE, не ломая историческую сеть.
3. **All-node obligation:** любая реализация должна понимать совместимость и поддерживаемые формы, сохранять подписи и отказывать безопасно; нельзя требовать, чтобы старый бинарник внезапно распознавал новые восьмизначные коды. Обязанность распознавания полного CORE наступает **для сборок заявленного полного профиля** после тестов; для ранее выпущенных release профилей действует их задокументированная supported-surface матрица. Unsupported = `unimplemented`, required semantic missing = `version_mismatch`, никакого исполнения.
4. **CODE — registry-only decimal string (8 digits), Short — documentation/telemetry alias.** Не добавлять ни `code`, ни Short в подписанный Envelope, QUIC RPC, compact `{t,i,s}`, HTTP JSON или существующие protobuf без отдельного negotiated profile. Коды неизменны, не переиспользуются; групповые строки — **не отдельные физические сообщения**. `00000000` зарезервирован и отклоняется в профиле, где коды вообще передаются. Existing literal `kind`, `type`, `method`, `t` остаются байт-в-байт прежними.
5. **WELCOME/A20 — семантическое имя; session wire `kind:"ACCEPT"` НЕ переименовывать.** `ACCEPT/C73` — новое опциональное принятие обязательства, не путать с session ACCEPT; `STATUS/C75` — состояние обязательства, `STATE/G20` — данные, `OUTCOME/E00` — итог операции, `HEARTBEAT/F40` — живой процесс, QUIC keepalive — транспорт. `SYNC/B60` = anti-entropy/control state, `DELTA/G30` = versioned domain state, `CONTEXT_DELTA/D60` = уже работающий контекстный transport path; ни один не переписывает другой.
6. **Не менять уже работающие маршруты.** `/v1/register`, `/v1/offers`, `/v1/needs`, `/v1/results`, `/v1/revoke`, `/v1/fast/*`, `/v1/contexts`, QUIC `dht.*`, `peer.announce`, ALPN `truyn/1`, DHT RF3/minAcks2, signed peer-record, reconnect/retire, context CID, provider-gate, A2A/MCP/NLWeb/REST API edges остаются. Новые адаптеры должны делегировать тому же authoritative policy/dispatch/idempotency core и не дублировать исполнение.
7. **Изменения строго additive/opt-in.** Старые подписанные объекты и хранилища не переписываются. Новая optional схема объявляется версионированной semantic ID и применяется только после capability+version negotiation; любой неизвестный обязательный semantic = fail closed, без silent downgrade. Нельзя разрешать fallback на другую схему подписи или более слабую проверку.
8. **Улучшение ≠ ложная совместимость.** Если надо обязательное новое поле, изменить подпись, Node-ID, causal/terminal behavior или persisted state incompatibly — нужен новый versioned profile / новое поколение; не делать массовую миграцию в активных кампаниях. Все фазы имеют offline, shadow, canary, rollback и frozen exact-SHA baseline.

## 2. Физические формы (однозначные mapping правила)

| Реестр CORE | Сегодняшняя форма | Новая допустимая форма | Не делать |
|---|---|---|---|
| A10 HELLO / A20 WELCOME / A30 VERSION | signed session-hello/ACCEPT; negotiation helper | отдельный opt-in negotiation version/semantic capability; legacy HELLO остаётся доступным | менять `kind:"ACCEPT"`, required поля старого HELLO |
| B10–B50 | `dht.ping`, `dht.find-node`, `peer.announce`, `dht.store`, `dht.find-value` | документировать alias/codes; добавить negotiable registry | переименовывать RPC или менять RF/quorum/TTL |
| B60 SYNC, B70 ADVERTISE, B80 DISCOVER | anti-entropy planned; HTTPS agent descriptor; relay/DHT discover | отдельные versioned profile/API contracts | делать ADVERTISE эквивалентом OFFER либо discovery авторизацией |
| C10–C50 | пять подписанных Envelope типов | замороженный bounded Open 1.0 словарь | добавлять C71–C75 в `MVP_TYPES` без отдельного negotiated profile |
| C60 CAPABILITY / C70–C75 COMMITMENT | поле в OFFER/NEED; коммерческий слой как метаданные/контракты | registry CORE + optional schemas/extension processing | навязывать CONTRACT/ORDER любому node, трактовать оплату как entitlement |
| D10–D60 | существующий compact `{t,i,s}`, endpoints, context CID | aliases + feature gated additions | менять `t=N/R/T/C/P/D`, вводить `D` для STATE DELTA |
| E00–E26 | текущие `ok`, `error`, legacy `TRUYN_*` | additive error normalization при сохранении wire API и lossless diagnostic aliases | менять коды/HTTP ответы прежних SDK без migration и contract checks |
| F10–F40 | локальная observability; heartbeat proposed | opt-in schema/events | объявлять новый heartbeat обязательным старым long-running actors |
| G10–G40 | OBJECT refs, context routes, draft STATE/DELTA/SUBSCRIBE | negotiated data schemas, explicit resolver | допускать auto-fetch неизвестного URL или невидимую перезапись state |
| H10–H70 | claims/attestations/receipts как structured payload/references | accepted variants + alias mapping with explicit version | менять signed verdict `support/contradict/uncertain` на другой текст без migration |
| I00 COMPUTE | `NEED` + executable provider capability, draft profile | optional sandboxed compute capability | создавать обязательный новый `type:"COMPUTE"` |

**Unmodified compact signed forms:** не переосмыслять `t=...` как новый JSON Envelope; их подписи, field names и idempotency согласовываются собственными тестами. Не вставлять `ext` в compact payload, если формат этого не определяет; trace linkage передавать в поддерживаемых metadata/transport fields или future opt-in frame.

## 3. Envelope Freeze + optional `ext` (интегрировано из третьего файла)

### 3.1. Базовый подписанный конверт

| Поле | Требование |
|---|---|
| `protocol` | required, ровно `TRUYN/1` |
| `type` | required, **только** `IDENTITY | OFFER | NEED | RESULT | REVOKE` для bounded Open 1.0 |
| `id` | required, непустой идентификатор; duplicate semantics зависят от logical operation |
| `from` | required; `truyn:node:` + lowercase SHA-256(hex) от Ed25519 SPKI DER, проверяется против `publicKey` |
| `createdAt` | required, валидный RFC3339 UTC; отклонять malformed до dispatch; текущие допустимые варианты legacy timestamps не сужать без inventory |
| `publicKey` | required в текущем профиле, Ed25519 public SPKI PEM |
| `payload` | required non-null JSON object; type-specific schema; не добавлять service metadata внутрь закрытых OFFER/NEED/RESULT |
| `signature` | required, standard Base64 Ed25519 64 bytes |
| `to` | optional в нормативном wire; текущие writers выводят `to:null` либо Node ID и не меняют подписанное после создания. **НЕ повышать `to` в required:** старые валидные envelopes без `to` продолжают приниматься; SDK DTO может требовать emitted `to` для своего writer contract. |
| `ext` | **optional** единственный выделенный extension object из нового proposal; присутствует в подписи; поддержка семантики и strict validation только после negotiation `truyn.envelope.ext/1` |

Ни одно существующее signed Envelope поле не переименовывается и не перемещается. Для неизвестных top-level optional fields сохраняется **signature coverage** и legacy ignore behavior там, где это разрешено текущим профилем; новый parser не должен предполагать, что только `ext` в принципе возможен (это сломает уже подписанные сообщения). **Новые стандартизируемые служебные поля** далее добавлять лишь в `ext`, не запрещая исторические unknown optional extensions.

### 3.2. Canonical JSON / TCJ1 — byte invariant

`unsigned = receivedEnvelope without ONLY top-level signature`, `signedBytes = UTF8(TCJ1(unsigned))`, Ed25519 по этим байтам **без нового domain prefix/hash**. `protocol` и `type` содержатся в подписанных данных и задают текущий домен. Обязательные свойства: recursive UTF-16 code-unit key ordering; array original order; non-ASCII and emoji UTF-8 literal where valid; JSON-required escapes only (`"`, backslash, U+0000–U+001F); HTML `<>&` и U+2028/U+2029 НЕ additional-escape; finite ECMAScript shortest-roundtrippable number serialization (`1.0→1`, `-0→0`, `1e-7`, `1e+21`, `0.000025`); no whitespace/BOM/trailing LF; `true/false/null`. Для I-JSON domain совместимо с RFC8785. Ограничение безопасных integer и unpaired surrogates вводить **на безопасных новых входах после совместимостного corpus audit**, не переинтерпретировать сохранившийся исторический подписанный JSON. Бинарные и точные большие целые: ссылки/строки в versioned schemas.

**Текущий выявленный дефект conformance:** исследование предоставленного Envelope-черновика показало расхождения Python (UTF-16/order/float), Go (UTF-16/HTML/U+2028/negative-zero), Java (integer→Double/float), а .NET был не проверен. Это **не основание менять JS TCJ1**. Надо исправить SDK против byte fixtures, не добавлять multi-canonicalization fallback. Утверждать, что каждый SDK уже проходит все edge cases, запрещено до независимого прогонов на exact head.

### 3.3. Формат `ext/1` и переходная безопасность

- `ext` отсутствует = исходное поведение. Если есть: JSON object; до 16 keys; canonical TCJ1 object до 1024 bytes; keys `[A-Za-z][A-Za-z0-9]{0,31}`; значения 1–128 ASCII chars `[A-Za-z0-9._:;=/+-]`; `crit` — единственное array of names исключение, все имена объявлены внутри того же ext.
- Зарегистрированы `traceId` (32 nonzero lowercase hex, correlation only), `expiresAt` (UTC timestamp; **accept-before** deadline), `priority` (`background|normal|critical`, только hint с server-side policy), `contentType` (`application/json` или `application/json;profile=...`), `crit` (critical recognized keys).
- Наличие `ext` без доказанной negotiated support **не даёт гарантии** обработки TTL/crit/priority/contentType. Strict reject unknown `crit` допустим **только** при объявленном и согласованном `truyn.envelope.ext/1`. Отправитель **никогда не полагается** на expiresAt enforcement старого узла; sensitive workloads fail closed до отправки, если гарантии не согласованы.
- В согласованном профиле receiver после подписи валидирует `ext`, неизвестный ключ `crit` → `version_mismatch`, просрочку → `deadline_exceeded` **до dispatch**, unsupported content profile → `unimplemented`; no side effects. `expiresAt` > `createdAt`, bounded clock skew ±30s (если такое окно разрешено canonical receiver policy); общее ограничение TTL/identity freshness/nonce/replay проверяется **отдельно**; `expiresAt` не заменяет `NEED.policy.deadline` и не даёт удалять duplicate ledger при наличии nonterminal execution.
- `traceId` — signed app correlation, но не делает trace-id доверенной identity; не подменять исходный traceId в ранее подписанных RESULT и не требовать его там, где signer/schema старой версии его не содержал.
- `priority:critical` может быть downgraded к normal и **не гарантирует QoS/delivery**; ни `ext`, ни descriptor, ни payment metadata не дают authorization.
- `compression` — transport only (HTTP Content-Encoding / opt-in QUIC semantics); подпись над неизменённым TCJ1 JSON, decompressed size/ratio limits; чужие encrypted/compressed frames должны сохранять свою signing domain.
- SESSION negotiation нельзя добавить в старый signed HELLO новым required field. Порядок: passive advertisement (Agent Descriptor) → separate opt-in negotiation or compatible handshake extension after test → sender gated ext emission → strict require only for peers with proven mutual support.

### 3.4. Conformance vectors (сохранить исходные байты)

**Reference:** 20 TCJ1 input/output vectors + E1 ASCII signed + E2 Unicode/numbers signed + E3 signed `ext`; также tamper `ext`, malformed `ext`, unknown `crit`, expired `expiresAt`, unknown profile. Полные golden байты/подписи исходного документа `TRUYN_ENVELOPE_EXT.md` сохранять как **append-only source fixture**, не нормализовать вручную. Tests выполнять Node, Python, Go, Java, .NET, а TypeScript client path отдельно проверять как delegating/non-signing API (не приписывать ему standalone Ed25519).

## 4. Safe errors / lifecycle / authority

- **Лексикон ошибок и existing error transport различаются.** `E211` и другие реестровые коды — semantic mapping к `errors.md`. Legacy `TRUYN_*` оставаться на legacy wire до доказанной совместимости. Новые значения нельзя массово переключать на `error` без измерений consumer parsing. Для нового opted-in profile можно добавить normalized alias/structured detail не изменяя legacy key. `unimplemented` = нет поддержки, `version_mismatch` = нет required semantics, `permission_denied` = нет прав, invalid signature = reject, все до исполнения.
- **Idempotency:** одна logical NEED — максимум одно provider side effect в соответствии с declared exactly-once guarantee. Повтор id с тем же digest получает существующее состояние/результат, другой digest конфликтует; но это будущая унификация: не менять внезапно действующий `/v1/fast/needs` 409 behavior, пока SDK и replays не доказаны на совместимом profile. `PARTIAL.sequence` monotonic, exact duplicate safe, terminal RESULT once; accepted REVOKE suppresses late PARTIAL/RESULT.
- **Authority chain:** authenticated identity → authenticated tenant/owner resolution → provider policy/entitlement/allowlist → quota/spend → dispatch → provider-side recheck. Discovery/descriptor/offer/`to`/`ext` не уполномочивают. Public relay не предоставляет чужие paid providers. Invalid grants/keys/revocation fail closed across every path: HTTP, QUIC, WebSocket, MCP, A2A, NLWeb, SDK, compact and private managed gateway.
- **DATA/TRUST semantics:** OBJECT manifest/ref explicit resolver, SHA-256/byte-size verification, no implicit URL fetch. CLAIM/ATTEST signed verdict casing is **version-dependent**: existing `support|contradict|uncertain` remains accepted in implemented profile, planned `SUPPORTS|DISPUTES|INCONCLUSIVE` allowed only as explicit future schema mapping with signed-byte preservation; no silent global string replacement. TRUYN trust receipt v1/v2 remain separate versioned artifacts, neither silently invalidates historic receipt. REVOKE existing `need|offer` unchanged; `key|grant|subscription|lease|contract|order` future opt-in targetKind schemas with clear authority, not accepted simply because text appears in contract.

## 5. Полный CORE реестр (идентификаторы закреплены, все классы сохранены)

Ниже оригинальный расширенный реестр без сокращения CORE. Колонка «состояние» отражает источник-предложение (snapshot), **не означает автоматический wire admission**. Для интерпретации «Обязательна всем» применяются §§1–4 настоящего финального проекта; прежде всего опциональные и role-only типы нельзя превращать в обязательные legacy handlers.


| CODE | Short | ID | CORE | Обязательна всем | На проводе сейчас | Описание | Где | Состояние |
|---|---|---|---|---|---|---|---|---|
| 00000000 | — | UNSPECIFIED | Да | Да (отвергать) | — | Резерв, такой код отвергается | — | новый |
| **10000000** | **A00** | **SESSION** | Да | Да | QUIC, ALPN `truyn/1`, TLS; relay `/v1/register` | Аутентифицированная сессия между узлами | network/transport/quic.js | существующий |
| 11000000 | A10 | HELLO | Да | Да | `session-hello` kind=HELLO | Открытие сессии (`truyn-peer-session-v1`) | network/sessions/authenticated-session.js | существующий |
| 12000000 | A20 | WELCOME | Да | Да | `session-hello` kind=ACCEPT | Ответ на HELLO, выдаёт sessionId | authenticated-session.js | существующий, переименовать в реестре |
| 13000000 | A30 | VERSION | Да | Да | нет | Согласование версии и обязательных семантик | core/protocol/negotiation.js | внедрить (код есть, к HELLO не подключён) |
| **20000000** | **B00** | **CONTROL** | Да | Частично | kind=`control` | Служебные RPC, DHT и обнаружение | network/discovery/quic-rpc.js | существующий |
| 21000000 | B10 | PING | Да | Да (кто принимает входящие) | `dht.ping` | Проверка, что контакт жив | quic-rpc.js | существующий |
| 22000000 | B20 | FIND_NODE | Да | Нет — роль: DHT | `dht.find-node` | Поиск k ближайших узлов по nodeId | quic-rpc.js | существующий |
| 23000000 | B30 | ANNOUNCE | Да | Нет — роль: DHT | `peer.announce` | Публикация peer-record: где меня найти | quic-rpc.js | существующий |
| 24000000 | B40 | STORE | Да | Нет — роль: DHT | `dht.store` | Запись в DHT (RF3/minAcks2) | quic-rpc.js, dht-replication.js | существующий |
| 25000000 | B50 | FIND_VALUE | Да | Нет — роль: DHT | `dht.find-value` | Чтение из DHT | quic-rpc.js | существующий |
| 26000000 | B60 | SYNC | Да | Нет — опц. (до определения семантики) | нет | Согласование состояния | — | новый |
| 27000000 | B70 | ADVERTISE | Да | Нет — роль: провайдер | `GET /.well-known/truyn-agent.json` (подписанный дескриптор) | «Я в сети, вот мои протоколы и интерфейсы» | agent-descriptor.md, openapi, SDK | существующий (DR v1), spec-черновик |
| 28000000 | B80 | DISCOVER | Да | Нет — роль: заказчик, relay | подбор в relay `/v1/offers`, verifier-DHT | Поиск участников по возможностям; даёт кандидатов, а не права | discovery.md | частично существует, spec-черновик |
| **30000000** | **C00** | **ENVELOPE** | Да | Да | kind=`envelope`, relay `/v1/*` | Подписанный конверт прикладных сообщений | core/protocol/index.js, envelope.md | существующий (RC) |
| 31000000 | C10 | IDENTITY | Да | Да | `/v1/register` | Ed25519-идентичность узла | identity.md, core/identity | существующий (RC) |
| 32000000 | C20 | OFFER | Да | Нет — роль: провайдер | `/v1/offers` | Предложение: что выполню и на каких условиях | offer.md | существующий (RC) |
| 33000000 | C30 | NEED | Да | Нет — роль: заказчик, провайдер | QUIC P2P, `/v1/needs` | Запрос на выполнение | need.md | существующий (RC) |
| 34000000 | C40 | RESULT | Да | Нет — роль: провайдер, заказчик | ответ по QUIC, `/v1/results` | Терминальный результат NEED | result.md | существующий (RC) |
| 35000000 | C50 | REVOKE | Да | Нет — роль: все, кто поддерживает NEED/OFFER | `/v1/revoke` | Отзыв своего NEED или своего OFFER | revoke.md | существующий (RC) |
| 36000000 | C60 | CAPABILITY | Да | Нет — роль: все, кто поддерживает NEED/OFFER | поле `capability` в OFFER/NEED | Описание возможности (не сообщение) | capability.md | существующий (поле), spec-черновик |
| 37000000 | C70 | COMMITMENT | Да | Нет — опц. | — | Обязательства и коммерция | economics.md | новый (группа) |
| 37100000 | C71 | CONTRACT | Да | Нет — опц. | нет | Условия, согласованные уполномоченными сторонами; не доказывает платёж и не даёт прав | economics.md | новый |
| 37200000 | C72 | ORDER | Да | Нет — опц. | нет (цена и лимит — метаданные OFFER/NEED) | Конкретный заказ в рамках OFFER или CONTRACT; не доказывает платёж и не даёт прав | economics.md | новый |
| 37300000 | C73 | ACCEPT | Да | Нет — опц. | нет | Подписанное принятие обязательства | — | новый |
| 37400000 | C74 | REJECT | Да | Нет — опц. | нет | Отказ принять обязательство, причина — токен E2xx | — | новый |
| 37500000 | C75 | STATUS | Да | Нет — опц. | нет | Текущее состояние относительно OFFER/ORDER | — | новый |
| **40000000** | **D00** | **COMPACT** | Да | Нет — роль: relay | `{t,i,s}`, `/v1/fast/*` | Компактный быстрый режим | core/protocol/index.js | существующий |
| 41000000 | D10 | C_NEED | Да | Нет — роль: relay | `t=N`, `/v1/fast/needs` | Компактный NEED | relay/server.js | существующий |
| 42000000 | D20 | C_RESULT | Да | Нет — роль: relay | `t=R`, `/v1/fast/results` | Компактный RESULT | relay/server.js | существующий |
| 43000000 | D30 | PARTIAL | Да | Нет — роль: провайдер со стримингом | `t=T`, `/v1/fast/partials` | Частичный (потоковый) результат | partial.md | существующий (RC) |
| 44000000 | D40 | CHAIN | Да | Нет — роль: relay | `t=C`, `/v1/fast/chains` | Цепочка шагов | relay/server.js | существующий |
| 45000000 | D50 | CONTEXT_PUT | Да | Нет — роль: хранилище контекстов | `t=P`, `/v1/contexts` | Запись контекста | relay/server.js | существующий |
| 46000000 | D60 | CONTEXT_DELTA | Да | Нет — роль: хранилище контекстов | `t=D`, `/v1/contexts/<cid>/delta` | Изменение контекста | relay/server.js | существующий |
| **50000000** | **E00** | **OUTCOME** | Да | Да | `ok` + `error` | Итог операции | errors.md | существующий, стандартизировать |
| 51000000 | E10 | SUCCESS | Да | Да | `ok:true` | Успех, подтип в поле `outcome` | — | существующий |
| 51100000 | E11 | completed | Да | Да | `ok:true` + результат | Выполнено, итог финальный | relay/server.js | существующий |
| 51200000 | E12 | queued | Да | Да | `ok:true, needId, provider` | Принято в очередь; обязательства нет | relay/server.js | существующий, без токена |
| 51300000 | E13 | idempotent | Да | Да | REVOKE: `idempotent:true` | Повтор уже выполненной операции | relay/server.js | существующий, без токена |
| 51400000 | E14 | degraded | Да | Да | нет | Успех с оговоркой | — | новый |
| 52000000 | E20 | ERROR | Да | Да | `ok:false, error=<token>` | Ошибка; группа говорит клиенту, что делать дальше | errors.md | существующий, привести к errors.md |
| 52100000 | E21 | REQUEST | Да | Да | — | Ошибка запроса → не повторять | — | новый (группа) |
| 52110000 | E211 | invalid_argument | Да | Да | `TRUYN_RELAY_INVALID_ENVELOPE`, `invalid_json` | Запрос нарушает контракт | errors.md | существующий (RC) |
| 52120000 | E212 | not_found | Да | Да | `TRUYN_PEER_NOT_FOUND`, `TRUYN_RELAY_MESSAGE_NOT_FOUND`, `not_found` | Нет такого узла, записи или сообщения | runtime.js, relay-service.js | новый |
| 52130000 | E213 | already_exists | Да | Да | `duplicate_request`, `duplicate_chain` (409) | id уже занят другим запросом | relay/server.js | новый |
| 52200000 | E22 | ACCESS | Да | Да | — | Нет доступа → не повторять, fail closed | — | новый (группа) |
| 52210000 | E221 | unauthenticated | Да | Да | `TRUYN_RELAY_UNAUTHORIZED`, `TRUYN_IDENTITY_REVOKED`, `quic_session_required` | Идентичности нет, она истекла или отозвана | errors.md | существующий (RC) |
| 52220000 | E222 | permission_denied | Да | Да | `TRUYN_TESTNET_OPERATOR_DENIED` | Идентичность есть, прав нет | errors.md | существующий (RC) |
| 52300000 | E23 | COMPAT | Да | Да | — | Несовместимость → не повторять | — | новый (группа) |
| 52310000 | E231 | version_mismatch | Да | Да | нет (к HELLO не подключено) | Версия или обязательная семантика не согласуются | negotiation.js | существующий (RC) |
| 52320000 | E232 | unimplemented | Да | Да | `TRUYN_NO_ENVELOPE_HANDLER`, `TRUYN_TESTNET_FAULT_CONTROL_DISABLED` | Узел не поддерживает операцию или тип | errors.md | существующий (RC) |
| 52400000 | E24 | TEMPORARY | Да | Да | — | Не выполнено, сбой временный → повтор с backoff | — | новый (группа) |
| 52410000 | E241 | resource_exhausted | Да | Да | `TRUYN_BUSY`, `TRUYN_BACKPRESSURE` | Перегрузка, очередь полна (shed) | quic.js, peer-discovery.js | новый |
| 52420000 | E242 | unavailable | Да | Да | `TRUYN_RELAY_UNAVAILABLE`, `TRUYN_RELAY_SHUTDOWN`, `TRUYN_DHT_WRITE_QUORUM` | Узел или relay недоступен, либо кворум записи не набран | relay-service.js, dht-replication.js | новый |
| 52500000 | E25 | UNKNOWN_OUTCOME | Да | Да | — | Могло выполниться → повтор только если идемпотентно | — | новый (группа) |
| 52510000 | E251 | deadline_exceeded | Да | Да | `TRUYN_ROUTE_DEADLINE_EXCEEDED`, `TRUYN_P2P_CONNECT_TIMEOUT`, `TRUYN_DHT_RPC_TIMEOUT`, `TRUYN_RELAY_TIMEOUT` | Не уложились в дедлайн | errors.md | существующий (RC) |
| 52520000 | E252 | transport_error | Да | Да | `TRUYN_P2P_DISPATCH_FAILED`, `TRUYN_P2P_DIRECT_FAILED`, `TRUYN_P2P_CONNECTION_SUPERSEDED` | Сессия упала до получения результата | p2p.js | существующий (RC) |
| 52530000 | E253 | internal | Да | Да | `testnet_control_error:*` | Сбой у исполнителя или на узле | node-service.js | новый |
| 52600000 | E26 | TERMINAL | Да | Да | — | Завершено без валидного результата → не повторять | — | новый (группа) |
| 52610000 | E261 | invalid_response | Да | Да | `TRUYN_RELAY_INVALID_RESPONSE` | Ответ не по контракту или с неверной подписью | errors.md | существующий (RC) |
| 52620000 | E262 | cancelled | Да | Да | `cancelled` | Отменено владельцем через REVOKE | errors.md | существующий (RC) |
| **60000000** | **F00** | **TELEMETRY** | Да | Нет — опц. | нет | Показатели и данные о работе | — | новый |
| 61000000 | F10 | METRICS | Да | Нет — опц. | только локально `/status` | Метрики узла | network/testnet/node-service.js | внедрить на провод |
| 62000000 | F20 | HEALTH | Да | Нет — опц. | только локально `/dht/readiness` | Готовность узла | node-service.js | внедрить на провод |
| 63000000 | F30 | TRACE | Да | Нет — опц. | нет (есть трасса CHAIN в relay) | Трассировка запроса | — | новый |
| 64000000 | F40 | HEARTBEAT | Да | Нет — роль: исполнитель долгих задач | нет (предложен compact `t=H`) | Сигнал «жив, выполняю» на долгих задачах | — | новый |
| **70000000** | **G00** | **DATA** | Да | Нет — роль: данные | нет | Данные и состояние | — | новый класс |
| 71000000 | G10 | OBJECT | Да | Нет — роль: данные (проверка digest — всем, кто материализует) | ссылка по хэшу в payload | Неизменяемый объект, адрес = хэш | object.md | существующий (RC: ссылка и целостность) |
| 72000000 | G20 | STATE | Да | Нет — роль: данные | нет | Версия изменяемого знания (не путать со STATUS) | state.md | внедрить (spec-черновик) |
| 73000000 | G30 | DELTA | Да | Нет — роль: данные | нет | Изменение STATE | delta.md | внедрить (spec-черновик) |
| 74000000 | G40 | SUBSCRIBE | Да | Нет — роль: данные | нет | Подписка на изменения | subscribe.md | внедрить (spec-черновик) |
| **80000000** | **H00** | **TRUST** | Да | Нет — роль: верификатор, доверяющая сторона | внутри NEED/RESULT | Доверие и проверка | core/claims, core/trust | новый класс |
| 81000000 | H10 | CLAIM | Да | Нет — роль: верификатор, доверяющая сторона | `NEED.payload.input.claim` (`truyn-claim-v1`) | Подписанное утверждение | core/claims/index.js | существующий (код), spec-черновик |
| 82000000 | H20 | ATTEST | Да | Нет — роль: верификатор | `RESULT.payload.output.attestation` (`truyn-attest-v1`) | Подписанный вердикт верификатора | core/claims/index.js | существующий (код), spec-черновик |
| 83000000 | H30 | TRUST_RECEIPT | Да | Нет — роль: доверяющая сторона | нет, строится локально (`truyn-trust-receipt-v1/v2`) | Итоговая квитанция доверия | core/trust/ | существующий (код), spec-черновик |
| 84000000 | H40 | CHALLENGE | Да | Нет — роль: верификатор | NEED с `claim` (+`challenge`) | Запрос на проверку утверждения | node/active-trust-network.js | сценарий, не тип |
| 85000000 | H50 | VERIFY | Да | Нет — роль: верификатор | RESULT с ATTEST | Проверка верификатором | node/trust-verification.js | сценарий, не тип |
| 86000000 | H60 | DISPUTE | Да | Нет — роль: верификатор | ATTEST с вердиктом DISPUTES (в коде `contradict`) | Оспаривание, запускает доп. проверку | verification.md | сценарий, не тип |
| 87000000 | H70 | PROOF | Да | Нет — роль: верификатор, доверяющая сторона | поле `evidence` в CLAIM/ATTEST | Проверяемое свидетельство: хэш, подпись, квитанция | core/claims/index.js | существующий (поле), тип новый |
| **90000000** | **I00** | **COMPUTE** | Да | Нет — роль: вычислитель | нет | Исполнение вычисления у данных | compute.md | внедрить (spec-черновик) |


## 6. Согласованные границы вместо исходных открытых вопросов

| Вопрос | Принятое решение для будущей реализации |
|---|---|
| CORE большой, Open 1.0 только 5 | Полный CORE — обязательная общая *таксономия/семантический registry* целевой сети; пять Envelope kinds — bounded stable transport profile. Никакой CORE не удаляется. |
| CAPABILITY/OBJECT/PROOF/CHALLENGE и группы «тип или не тип» | Это семантические registry entries и data/composed records; они не становятся автоматическим `Envelope.type`. |
| `WELCOME` vs existing `ACCEPT` | WELCOME только имя registry, current session accept kind не меняется. |
| `STATUS`, `STATE`, `OUTCOME`, `HEARTBEAT` | Строго отдельные сущности. |
| VERSION/HELLO | Нельзя требовать новое поле старого HELLO; opt-in exchange с сохранением signed handshake domain, staged negotiation. |
| BID и EVENT | Сохраняются NON-CORE opt-in кандидаты; не повышаем в CORE и не уменьшаем CORE ради них. |
| Коды/aliases | Registry codes только для документации и telemetry до явно версионированного binary/compact profile; никакой rewrite существующего transport. |
| ERRORS | Нормативные meanings и reversible mapping; exact existing response representation сохраняется. |
| Duplicate/replay | Не ломать текущие backend contracts; исправлять side-effect vulnerabilities точечно, тестировать legacy и new одновременно. |
| TCJ1/SDK | Исправлять векторами несовпадающие подписанты, а не расширять permissive crypto fallback. |
| `to` field | Optional wire, emitted by current writers, signature-preserving. |
| Time TTL | Existing signed freshness unchanged; `ext.expiresAt` только negotiated, не ретроактивный hard requirement. |

## 7. Два репозитория — полный индекс работ после отдельного одобрения

**PUBLIC — `inn-media/truyn`:** `spec/protocol/v1/{README,core,envelope,identity,offer,need,result,revoke,errors,migration,agent-descriptor,capability,object,state,delta,subscribe,compute,attest,trust-receipt,verification}.md`, `proto/v1/*` только если wire-compatible, `docs/architecture/*`, `docs/compatibility/*`, `ROADMAP.md`, `README.md`, `SDK` docs и version matrix, `core/protocol/*` только минимальные доказанные багфиксы, `network/sessions/*` opt-in negotiated changes, `relay/*`, `node/*`, `sdk/{typescript,python,go,java,dotnet}/*` канонизация и conformance fixtures, `tests/*` protocol+legacy regression, append-only benchmark evidence, signed releases. **Не делать global rename, bulk regex, forbidden new required fields, re-sign persisted evidence.**

**PRIVATE — `inn-media/truyn-platform`:** private `README.md`, architecture/protocol compatibility matrix, release pins/digests, managed admission/policy/authority, billing/tenant/ledger schemas, telemetry/operational runbooks, CI compatibility consumer gate, privacy-preserving deployment telemetry and rollback. Не копировать public source, не публиковать private IAM IDs/tokens/topology в public, не мутировать private control plane по неподписанному protocol metadata. Оба репозитория должны отражать **один Contract ID** и exact upstream digest; private обновляется как consumer *после* принятия публичного immutable artifact, с independent staging/canary.

**Sanitation:** inventory tracked tree + docs + active PR/workflow dependencies; classify historical evidence vs active tests vs unreachable residue; redact secrets in situ, **never delete accepted evidence**; no wholesale rewrite of past benchmarks, no force-push; stale factual claims получают explicit historical labels. Действующие D/S/T/E/N/H/A, D-5000, Open-1.0 и private platform tasks должны оставаться isolated. Matrix `unchanged/affected/requalification` на каждом touched contract и consumer обязателен.

## 8. Plan of execution / reversibility / acceptance

1. **Read-only baseline:** current SHAs обоих main, active jobs/PRs/resource locks, matched public/private release manifests, baseline test signatures, golden fixture digest, dependency graph, adapter+API+SDK consumer inventory. Сохранить immutable ledger.
2. **Freeze spec as proposal PR only:** versioned registry, bounded five-type wire, mapping, TCJ1 fixtures и compatibility profile; никаких live workloads/deploy. Проверить public/private diff без private leakage.
3. **SDK-only correctness:** same canonical vectors all five languages; quarantined malformed/out-of-domain values; historical signed artifacts stay verifiable. Separate tests for SDKs that delegate to Node vs sign themselves; no multi-canonicalization signature downgrade.
4. **Dual-path staging:** new feature parser understands legacy+negotiated profile; existing output unchanged by default. Passive `ext` retention → opt-in semantic negotiation → canary ext emit → optional strict semantics. Existing peer without support continues baseline. No auto-add fields on forwarding.
5. **Cross-surface gates:** HTTP `/v1`, QUIC, fast/socket, DHT, MCP, A2A, NLWeb, REST, SDK 5, native clients, authority/revocation, persistent state, schema artifacts, trace/billing consumers. Both allow/deny and exactly-once side-effect negatives. Historical D-200/500/1000, S-10/20/50/100, semantic retrieval, prior independent evidence remain immutable and *valid for their frozen source*; exact new binary qualified separately; no forced paid rerun purely because docs updated.
6. **Qualification at exact SHAs:** premerge CI, CodeQL, DCO, protocol golden + negative conformance; package-build; backward/forward compatibility matrix; read-only deployment smoke; rollout shadow/canary; automated metric diff; independent PASS gate. Do not merge/redploy while a running campaign could be contaminated; defer or version-isolate shared components.
7. **Immutable public release → private pin + stage:** publish signed/digest-pinned source/sdk contract; private consumer accepts only immutable released artifact and runs staged end-to-end admission (zero unauthorized calls, zero secret leakage, zero duplicate side effects); no live traffic flip without approval.
8. **Rollback:** stop emitting new feature; revert versioned deployed candidate or roll back route while readers remain tolerant; preserve upgraded persisted state under versioned keys; do not downgrade crypto or authority. Release/reconciliation records both fail and pass without erasing original evidence.
9. **Draft→RC→stable:** remove `draft` wording ONLY once P1–P13 normative/spec/schema/runtime/five-SDK conformance and postmerge evidence PASS, plus release governance; stable protocol ≠ mainnet: long-duration A-SOAK/A-OPS/A-SLO/A-WIRE/A-NET and managed A-MGMT remain independent admission gates.

**NON-NEGOTIABLE:** 0 unauthorized provider calls; 0 accepted forged signed state; 0 acknowledged durable-write loss; 0 duplicate side effects in exactly-once operations; no negative impact on running isolation gates; no weakening of previously accepted floors; transparent fail-closed deviations. Any such event is STOP/ROLLBACK, not a reason to weaken acceptance.
