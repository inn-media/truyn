# TRUYN/1 — FINAL NON-CORE, EXTENSIONS, PROFILES & COMPOSITIONS

**Версия документа:** согласованный проект к утверждению, 11 октября 2026. **Статус:** `PROPOSAL / NO IMPLEMENTATION / NO DEPLOYMENT`. **Компаньон:** `TRUYN_WIRE_FREEZE_CORE_FINAL.md`. Этот каталог не уменьшает, не заменяет и не переименовывает ни одной записи расширенного CORE.

## 1. Правила согласованной классификации

- **CORE** = сохранённая полная публичная классификация A–I из companion. Это каноническая таксономия, а не требование сделать каждую запись новым физическим `type`. `MVP_TYPES` остаются пятью.
- **EXTENSION** = необязательная версионированная семантика/операция, которой может потребоваться собственный тип, **но только после независимого wire admission и negotiated support**. Статус в каталоге **не утверждает, что такой тип уже существует в сети**.
- **PROFILE** = необязательная специализированная семантика/схема/транспортный режим, совместимый с общим CORE. Ни robotics, ни industrial не получают обоснованных safety guarantees только из факта доставки.
- **COMPOSED** = существующие CORE forms + версии схем/operation/capability, без нового top-level Envelope type.
- **Безопасный режим:** любой неизвестный type не исполняется; неизвестная обязательная семантика — `version_mismatch` при реально согласованном negotiation, отсутствие optional capability — `unimplemented`; старым потребителям не подмешиваются новые required fields. Feature support ≠ provider authorization.

Отдельный настоящий wire type оправдан только если формально доказана необходимость в транспортном поведении, необычном согласованном жизненном цикле, runtime authorization rule или массовом потоке, который не решается существующим protocol/profile. **На стадии freeze ни один из перечисленных кандидатов не автоматически становится новым `Envelope.type`, QUIC `method` или compact letter.** Все потенциально breaking features должны оставаться выключенными до отдельного versioned extension conformance.

## 2. Решённые противоречия и обязательные границы

| Коллизия источников | Единое решение |
|---|---|
| «каждый CORE обязан понимать всё» vs legacy clients | Полный CORE сохраняется как registry/target conformance; старые версии обязаны своему frozen supported profile, а не будущим типам. |
| `EVENT` EXTENSION vs `SUBSCRIBE` CORE | `SUBSCRIBE` остаётся CORE. `EVENT` — **opt-in delivery profile/EXTENSION candidate**; пока event delivery может быть composed от existing subscribed state/partial/result без изменения base `MVP_TYPES`. Новая гарантия at-least-once только после durable offset/ack/replay conformance. |
| `RETRIEVE` vs existing GET/context | `RETRIEVE` — logical opt-in extension; старые verified HTTP/context CID reads остаются. Нет авто-fetch, private access проверяется sender/holder отдельно. |
| `DISCONNECT` vs QUIC retire | Не переименовывать, не заменять existing `retire`/in-flight drain. Мягкий drain может быть opt-in advisory и не отменяет таймауты/guarantees. |
| `PAUSE/RESUME` vs NEED deadlines | Только coordinated opt-in lifecycle: requester-controlled; deadline продолжает течь по исходной политике, если не согласована отдельная signed authorization amendment; no implicit extension of work/budget. |
| `DELEGATE/HANDOFF` vs authority and exactly-once | Верифицированные scoped grants, least privilege, requester consent where required; до atomic accept+fencing старый executor ответственен; нет double execution. |
| `LEASE` vs DHT lease | `LEASE` application resource-right proposal не заменяет peer-record TTL/DHT renewal, Azure lease, private entitlement; expires + fencing token строго domain-specific. |
| `DELETE` vs append-only evidence | Delete только authoritatively owned/erasable data at one holder; immutable benchmark/receipts/audit не удалять. Для protected evidence — redact sensitive fields, store tombstone/access revocation where permitted. No promise global deletion. |
| `BID` vs CORE CONTRACT/ORDER | `BID` optional quoted commercial offer, без платежного права; CONTRACT/ORDER остаются CORE registry, wire admission отдельный. |
| `TIME_SYNC` vs crypto freshness | Best-effort clock uncertainty estimate; secure signed-message freshness remains enforced locally, no clock-sync-based auth bypass. |
| `SENSOR_DATA` vs full signed Envelope | Optional compact sensor framing требует отдельного signed batch/profile; не использовать занятые `t` aliases и не обходить integrity/sender/billing. |
| `SAFE_STOP` reliability promises | **Никаких обещаний never-drop, hard real-time или trusted-stop по WAN**. Команда только authorized advisory request; safety interlocks и независимая аппаратная emergency-stop локальны. No pre-authorized bypass at receive. |
| `ALARM` independent lifecycle | Alarm state versioned and idempotent, with policy-bound acknowledgement; Event/state can transport it until profile conformance available. |
| `crit` / extension required support | strict `crit` only after negotiated `truyn.envelope.ext/1`; legacy peers receive no relied-upon critical semantics. |
| `error/priority` normalization | Preserve existing wire error/compact/queue behavior; introduce typed semantics without bulk renames; critical remains hint and can shed under legitimate fail-closed capacity policy. |

## 3. Extension admission template (для каждого включаемого типа)

`semanticId`, version, public schema, legacy mapping, supported roles, required security and authority, negotiated eligibility, backward+forward matrix, transport binding (Envelope/QUIC/HTTP/compact), idempotency/terminal semantics, failure taxonomy, limits, observability/redaction, feature flag default=false, exact-head CI and all five SDK conformance, migration/rollback, paired public/private manifest digests. Новая запись type допускается лишь с фактическим supported-set negotiation; `MVP_TYPES` не расширять спонтанно. Если композиция даёт требуемую функцию, оставлять **COMPOSED**.

Принятая naming scheme: `truyn.ext.<feature>/1`, `truyn.profile.<domain>/1`, без повторного использования CORE CODE; never infer support from `ADVERTISE` alone without authenticated session/operation negotiation. Optional profiles не требуют новых числовых CORE классов, и не добавляют опасных компактных `t` автоматически.

## 4. Кандидаты — EXTENSION и PROFILE (пока не physical wire admission)

Описание ниже сохраняет идеи из исходного каталога; **при любых расхождениях безопасности/совместимости binding rules §2 имеют приоритет**. Будущие payload shapes — предложения, не обязательные поля текущих wire endpoints.


| Message | Статус | Профиль | Критерий | Суть |
|---|---|---|---|
|  DISCONNECT | EXTENSION | — | 1, 2 | Мягкое завершение сессии: «новых не шлите, начатые доведу» |
|  PAUSE | EXTENSION | — | 2 | Приостановка принятой задачи |
|  RESUME | EXTENSION | — | 2 | Продолжение приостановленной задачи |
|  DELEGATE | EXTENSION | — | 3 | Передача подзадачи с сохранением ответственности |
|  HANDOFF | EXTENSION | — | 2, 3 | Полная передача задачи, управления и контекста |
|  RETRIEVE | EXTENSION | — | 3 | Получение объекта по CID с проверкой целостности |
|  DELETE | EXTENSION | — | 2 | Просьба держателю удалить свою копию данных |
|  EVENT | EXTENSION | — | 1 | Доставка события подписчикам |
|  LEASE | EXTENSION | — | 2 | Временное право на ресурс |
|  BID | EXTENSION | — | 2 | Ценовая заявка на конкретный запрос |
|  TIME_SYNC | PROFILE | Real-Time | 1 | Оценка смещения и неопределённости часов |
|  SENSOR_DATA | PROFILE | IoT · Industry · Real-Time | 4 | Компактный поток выборок датчиков |
|  SAFE_STOP | PROFILE | Robotics · Industry | 1 | Контролируемая остановка, которую нельзя сбросить |
|  ALARM | PROFILE | Industry | 2 | Тревога со своим жизненным циклом |

### 4.1. Детализация

#### DISCONNECT · EXTENSION

- **Что это:** мягкое завершение сессии: «новых запросов не присылайте, начатые я доведу».
- **Почему отдельный тип:** QUIC CONNECTION_CLOSE рвёт соединение сразу, вместе с запросами в полёте. Риск разрыва in-flight задач уже проявлялся в D-сериях; для них сохраняется существующий retire behavior,: перезапуск узла обрывал NEED в полёте. Аналог — GOAWAY в HTTP/3.
- **Payload (предложение):** `{reason, drainMs, retryAfterMs}`.
- **Связи:** перед перезапуском узел шлёт DISCONNECT, затем объявляет новое поколение через ANNOUNCE (B30). Пир переводит соединение в `retire`, а не `forget`.
- **Открыто:** что делать с запросами, не завершёнными за `drainMs`.

#### PAUSE и 26 · RESUME · EXTENSION

- **Что это:** приостановка и продолжение уже принятой задачи по `requestId`.
- **Почему отдельный тип:** в жизненном цикле CORE (NEED → … → RESULT) нет состояния «приостановлена».
- **Правила (предложение):**
  - право — как у REVOKE: только заказчик задачи;
  - исполнитель может отказать (`unimplemented` или REJECT);
  - во время паузы HEARTBEAT продолжается с `state:"paused"`.
- **Открыто:** идёт ли дедлайн во время паузы; максимальная длительность паузы.

#### DELEGATE · EXTENSION

- **Что это:** исполнитель передаёт подзадачу другому агенту и остаётся ответственным перед заказчиком.
- **Почему отдельный тип:** протокол должен сам проверять цепочку полномочий: у субподрядчика не может быть больше прав, чем у делегирующего.
- **Payload (предложение):** `{requestId, delegateTo, scope, grant}`; `grant` — сертификат GRANT , ограничивающий права.
- **Связи:** результат возвращается через делегирующего; provenance фиксирует цепочку. На DELEGATE строится FLEET_ASSIGN .
- **Открыто:** допустимая глубина цепочки; видит ли заказчик субподрядчика.

#### HANDOFF · EXTENSION

- **Что это:** полная передача задачи, управления и контекста другому участнику; ответственность переходит.
- **Почему отдельный тип:** меняется ответственный за задачу — ни NEED, ни DELEGATE этого не выражают.
- **Payload (предложение):** `{requestId, to, contextRef, reason}`. Принимающий подтверждает через ACCEPT (C73); до атомарного и авторизованного подтверждения ответственность остаётся у отдающего.
- **Связи:** включает ROBOT_HANDOFF; используется в MIGRATE и FAILOVER.
- **Открыто:** что видит заказчик; атомарность передачи.

#### RETRIEVE · EXTENSION

- **Что это:** получение OBJECT или контекста по CID у любого держателя.
- **Почему отдельный тип:** object.md требует явного резолвера и проверки digest и размера. Сейчас получение есть только через HTTP GET у relay.
- **Payload (предложение):** `{cid, size, range}` → байты или блоки. Получатель обязан проверить digest и размер.
- **Связи:** включает CONTEXT_GET; используется в SCHEMA, REPLICATE, MEMORY.
- **Открыто:** чанки и докачка; кто вправе отдавать приватные объекты.

#### DELETE · EXTENSION

- **Что это:** просьба к конкретному держателю удалить свою копию данных.
- **Почему отдельный тип:** REVOKE меняет действительность, не стирая историю; удаление — другая семантика (приватность).
- **Ограничение:** удалить все копии контент-адресуемых данных в сети невозможно — только у адресата.
- **Открыто:** конфликт с аудитом. migration.md требует для доказательств «redact-not-delete» — нужно решить, что удаляется, а что только редактируется.

#### EVENT · EXTENSION

- **Что это:** доставка события подписчикам.
- **Почему отдельный тип:** в CORE есть SUBSCRIBE (G40), но нет сообщения доставки. У доставки свои правила: порядковый номер, дедупликация, повторная доставка.
- **Payload (предложение):** `{topic, source, seq, time, data}` или ссылка `ref` на STATE, OBJECT, CLAIM или RESULT.
- **Связи:** включает PUBLISH; на нём строятся MULTICAST, BROADCAST, SECURITY_ALERT, FAULT_REPORT, LOG и UPGRADE_NOTICE.
- **Открыто:**
  - гарантия доставки (at-least-once);
  - кандидат на перевод в CORE, потому что без него SUBSCRIBE неполон.

#### LEASE · EXTENSION

- **Что это:** временное право на ресурс с явным сроком: вычислитель, зона пространства, док-станция.
- **Почему отдельный тип:** свой жизненный цикл: выдача, продление, истечение.
- **Payload (предложение):** `{leaseId, resource, holder, notBefore, expiresAt, terms}`.
  - продление — новый LEASE с тем же `leaseId`;
  - освобождение — REVOKE с `targetKind:"lease"` только после negotiated schema; иначе локальная lease API;
  - конфликт — REJECT или `unavailable`.
- **Связи:** включает LOCK и UNLOCK; на нём строятся ZONE_RESERVE, RESOURCE_ALLOCATE и DOCK.
- **Открыто:** поведение при расхождении часов (см. TIME_SYNC); принудительное изъятие.

#### BID · EXTENSION

- **Что это:** ценовая заявка исполнителя на конкретный NEED или ORDER со сроком действия.
- **Почему отдельный тип:** это ценовое обязательство под конкретный запрос, а не общий OFFER.
- **Payload (предложение):** `{targetId, price, unit, validUntil, terms}`. Заказчик принимает заявку через ACCEPT (C73), дальше — ORDER (C72).
- **Ограничение:** не доказывает платёж и не даёт прав (economics.md).
- **Открыто:** обязывает ли заявка до `validUntil`; отзыв заявки.

#### TIME_SYNC · PROFILE (Real-Time)

- **Что это:** обмен метками времени, чтобы оценить смещение и неопределённость часов между узлами.
- **Почему отдельный тип:** такое сообщение нельзя пропускать через очередь NEED — задержка очереди искажает измерение.
- **Payload (предложение):** запрос `{t1}`, ответ `{t1, t2, t3}`; клиент сам считает смещение и RTT.
- **Ограничение:** не заменяет PTP или NTP. Нужен, чтобы оценивать достоверность меток времени (`createdAt`, сроки LEASE, данные датчиков).
- **Открыто:** аппаратные метки времени; обязателен ли тип для профиля Robotics.

#### SENSOR_DATA · PROFILE (IoT · Industry · Real-Time)

- **Что это:** данные датчиков — выборки физических величин.
- **Почему отдельный тип:** массовый поток. Полный конверт с подписью на каждое значение слишком дорог.
- **Формат (предложение):**
  - компактный кадр по образцу COMPACT `{t, i, s}`;
  - пакет выборок `{source, schema, samples:[{ts, value, unit, quality}]}`;
  - подпись — одна на пакет.
- **Связи:** включает MEASUREMENT; несёт схемы POSE, VELOCITY, POWER_STATUS.
- **Отличие от TELEMETRY (F00):** TELEMETRY описывает работу самого узла, SENSOR_DATA — физический мир.
- **Открыто:** буква compact-кадра; можно ли прореживать выборки при перегрузке.

#### SAFE_STOP · PROFILE (Robotics · Industry)

- **Что это:** запрос контролируемой остановки устройства, зоны или флота.
- **Почему отдельный тип:** обычный NEED может быть сброшен при перегрузке (`TRUYN_BUSY`) или ждать в очереди — для остановки это недопустимо.
- **Правила (предложение):**
  - best-effort priority hint; safety remains local and independent;
  - идемпотентно;
  - полномочия обязаны проверяться на приёме без bypass;
  - после остановки движение возобновляется только явной командой.
- **Payload (предложение):** `{scope, category, reason, issuedAt}`, где `category` — категория остановки по IEC 60204-1 (0, 1 или 2).
- **Ограничение:** сетевое сообщение не заменяет аппаратную аварийную остановку и защитные блокировки.
- **Открыто:** кто вправе отправлять; как подтверждается исполнение.

#### ALARM · PROFILE (Industry)

- **Что это:** промышленная тревога.
- **Почему отдельный тип:** свой жизненный цикл: активна → квитирована → снята; может быть отложена или подавлена (ISA-18.2). NEED, RESULT и EVENT этого не выражают.
- **Payload (предложение):** `{alarmId, source, severity, state, message, time}`. Действия оператора (квитировать, отложить) — то же сообщение с новым `state`.
- **Связи:** FAULT_REPORT может поднять ALARM; подписчикам тревога доставляется через EVENT.
- **Открыто:** соответствие OPC UA Alarms & Conditions; кто вправе квитировать.


## 5. Каталог композиций по доменам


### A. Identity, Discovery & Connectivity

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  RESOLVE | Преобразование идентификатора в актуальные endpoints | COMPOSED | сценарий | Сеть | FIND_NODE / FIND_VALUE (B20/B50) за подписанной peer-record `truyn-peer-record-v1` — роутер уже делает это перед отправкой |
|  DISCONNECT | Завершение сессии | EXTENSION | новый тип | Сеть | Мягкое завершение: «новых не шлите, начатые доведу», с причиной и сроком (как GOAWAY в HTTP/3) |
|  ROUTE | Передача маршрутных сведений | COMPOSED | сценарий | Сеть | Ответы FIND_NODE (B20). Отдельные анонсы маршрутов в Kademlia не нужны и открывают отравление маршрутов |

### B. Intelligence, Tasks & Agent Collaboration

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  PROGRESS | Степень готовности задания | COMPOSED | атрибут | Задачи | Поля `progress` и `eta` в HEARTBEAT (F40) |
|  PAUSE | Приостановка выполнения | EXTENSION | новый тип | Задачи | Приостановить принятую задачу по `requestId`; в CORE нет состояния «приостановлена» |
|  RESUME | Возобновление выполнения | EXTENSION | новый тип | Задачи | Продолжить приостановленную задачу; пара к PAUSE |
|  DELEGATE | Делегирование задачи другому агенту | EXTENSION | новый тип | Задачи | Подзадача другому агенту с сохранением ответственности; проверяемая цепочка полномочий (GRANT) и provenance |
|  HANDOFF | Передача управления или контекста | EXTENSION | новый тип | Задачи | Полная передача задачи, контекста и ответственности; принимающий подтверждает через ACCEPT (C73); включает ROBOT_HANDOFF |
|  PLAN | План действий, построенный агентом | COMPOSED | объект | Задачи | RESULT планирующего NEED; сам план — OBJECT с digest |
|  EXECUTE | Запрос выполнения утверждённого плана | COMPOSED | операция | Задачи | NEED со ссылкой на digest плана и подтверждением утверждения (ATTEST или PROOF) |
|  CONSENSUS | Согласование результата несколькими участниками | COMPOSED | сценарий | Задачи | NEED нескольким участникам → подписанные голоса (VOTE) → итог по правилу кворума |
|  VOTE | Голос участника в согласовании | COMPOSED | объект | Задачи | ATTEST (H20) или CLAIM с полем голоса |
|  EVALUATE | Проверка качества результата | COMPOSED | сценарий | Задачи | Как VERIFY (H50): NEED к оценщику → ATTEST о качестве RESULT |
|  FEEDBACK | Обратная связь об исполнении | COMPOSED | объект | Задачи | Подписанный CLAIM об исполнении — вход для репутации; включает REPUTATION_EVENT |
|  CONSTRAINT | Ограничения задания и исполнения | COMPOSED | атрибут | Задачи | `NEED.policy`: жёсткие ограничения уже описаны в need.md |
|  SCHEDULE | Назначение отложенного или периодического исполнения | COMPOSED | атрибут | Задачи | `NEED.policy.notBefore` и `recurrence`; периодические итоги — через SUBSCRIBE и EVENT |

### C. Data, Knowledge, Memory & Context

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  QUERY | Запрос к информации или знаниям | COMPOSED | операция | Данные | NEED с capability запроса знаний; ответ — RESULT |
|  SEARCH | Поиск по распределённым источникам | COMPOSED | операция | Данные | NEED поиска, при необходимости нескольким провайдерам; кандидатов даёт DISCOVER (B80) |
|  INDEX | Регистрация данных для поиска | COMPOSED | сценарий | Данные | Индекс-запись в DHT (STORE, B40) или OFFER / ADVERTISE |
|  RETRIEVE | Получение объекта по CID/ссылке | EXTENSION | новый тип | Данные | Получить OBJECT или контекст по CID у любого держателя с проверкой digest и размера; включает CONTEXT_GET |
|  DELETE | Запрос удаления данных | EXTENSION | новый тип | Данные | Просьба держателю удалить свою копию; не REVOKE — тот меняет действительность, не стирая историю |
|  MERGE | Слияние изменений | COMPOSED | данные | Данные | DELTA (G30) с несколькими базовыми состояниями |
|  MEMORY | Публикация/получение памяти агента | COMPOSED | данные | Данные | Контекст вида `memory`: CONTEXT_PUT / CONTEXT_DELTA (D50/D60) + RETRIEVE |
|  KNOWLEDGE | Публикация структурированного знания | COMPOSED | объект | Данные | CLAIM (субъект, предикат, значение), STATE или OBJECT |
|  PROVENANCE | Происхождение данных и результатов | COMPOSED | атрибут | Данные | Поле и ссылки в CLAIM, RESULT, OBJECT (`core/provenance`); по core.md это не отдельный тип конверта |

### D. Trust, Security, Authorization & Verification

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  GRANT | Выдача ограниченного разрешения | COMPOSED | объект | Безопасность | Подписанный сертификат делегирования в payload (есть в `core/trust/source-owner-pki.js`); включает DELEGATION_GRANT |
|  AUTHORIZE | Запрос авторизации действия | COMPOSED | операция | Безопасность | Решение политики провайдера до исполнения (provider-policy.md); явный запрос к органу авторизации — NEED |
|  POLICY | Объявление или изменение правил | COMPOSED | объект | Безопасность | Подписанный OBJECT политики (по digest или ID) + EVENT об изменении |
|  CREDENTIAL | Передача ссылки на проверяемое удостоверение, без секретов | COMPOSED | объект | Безопасность | PROOF (H70) или OBJECT-ссылка на удостоверение |
|  KEY_ROTATE | Обновление криптографических ключей | COMPOSED | атрибут | Безопасность | IDENTITY (C10) с разделом ротации: старый ключ подписывает новый; identity.md требует явной подписанной ротации |
|  KEY_REVOKE | Отзыв ключа | COMPOSED | атрибут | Безопасность | REVOKE (C50) с `targetKind:"key"`; `TRUYN_IDENTITY_REVOKED` в коде уже есть |
|  AUDIT | Формирование проверяемой записи аудита | COMPOSED | объект | Безопасность | Запись в transparency log (`core/trust/transparency-log.js`) + PROOF включения |
|  IDENTITY_BIND | Привязка устройства, агента или сервиса к идентичности | COMPOSED | объект | Безопасность | Подписанный сертификат владельца (source-owner certificate) в IDENTITY или ADVERTISE |
|  DELEGATION_REVOKE | Отзыв делегированного полномочия | COMPOSED | атрибут | Безопасность | REVOKE (C50) с `targetKind:"grant"` |
|  SECURITY_ALERT | Сообщение о нарушении безопасности | COMPOSED | данные | Безопасность | EVENT категории `security` с запрашиваемым `critical` при negotiated `ext` и локальной политике |

### E. Events, Streaming & Real-Time Communication

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  EVENT | Сообщение о произошедшем событии | EXTENSION | новый тип | События | Доставка события подписчикам: тема, источник, номер, время, данные или ссылка на STATE/OBJECT; включает PUBLISH |
|  UNSUBSCRIBE | Отмена подписки | COMPOSED | атрибут | События | REVOKE (C50) с `targetKind:"subscription"` |
|  STREAM_OPEN | Начало потоковой передачи | COMPOSED | сценарий | Real-Time | NEED на потоковую capability (partial.md) |
|  STREAM_DATA | Передача части потока | COMPOSED | сценарий | Real-Time | PARTIAL (D30); медиапотоки — потоки QUIC; данные датчиков — SENSOR_DATA |
|  STREAM_CLOSE | Завершение потока | COMPOSED | сценарий | Real-Time | Терминальный RESULT (C40); отмена — REVOKE |
|  RETRY | Запрос повторной передачи | COMPOSED | транспорт | Real-Time | Повторную передачу делает QUIC; прикладной повтор решает клиент по `retryable` в OUTCOME |
|  FLOW_CONTROL | Управление скоростью передачи | COMPOSED | транспорт | Real-Time | Управление потоком QUIC |
|  PRIORITY | Установка приоритета доставки | COMPOSED | атрибут | События | `NEED.policy.priority` и полосы RPC (critical, control, background) |
|  DEADLINE | Ограничение времени действия сообщения | COMPOSED | атрибут | События | `NEED.policy.deadline`; срок жизни конверта — `createdAt` плюс окно приёма |
|  TIME_SYNC | Согласование времени и неопределённости часов | PROFILE | новый тип | Real-Time | Обмен метками времени для оценки смещения и неопределённости часов; не заменяет PTP/NTP |
|  BATCH | Группировка нескольких сообщений | COMPOSED | транспорт | Real-Time | Транспортный контейнер: несколько подписанных конвертов в одном кадре, каждый проверяется отдельно |
|  MULTICAST | Адресация группе получателей | COMPOSED | сценарий | События | EVENT в тему, на которую подписана группа |
|  BROADCAST | Широковещательная передача в разрешённой области | COMPOSED | сценарий | События | EVENT в тему с ограниченной областью; защита от усиления трафика |

### F. Devices, Hardware & IoT

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  DEVICE_REGISTER | Регистрация оборудования в сети | COMPOSED | сценарий | IoT | IDENTITY (регистрация) + IDENTITY_BIND (владелец) + ADVERTISE (дескриптор) |
|  DEVICE_DESCRIPTOR | Аппаратные возможности и интерфейсы | COMPOSED | атрибут | IoT | Аппаратный раздел дескриптора в ADVERTISE (B70) |
|  DEVICE_HEALTH | Диагностика оборудования | COMPOSED | статус | IoT | HEALTH (F20) с результатами самодиагностики |
|  SENSOR_DATA | Данные датчиков | PROFILE | новый тип | IoT · Industry · Real-Time | Компактный подписанный кадр выборок (время, величина, единица, качество, источник), пакетами; включает MEASUREMENT |
|  DEVICE_COMMAND | Запрос ограниченной команды устройству | COMPOSED | операция | IoT | NEED с capability `device.*` и авторизацией; итог — RESULT; включает ACTUATE |
|  DEVICE_CONFIG | Управление конфигурацией | COMPOSED | статус | IoT | STATE «желаемое / фактическое» + DELTA; изменение — NEED `device.config`; включает SENSOR_CONFIG |
|  FIRMWARE_INFO | Информация о прошивке | COMPOSED | атрибут | IoT | Поле в дескрипторе (ADVERTISE) или в STATE устройства |
|  FIRMWARE_UPDATE | Авторизованное обновление прошивки | COMPOSED | операция | IoT | NEED `device.firmware.update` + OBJECT образа (digest) + PROOF подписи + GRANT; ход — STATUS и HEARTBEAT |
|  BOOT_ATTEST | Подтверждение целостности загрузки | COMPOSED | сценарий | IoT | CLAIM об измерениях загрузки + PROOF аппаратного ключа → ATTEST верификатора |
|  POWER_STATUS | Питание и заряд аккумулятора | COMPOSED | статус | IoT | STATE или SENSOR_DATA со схемой питания |
|  DEVICE_REBOOT | Авторизованный перезапуск устройства | COMPOSED | операция | IoT | NEED `device.reboot` с авторизацией |
|  DEVICE_SLEEP | Переключение в энергосберегающий режим | COMPOSED | операция | IoT | NEED `device.power.sleep`; пока узел спит, сообщения копит шлюз или relay |
|  DEVICE_WAKE | Пробуждение устройства | COMPOSED | операция | IoT | NEED к шлюзу или relay, который будит устройство |
|  DEVICE_RECOVER | Запрос безопасной процедуры восстановления | COMPOSED | операция | IoT | NEED `device.recover` с авторизацией |

### G. Robotics & Autonomous Machines

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  ROBOT_CAPABILITY | Движение, захват, сканирование и другие способности | COMPOSED | атрибут | Robotics | CAPABILITY (C60) с именами `robot.*` в ADVERTISE |
|  MISSION | Постановка общей задачи роботу | COMPOSED | операция | Robotics | NEED `robot.mission` (цель, ограничения, зоны) + жизненный цикл CORE: ACCEPT/REJECT, STATUS, HEARTBEAT, RESULT, REVOKE; плюс PAUSE/RESUME |
|  NAVIGATE | Запрос перемещения в указанную точку | COMPOSED | операция | Robotics | NEED `robot.navigate` |
|  POSE | Положение и ориентация в пространстве | COMPOSED | данные | Robotics | Схема payload (позиция, ориентация, система координат, время) в SENSOR_DATA или STATE; включает POSITION |
|  VELOCITY | Скорость и направление движения | COMPOSED | данные | Robotics | Схема payload в SENSOR_DATA или STATE |
|  TRAJECTORY | Траектория перемещения | COMPOSED | данные | Robotics | Схема payload; длинная траектория — OBJECT |
|  MAP | Пространственная карта | COMPOSED | объект | Robotics | OBJECT (контент-адресуемая карта) + DELTA для обновлений |
|  LOCALIZE | Локализация относительно карты | COMPOSED | операция | Robotics | NEED `robot.localize` → RESULT с POSE |
|  PERCEPTION | Результат распознавания окружающей среды | COMPOSED | данные | Robotics | Схема payload в EVENT или STATE; большие данные — OBJECT |
|  DETECTION | Обнаруженный объект, препятствие или человек | COMPOSED | данные | Robotics | EVENT со схемой обнаружения (класс, положение, уверенность); включает OBSTACLE |
|  TRACK | Отслеживание объекта | COMPOSED | данные | Robotics | STATE или EVENT со схемой трека; поток — через SUBSCRIBE |
|  MANIPULATE | Задача физического взаимодействия с объектом | COMPOSED | операция | Robotics | NEED `robot.manipulate.*`; включает GRASP и RELEASE |
|  CONTROL_MODE | Переключение разрешённого режима управления | COMPOSED | операция | Robotics | NEED `robot.control_mode` + STATE текущего режима |
|  SAFE_STOP | Запрос контролируемой остановки | PROFILE | новый тип | Robotics · Industry | Приоритетная доставка без гарантий и без bypass авторизации, идемпотентно, право выдано заранее; не заменяет аппаратный аварийный стоп |
|  SAFETY_STATE | Отчёт о состоянии локальной системы безопасности | COMPOSED | статус | Robotics · Industry | STATE или EVENT со схемой безопасности, приоритет `critical`; включает INTERLOCK_STATE |
|  COLLISION_RISK | Предупреждение о риске столкновения | COMPOSED | данные | Robotics | EVENT категории `safety` с запрашиваемым `critical` при negotiated `ext` и локальной политике |
|  ZONE_RESERVE | Запрос резервирования участка пространства | COMPOSED | сценарий | Robotics | LEASE на ресурс-зону (геометрия, интервал времени) |
|  ZONE_RELEASE | Освобождение участка пространства | COMPOSED | атрибут | Robotics | Освобождение LEASE: REVOKE с `targetKind:"lease"` только после negotiated schema; иначе локальная lease API |
|  FLEET_ASSIGN | Распределение задачи между роботами | COMPOSED | сценарий | Robotics | DELEGATE или NEED от менеджера флота |
|  FLEET_COORDINATE | Координация группы роботов | COMPOSED | сценарий | Robotics | EVENT и STATE + LEASE зон + CONSENSUS |
|  DOCK | Запрос стыковки или зарядки | COMPOSED | операция | Robotics | NEED `robot.dock` + LEASE станции |
|  HUMAN_OVERRIDE | Сведения о передаче приоритета локальному оператору | COMPOSED | статус | Robotics | STATE или EVENT «управление у локального оператора», приоритет `critical`; пока действует — удалённые команды отвергаются |

### H. Industrial Systems & Digital Twins

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  ASSET_REGISTER | Регистрация промышленного актива | COMPOSED | объект | Industry | Запись актива как STATE или OBJECT; для сетевого актива — IDENTITY_BIND |
|  ASSET_STATE | Состояние физического оборудования | COMPOSED | статус | Industry · IoT | STATE (G20), где субъект — актив; включает DEVICE_STATUS |
|  DIGITAL_TWIN | Представление цифрового двойника | COMPOSED | объект | Industry | OBJECT модели + STATE |
|  TWIN_SYNC | Синхронизация физического объекта и его модели | COMPOSED | сценарий | Industry | SYNC (B60) или DELTA + SUBSCRIBE |
|  PROCESS_STATE | Состояние производственного процесса | COMPOSED | статус | Industry | STATE со схемой процесса |
|  PROCESS_COMMAND | Авторизованное управление процессом | COMPOSED | операция | Industry | NEED `process.*` с авторизацией и проверкой блокировок |
|  SETPOINT | Запрос изменения целевого параметра | COMPOSED | операция | Industry | NEED `process.setpoint` с границами, скоростью изменения и подтверждением |
|  CALIBRATE | Запрос калибровки | COMPOSED | операция | Industry | NEED `device.calibrate` |
|  FAULT_REPORT | Отчёт о неисправности | COMPOSED | данные | Industry · IoT | EVENT категории `fault` + STATE; при необходимости поднимает ALARM; включает DEVICE_FAULT |
|  ALARM | Промышленное предупреждение | PROFILE | новый тип | Industry | Тревога со своим жизненным циклом: активна → квитирована → снята; может быть отложена или подавлена (ISA-18.2) |
|  QUALITY_REPORT | Результаты контроля качества | COMPOSED | объект | Industry | RESULT или OBJECT отчёта + CLAIM/ATTEST |
|  SIMULATE | Запуск моделирования | COMPOSED | операция | Industry | NEED или COMPUTE (I00) на capability моделирования |
|  PREDICT_FAILURE | Прогнозирование отказа | COMPOSED | операция | Industry | NEED прогноза → RESULT или CLAIM с вероятностью и горизонтом |
|  WORK_ORDER | Производственное или сервисное задание | COMPOSED | сценарий | Industry | NEED или DELEGATE + STATUS; не путать с коммерческим ORDER (C72); включает MAINTENANCE |

### I. Distributed Computing & Network Operations

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  RESOURCE_ALLOCATE | Выделение ресурса | COMPOSED | сценарий | Вычисления | LEASE на вычислительный ресурс |
|  RESOURCE_RELEASE | Освобождение ресурса | COMPOSED | атрибут | Вычисления | Освобождение LEASE: REVOKE с `targetKind:"lease"` только после negotiated schema; иначе локальная lease API |
|  DEPLOY | Развёртывание программного компонента | COMPOSED | операция | Вычисления | NEED `runtime.deploy` + OBJECT артефакта (digest) + явное разрешение провайдера (compute.md) |
|  UNDEPLOY | Удаление развёрнутого компонента | COMPOSED | операция | Вычисления | NEED `runtime.undeploy` или REVOKE развёртывания |
|  MIGRATE | Перемещение задачи или процесса | COMPOSED | сценарий | Вычисления | CHECKPOINT → HANDOFF → RESTORE |
|  CHECKPOINT | Сохранение состояния выполнения | COMPOSED | операция | Вычисления | NEED `task.checkpoint` → RESULT с OBJECT состояния |
|  RESTORE | Восстановление состояния | COMPOSED | операция | Вычисления | NEED со ссылкой на OBJECT контрольной точки |
|  FAILOVER | Переключение на резервный узел | COMPOSED | сценарий | Вычисления | Повторный выбор провайдера маршрутизатором + HANDOFF |
|  REPLICATE | Репликация данных или объекта | COMPOSED | сценарий | Вычисления | RETRIEVE у держателя и запись у нового; в DHT — STORE (RF3) |
|  LEASE | Временное право использования ресурса | EXTENSION | новый тип | Вычисления (общий) | Право на ресурс с явным сроком: выдача, продление, истечение; освобождение — REVOKE; включает LOCK и UNLOCK |
|  CAPACITY | Информация о текущей ёмкости | COMPOSED | атрибут | Вычисления | `OFFER.metadata` (доступность) или ADVERTISE |
|  LOG | Структурированная диагностическая запись | COMPOSED | данные | Вычисления | EVENT вида `log` или TRACE (F30) |

### J. Economics, Transactions & Settlement

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  PRICE_QUOTE | Запрос или предложение цены | COMPOSED | атрибут | Экономика | Цена — в `OFFER.metadata`, предел — в `NEED.policy` (economics.md); цена под конкретный запрос — BID |
|  BID | Ценовая заявка исполнителя | EXTENSION | новый тип | Экономика | Заявка на конкретный NEED или ORDER со сроком действия; принимается через ACCEPT (C73) |
|  USAGE | Учёт фактического использования | COMPOSED | атрибут | Экономика | `RESULT.metadata.usage` (result.md); включает METER |
|  INVOICE | Счёт на оплату | COMPOSED | объект | Экономика | Внешний объект расчётного адаптера; в TRUYN — ссылка или digest |
|  PAYMENT_INTENT | Намерение оплатить | COMPOSED | объект | Экономика | Объект адаптера (x402 или AP2); в TRUYN — непрозрачная ссылка |
|  PAYMENT_AUTH | Проверяемое разрешение платежа | COMPOSED | объект | Экономика | Мандат AP2 как PROOF; авторизации провайдера не даёт |
|  SETTLEMENT_PROOF | Доказательство выполнения расчёта | COMPOSED | объект | Экономика | PROOF (H70) вида `settlement` |
|  REFUND | Запрос возврата | COMPOSED | операция | Экономика | Операция адаптера + STATUS (C75) заказа |
|  ESCROW | Условия условного удержания средств | COMPOSED | атрибут | Экономика | Условия в CONTRACT (C71); исполняет адаптер |
|  SERVICE_LEVEL | Условия качества услуги | COMPOSED | атрибут | Экономика | Условия SLA в CONTRACT или `OFFER.metadata` |

### K. Governance, Compatibility & Protocol Evolution

| Message | Назначение | Статус | Форма | Профиль/домен | Как реализуется |
|---|---|---|---|---|---|
|  SCHEMA | Получение или объявление схемы | COMPOSED | объект | Эволюция | Схема — OBJECT по digest; ссылка из CAPABILITY; получение — RETRIEVE |
|  DEPRECATE | Объявление устаревшей возможности | COMPOSED | атрибут | Эволюция | Флаг в ADVERTISE и VERSION + EVENT |
|  UPGRADE_NOTICE | Уведомление о переходе на новую версию | COMPOSED | данные | Эволюция | EVENT + обновлённый ADVERTISE; перед перезапуском — DISCONNECT |
|  COMPATIBILITY_REPORT | Результат проверки совместимости | COMPOSED | объект | Эволюция | RESULT или OBJECT отчёта + ATTEST |
|  CONFORMANCE_PROOF | Доказательство соответствия протоколу | COMPOSED | объект | Эволюция | ATTEST или PROOF о прохождении conformance (подписанный OBJECT отчёта) |


## 6. Scope of COMPOSED и договор с CORE

Каждая композиция использует только **уже поддерживаемые** формы соответствующего peer/profile, а не «все типы из словаря» автоматически. Если применение требует CORE records, которые пока существуют только как spec (например, `STATE`, `DELTA`, `SUBSCRIBE`, `COMPUTE`), такая композиция является **target behavior / not deployed** до ее собственного теста. Device/robot/process actuations — авторизованные NEED операции и строго независимый локальный safety контур. Payment authorization не равна provider authorization. Revocation of keys/grants/leases/contract — новая schema of `targetKind` only after negotiation.

## 7. Оба репозитория: что изменить **после** approval

**Публичный:** versioned registry files and indexes, `spec/protocol/v1/{core,envelope,errors,migration,...}`, `docs/compatibility/*`, existing data/trust/compute semantics (без глобальных имён/подписей), versioned extension/profile schemas, `sdk/conformance/v1/*` five-language vectors and negative tests, bounded `core/protocol/negotiation.js` integration, relay/node/QUIC opt-in parsing, REST/MCP/A2A/NLWeb interface assertions, SDK docs and versioned releases. Existing `MVP_TYPES` and compact letters remain unchanged unless a separate explicit profile accepted.

**Приватный:** consumer compatibility matrix, owned provider/tenant/billing/cost/authority checks, negotiated opt-in feature flags, immutable public release pins, private CI/staging/canary, attack tests for unauthorized dispatch, duplicate provider calls, leakage, out-of-policy IoT/robotic operations. No private implementation copied to public repo; only redacted aggregate evidence/public contract schemas.

**Глобальная санитария:** inventory all docs, tests, workflows, PRs, release packages and active tasks; classify exact-boundary shared consumers; preserve append-only passed results; redact rather than delete; do not bulk replace `type` strings, compact aliases, error tokens, semantic IDs, filenames, old signed bytes, frozen baseline, or trust receipts.

## 8. Admission and acceptance

- No CHANGE/DEPLOY at proposal stage. Approval only permits planning PRs; production change later needs exact qualification and explicit authority.
- All extensions default off. Legacy sender+legacy receiver; old sender+new receiver; new sender+old receiver; new+new negotiated receiver — all exercised with exact byte/signature baseline and negative cases.
- Five SDKs, Java/.NET encoders, Node, relay, QUIC, fast/socket, HTTP and private managed consumer must pass; live D/S/T/E/N/H/A activities fenced, no forced campaign rewrites or replays.
- Unsupported negotiated extension yields a deterministic pre-side-effect refusal; private controls fail closed; no material latency/regression/duplicate-side effects beyond frozen acceptance thresholds.
- Promote one extension/profile at a time with isolated canary, telemetry and rollback; old public stable/alpha package coordinates stay immutable. An opt-in extension does not change TRUYN/1 stable declaration by itself; stable requires independent protocol-wide P1–P13 closure.
