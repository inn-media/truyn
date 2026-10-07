use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{DateTime, SecondsFormat, Utc};
use ed25519_dalek::{
    pkcs8::{DecodePublicKey, EncodePublicKey},
    Signature, Signer, SigningKey, Verifier, VerifyingKey,
};
use fs2::FileExt;
use rand_core::OsRng;
use reqwest::{redirect::Policy, Client, RequestBuilder};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{
    cmp::Ordering,
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    net::{IpAddr, SocketAddr},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};
use tokio::{
    net::lookup_host,
    sync::{Mutex, RwLock},
};
use url::Url;
use uuid::Uuid;

const PROTOCOL: &str = "TRUYN/1";
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_CAPABILITY_BYTES: usize = 200;
const MAX_PROMPT_BYTES: usize = 32 * 1024;
const SESSION_REFRESH_SKEW: Duration = Duration::from_secs(30);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredIdentity {
    version: u8,
    secret_key_base64: String,
}

struct LocalIdentity {
    signing_key: SigningKey,
    node_id: String,
    public_key_pem: String,
}

#[derive(Clone)]
struct RelaySession {
    relay_url: Url,
    token: String,
    http: Client,
    display_name: String,
    expires_at: Instant,
}

impl RelaySession {
    fn is_alive(&self) -> bool {
        self.expires_at > Instant::now()
    }

    fn is_fresh(&self) -> bool {
        self.expires_at.saturating_duration_since(Instant::now()) > SESSION_REFRESH_SKEW
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredActiveNeed {
    version: u8,
    need_id: String,
    provider: Option<String>,
    relay_url: String,
    display_name: String,
    allow_local_development: bool,
    submitted_at: String,
    ambiguous: bool,
}

#[derive(Clone)]
struct ActiveNeed {
    need_id: String,
    provider: Option<String>,
    relay_url: Url,
    display_name: String,
    allow_local_development: bool,
    submitted_at: String,
    ambiguous: bool,
    session: Option<RelaySession>,
}

struct AppState {
    identity: LocalIdentity,
    session: RwLock<Option<RelaySession>>,
    active_need: RwLock<Option<ActiveNeed>>,
    active_need_path: PathBuf,
    active_claim_path: PathBuf,
    active_claim: Mutex<Option<File>>,
    mutation_lock: Mutex<()>,
    refresh_lock: Mutex<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientInfo {
    version: &'static str,
    node_id: String,
    public_key: String,
    connected: bool,
    relay_url: Option<String>,
    display_name: Option<String>,
    active_need_id: Option<String>,
}

fn safe_message(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return "TRUYN request failed".into();
    }
    trimmed.chars().take(256).collect()
}

fn node_id_for_key(key: &VerifyingKey) -> Result<String, String> {
    let der = key
        .to_public_key_der()
        .map_err(|_| "cannot encode TRUYN public key".to_string())?;
    let digest = Sha256::digest(der.as_bytes());
    Ok(format!("truyn:node:{}", hex::encode(digest)))
}

fn public_key_pem(key: &VerifyingKey) -> Result<String, String> {
    let der = key
        .to_public_key_der()
        .map_err(|_| "cannot encode TRUYN public key".to_string())?;
    let encoded = BASE64.encode(der.as_bytes());
    let mut lines = String::new();
    for chunk in encoded.as_bytes().chunks(64) {
        lines.push_str(
            std::str::from_utf8(chunk)
                .map_err(|_| "cannot encode TRUYN public key".to_string())?,
        );
        lines.push('\n');
    }
    Ok(format!(
        "-----BEGIN PUBLIC KEY-----\n{}-----END PUBLIC KEY-----\n",
        lines
    ))
}

fn identity_from_signing_key(signing_key: SigningKey) -> Result<LocalIdentity, String> {
    let verifying_key = signing_key.verifying_key();
    Ok(LocalIdentity {
        node_id: node_id_for_key(&verifying_key)?,
        public_key_pem: public_key_pem(&verifying_key)?,
        signing_key,
    })
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "cannot resolve application data directory".to_string())?;
    fs::create_dir_all(&dir)
        .map_err(|_| "cannot create application data directory".to_string())?;
    Ok(dir)
}

fn identity_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("identity.json"))
}

fn active_need_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("active-need.json"))
}

fn active_claim_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("active-need.lock"))
}

fn open_active_claim(path: &Path) -> Result<File, String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(path)
        .map_err(|_| "cannot open active-request process claim".to_string())?;
    file.try_lock_exclusive()
        .map_err(|_| "another TRUYN process already owns active work".to_string())?;
    Ok(file)
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|_| "cannot restrict identity file permissions".to_string())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn load_identity(path: &Path) -> Result<LocalIdentity, String> {
    let raw = fs::read(path).map_err(|_| "cannot read local TRUYN identity".to_string())?;
    let stored: StoredIdentity =
        serde_json::from_slice(&raw).map_err(|_| "local TRUYN identity is invalid".to_string())?;
    if stored.version != 1 {
        return Err("unsupported local TRUYN identity version".into());
    }
    let secret = BASE64
        .decode(stored.secret_key_base64.as_bytes())
        .map_err(|_| "local TRUYN identity key is invalid".to_string())?;
    let secret: [u8; 32] = secret
        .try_into()
        .map_err(|_| "local TRUYN identity key length is invalid".to_string())?;
    restrict_permissions(path)?;
    identity_from_signing_key(SigningKey::from_bytes(&secret))
}

fn load_or_create_identity(app: &AppHandle) -> Result<LocalIdentity, String> {
    let path = identity_file(app)?;
    if path.exists() {
        return load_identity(&path);
    }

    let signing_key = SigningKey::generate(&mut OsRng);
    let stored = StoredIdentity {
        version: 1,
        secret_key_base64: BASE64.encode(signing_key.to_bytes()),
    };
    let bytes = serde_json::to_vec_pretty(&stored)
        .map_err(|_| "cannot serialize local TRUYN identity".to_string())?;

    let tmp = path.with_file_name(format!("identity.{}.tmp", Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .map_err(|_| "cannot exclusively create local TRUYN identity staging file".to_string())?;
    restrict_permissions(&tmp)?;
    file.write_all(&bytes)
        .map_err(|_| "cannot write local TRUYN identity".to_string())?;
    file.sync_all()
        .map_err(|_| "cannot sync local TRUYN identity".to_string())?;

    match fs::hard_link(&tmp, &path) {
        Ok(()) => {
            restrict_permissions(&path)?;
            let _ = fs::remove_file(&tmp);
            identity_from_signing_key(signing_key)
        }
        Err(_) if path.exists() => {
            let _ = fs::remove_file(&tmp);
            load_identity(&path)
        }
        Err(_) => {
            let _ = fs::remove_file(&tmp);
            Err("cannot atomically commit local TRUYN identity".into())
        }
    }
}

fn utf16_cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16()
        .collect::<Vec<_>>()
        .cmp(&b.encode_utf16().collect::<Vec<_>>())
}

fn canonical_number(number: &serde_json::Number) -> Result<String, String> {
    let value = number
        .as_f64()
        .filter(|value| value.is_finite())
        .ok_or_else(|| "TCJ1 numbers must be finite JSON numbers".to_string())?;
    if value == 0.0 {
        return Ok("0".into());
    }
    let mut buffer = ryu_js::Buffer::new();
    Ok(buffer.format(value).to_string())
}

fn write_tcj1(value: &Value, output: &mut String) -> Result<(), String> {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        Value::Number(number) => output.push_str(&canonical_number(number)?),
        Value::String(value) => output.push_str(
            &serde_json::to_string(value)
                .map_err(|_| "cannot TCJ1-encode string".to_string())?,
        ),
        Value::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_tcj1(value, output)?;
            }
            output.push(']');
        }
        Value::Object(object) => {
            let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
            keys.sort_by(|left, right| utf16_cmp(left, right));
            output.push('{');
            for (index, key) in keys.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                output.push_str(
                    &serde_json::to_string(key)
                        .map_err(|_| "cannot TCJ1-encode object key".to_string())?,
                );
                output.push(':');
                write_tcj1(
                    object
                        .get(*key)
                        .ok_or_else(|| "cannot TCJ1-encode object member".to_string())?,
                    output,
                )?;
            }
            output.push('}');
        }
    }
    Ok(())
}

fn tcj1_bytes(value: &Value) -> Result<Vec<u8>, String> {
    let mut output = String::new();
    write_tcj1(value, &mut output)?;
    Ok(output.into_bytes())
}

fn envelope(identity: &LocalIdentity, kind: &str, payload: Value) -> Result<Value, String> {
    match kind {
        "IDENTITY" | "NEED" | "REVOKE" => {}
        _ => return Err("unsupported native-client message type".into()),
    }
    if !payload.is_object() {
        return Err("TRUYN envelope payload must be an object".into());
    }
    let unsigned = json!({
        "protocol": PROTOCOL,
        "type": kind,
        "id": Uuid::new_v4().to_string(),
        "from": identity.node_id,
        "to": Value::Null,
        "createdAt": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "publicKey": identity.public_key_pem,
        "payload": payload
    });
    let signature = identity.signing_key.sign(&tcj1_bytes(&unsigned)?);
    let mut object = unsigned
        .as_object()
        .cloned()
        .ok_or_else(|| "cannot construct TRUYN envelope".to_string())?;
    object.insert(
        "signature".into(),
        Value::String(BASE64.encode(signature.to_bytes())),
    );
    Ok(Value::Object(object))
}

fn envelope_id(value: &Value) -> Result<String, String> {
    value
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| "TRUYN envelope is missing its request ID".to_string())
}

fn verify_envelope(value: &Value, expected_type: &str) -> Result<String, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "received TRUYN envelope is not an object".to_string())?;
    if object.get("protocol").and_then(Value::as_str) != Some(PROTOCOL) {
        return Err("received envelope uses an unsupported protocol".into());
    }
    if object.get("type").and_then(Value::as_str) != Some(expected_type) {
        return Err("received envelope has an unexpected type".into());
    }
    object
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "received envelope is missing its message ID".to_string())?;
    let created_at = object
        .get("createdAt")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "received envelope is missing createdAt".to_string())?;
    DateTime::parse_from_rfc3339(created_at)
        .map_err(|_| "received envelope createdAt is not a parseable RFC3339 timestamp".to_string())?;
    if !object.get("payload").map(Value::is_object).unwrap_or(false) {
        return Err("received envelope payload must be an object".into());
    }
    if let Some(to) = object.get("to") {
        if !to.is_null()
            && to
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .is_none()
        {
            return Err("received envelope has an invalid recipient".into());
        }
    }
    let from = object
        .get("from")
        .and_then(Value::as_str)
        .ok_or_else(|| "received envelope is missing sender identity".to_string())?;
    let public_key_pem = object
        .get("publicKey")
        .and_then(Value::as_str)
        .ok_or_else(|| "received envelope is missing public key".to_string())?;
    let signature_text = object
        .get("signature")
        .and_then(Value::as_str)
        .ok_or_else(|| "received envelope is missing signature".to_string())?;
    let verifying_key = VerifyingKey::from_public_key_pem(public_key_pem)
        .map_err(|_| "received envelope public key is invalid".to_string())?;
    if node_id_for_key(&verifying_key)? != from {
        return Err("received envelope identity does not match its public key".into());
    }
    let signature_bytes = BASE64
        .decode(signature_text.as_bytes())
        .map_err(|_| "received envelope signature encoding is invalid".to_string())?;
    let signature = Signature::try_from(signature_bytes.as_slice())
        .map_err(|_| "received envelope signature is invalid".to_string())?;
    let mut unsigned: Map<String, Value> = object.clone();
    unsigned.remove("signature");
    verifying_key
        .verify(&tcj1_bytes(&Value::Object(unsigned))?, &signature)
        .map_err(|_| "received envelope signature verification failed".to_string())?;
    Ok(from.to_string())
}

fn signed_offer_view(offer: &Value) -> Result<Value, String> {
    let mut signed = offer
        .as_object()
        .cloned()
        .ok_or_else(|| "relay returned an invalid OFFER".to_string())?;
    signed.remove("trust");
    Ok(Value::Object(signed))
}

fn forbidden_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_multicast()
                || ip.is_unspecified()
                || ip.octets()[0] == 0
                || {
                    let o = ip.octets();
                    o[0] == 100 && (64..=127).contains(&o[1])
                }
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return forbidden_public_ip(IpAddr::V4(mapped));
            }
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
        }
    }
}

fn local_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.parse::<IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}

async fn relay_client(
    raw_url: &str,
    allow_local_development: bool,
) -> Result<(Url, Client), String> {
    let mut url =
        Url::parse(raw_url.trim()).map_err(|_| "relay URL must be absolute".to_string())?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err(
            "relay URL cannot contain credentials, query parameters or fragments".into(),
        );
    }
    if !url.path().is_empty() && url.path() != "/" {
        return Err("relay URL must point to the relay origin, not a nested path".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "relay URL must contain a hostname".to_string())?
        .to_string();
    let is_local = local_host(&host);

    if is_local {
        if !allow_local_development {
            return Err("loopback relay access requires Local development mode".into());
        }
        if url.scheme() != "http" && url.scheme() != "https" {
            return Err("local relay URL must use http or https".into());
        }
    } else if url.scheme() != "https" {
        return Err("public relay URLs must use https".into());
    }

    url.set_path("");
    let mut builder = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("TRUYN-Native/", env!("CARGO_PKG_VERSION")));

    if !is_local {
        let port = url
            .port_or_known_default()
            .ok_or_else(|| "relay URL has no usable port".to_string())?;
        let addresses: Vec<SocketAddr> = lookup_host((host.as_str(), port))
            .await
            .map_err(|_| "relay hostname could not be resolved".to_string())?
            .collect();
        if addresses.is_empty() {
            return Err("relay hostname resolved to no addresses".into());
        }
        if addresses
            .iter()
            .any(|address| forbidden_public_ip(address.ip()))
        {
            return Err("public relay hostname resolves to a non-public address".into());
        }
        builder = builder.resolve_to_addrs(&host, &addresses);
    }

    let client = builder
        .build()
        .map_err(|_| "cannot initialize secure relay transport".to_string())?;
    Ok((url, client))
}

#[derive(Debug)]
struct RequestFailure {
    message: String,
    ambiguous: bool,
    status: Option<u16>,
}

impl RequestFailure {
    fn transport(message: &str) -> Self {
        Self { message: message.into(), ambiguous: true, status: None }
    }

    fn definite(message: String, status: u16) -> Self {
        Self { message, ambiguous: false, status: Some(status) }
    }

    fn is_unauthorized(&self) -> bool {
        self.status == Some(401)
    }

    fn is_transport(&self) -> bool {
        self.status.is_none()
    }
}

async fn request_json_detailed(request: RequestBuilder) -> Result<Value, RequestFailure> {
    let mut response = request
        .send()
        .await
        .map_err(|_| RequestFailure::transport("relay transport request failed"))?;
    let status = response.status();
    if let Some(length) = response.content_length() {
        if length as usize > MAX_RESPONSE_BYTES {
            return Err(RequestFailure {
                message: "relay response exceeds the native-client safety limit".into(),
                ambiguous: status.is_success(),
                status: Some(status.as_u16()),
            });
        }
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| RequestFailure::transport("cannot read relay response"))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(RequestFailure {
                message: "relay response exceeds the native-client safety limit".into(),
                ambiguous: status.is_success(),
                status: Some(status.as_u16()),
            });
        }
        bytes.extend_from_slice(&chunk);
    }

    let body: Value = serde_json::from_slice(&bytes).map_err(|_| RequestFailure {
        message: format!("relay returned invalid JSON (HTTP {})", status.as_u16()),
        ambiguous: status.is_success(),
        status: Some(status.as_u16()),
    })?;
    if !status.is_success() {
        let error = body
            .get("error")
            .and_then(Value::as_str)
            .map(safe_message)
            .unwrap_or_else(|| format!("relay returned HTTP {}", status.as_u16()));
        return Err(RequestFailure::definite(error, status.as_u16()));
    }
    Ok(body)
}

async fn request_json(request: RequestBuilder) -> Result<Value, String> {
    request_json_detailed(request)
        .await
        .map_err(|failure| failure.message)
}

fn auth(session: &RelaySession, builder: RequestBuilder) -> RequestBuilder {
    builder.bearer_auth(&session.token)
}

async fn register_session(
    identity: &LocalIdentity,
    relay_url: Url,
    http: Client,
    display_name: String,
) -> Result<RelaySession, String> {
    let registration = envelope(
        identity,
        "IDENTITY",
        json!({
            "nodeId": identity.node_id,
            "algorithm": "Ed25519",
            "protocols": [PROTOCOL],
            "name": if display_name.is_empty() {
                Value::Null
            } else {
                Value::String(display_name.clone())
            }
        }),
    )?;
    let body = request_json(
        http.post(
            relay_url
                .join("/v1/register")
                .map_err(|_| "cannot construct registration URL".to_string())?,
        )
        .json(&json!({ "envelope": registration })),
    )
    .await?;

    if body.get("nodeId").and_then(Value::as_str) != Some(identity.node_id.as_str()) {
        return Err("relay registration identity does not match this client".into());
    }
    let token = body
        .get("sessionToken")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "relay returned no authenticated session token".to_string())?
        .to_string();
    let expires_in_ms = body
        .get("expiresInMs")
        .and_then(Value::as_u64)
        .filter(|value| *value > 0)
        .ok_or_else(|| "relay returned an invalid session lifetime".to_string())?;
    let expires_at = Instant::now()
        .checked_add(Duration::from_millis(expires_in_ms))
        .ok_or_else(|| "relay session lifetime exceeds the supported monotonic-clock range".to_string())?;

    Ok(RelaySession {
        relay_url,
        token,
        http,
        display_name,
        expires_at,
    })
}

async fn session_snapshot(state: &AppState) -> Result<RelaySession, String> {
    state
        .session
        .read()
        .await
        .clone()
        .ok_or_else(|| "connect to a TRUYN relay first".to_string())
}

fn stored_active_need(active: &ActiveNeed) -> StoredActiveNeed {
    StoredActiveNeed {
        version: 1,
        need_id: active.need_id.clone(),
        provider: active.provider.clone(),
        relay_url: active.relay_url.to_string(),
        display_name: active.display_name.clone(),
        allow_local_development: active.allow_local_development,
        submitted_at: active.submitted_at.clone(),
        ambiguous: active.ambiguous,
    }
}

fn active_need_backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn parse_active_need_bytes(bytes: &[u8]) -> Result<ActiveNeed, String> {
    let stored: StoredActiveNeed = serde_json::from_slice(bytes)
        .map_err(|_| "active TRUYN request state is invalid".to_string())?;
    if stored.version != 1
        || stored.need_id.trim().is_empty()
        || stored.relay_url.trim().is_empty()
        || DateTime::parse_from_rfc3339(&stored.submitted_at).is_err()
    {
        return Err("active TRUYN request state is invalid".into());
    }
    let relay_url = Url::parse(&stored.relay_url)
        .map_err(|_| "active TRUYN request relay URL is invalid".to_string())?;
    Ok(ActiveNeed {
        need_id: stored.need_id,
        provider: stored.provider,
        relay_url,
        display_name: stored.display_name,
        allow_local_development: stored.allow_local_development,
        submitted_at: stored.submitted_at,
        ambiguous: stored.ambiguous,
        session: None,
    })
}

fn persist_active_need(path: &Path, active: &ActiveNeed) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&stored_active_need(active))
        .map_err(|_| "cannot serialize active TRUYN request".to_string())?;
    let tmp = path.with_file_name(format!("active-need.{}.tmp", Uuid::new_v4()));
    let backup = active_need_backup_path(path);

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .map_err(|_| "cannot create active-request staging file".to_string())?;
    restrict_permissions(&tmp)?;
    file.write_all(&bytes)
        .map_err(|_| "cannot write active TRUYN request".to_string())?;
    file.sync_all()
        .map_err(|_| "cannot sync active TRUYN request".to_string())?;

    if path.exists() {
        match fs::remove_file(&backup) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => {
                let _ = fs::remove_file(&tmp);
                return Err("cannot rotate active-request backup".into());
            }
        }
        if fs::rename(path, &backup).is_err() {
            let _ = fs::remove_file(&tmp);
            return Err("cannot rotate active-request state".into());
        }
    }

    if let Err(_) = fs::rename(&tmp, path) {
        if !path.exists() && backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&tmp);
        return Err("cannot atomically commit active-request state".into());
    }
    restrict_permissions(path)?;
    let _ = fs::remove_file(&backup);
    Ok(())
}

fn load_active_need(path: &Path) -> Result<Option<ActiveNeed>, String> {
    let backup = active_need_backup_path(path);
    if path.exists() {
        match fs::read(path)
            .map_err(|_| "cannot read active TRUYN request state".to_string())
            .and_then(|bytes| parse_active_need_bytes(&bytes))
        {
            Ok(active) => return Ok(Some(active)),
            Err(primary_error) if !backup.exists() => return Err(primary_error),
            Err(_) => {}
        }
    }
    if backup.exists() {
        let bytes = fs::read(&backup)
            .map_err(|_| "cannot read active TRUYN request backup".to_string())?;
        return parse_active_need_bytes(&bytes).map(Some);
    }
    Ok(None)
}

fn validate_result_payload(envelope: &Value, need_id: &str) -> Result<(), String> {
    let payload = envelope
        .get("payload")
        .and_then(Value::as_object)
        .ok_or_else(|| "RESULT payload must be an object".to_string())?;
    if payload.get("requestId").and_then(Value::as_str) != Some(need_id) {
        return Err("RESULT correlation does not match the requested NEED".into());
    }
    let completed_at = payload
        .get("completedAt")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "RESULT completedAt is missing".to_string())?;
    DateTime::parse_from_rfc3339(completed_at)
        .map_err(|_| "RESULT completedAt is not a parseable RFC3339 timestamp".to_string())?;
    if !payload.contains_key("output") {
        return Err("RESULT output field is missing".into());
    }
    if let Some(metadata) = payload.get("metadata") {
        if !metadata.is_object() {
            return Err("RESULT metadata must be an object".into());
        }
    }
    Ok(())
}

async fn ensure_session(state: &AppState, candidate: RelaySession) -> Result<RelaySession, String> {
    if candidate.is_fresh() {
        return Ok(candidate);
    }

    let _refresh = state.refresh_lock.lock().await;
    if let Some(current) = state.session.read().await.as_ref() {
        if current.relay_url == candidate.relay_url && current.is_fresh() {
            return Ok(current.clone());
        }
    }

    let allow_local_development =
        local_host(candidate.relay_url.host_str().unwrap_or_default());
    let (relay_url, http) =
        relay_client(candidate.relay_url.as_str(), allow_local_development).await?;
    let refreshed = register_session(
        &state.identity,
        relay_url,
        http,
        candidate.display_name.clone(),
    )
    .await?;

    {
        let mut current = state.session.write().await;
        if current
            .as_ref()
            .map(|session| session.relay_url == candidate.relay_url)
            .unwrap_or(false)
        {
            *current = Some(refreshed.clone());
        }
    }
    {
        let mut active = state.active_need.write().await;
        if let Some(active_need) = active.as_mut() {
            if active_need.relay_url == candidate.relay_url {
                active_need.session = Some(refreshed.clone());
            }
        }
    }

    Ok(refreshed)
}

async fn current_session(state: &AppState) -> Result<RelaySession, String> {
    let session = session_snapshot(state).await?;
    ensure_session(state, session).await
}

async fn force_refresh_session(
    state: &AppState,
    candidate: &RelaySession,
) -> Result<RelaySession, String> {
    let _refresh = state.refresh_lock.lock().await;

    let current = state.session.read().await.clone();
    match current {
        Some(current)
            if current.relay_url == candidate.relay_url
                && current.token != candidate.token
                && current.is_fresh() =>
        {
            {
                let mut active = state.active_need.write().await;
                if let Some(active_need) = active.as_mut() {
                    let matches_candidate = active_need.relay_url == candidate.relay_url
                        && active_need
                            .session
                            .as_ref()
                            .map(|session| session.token == candidate.token)
                            .unwrap_or(true);
                    if matches_candidate {
                        active_need.session = Some(current.clone());
                    }
                }
            }
            return Ok(current);
        }
        Some(current)
            if current.relay_url != candidate.relay_url
                || current.token != candidate.token =>
        {
            return Err("relay session changed while refresh was in flight".into());
        }
        None => {
            return Err("relay session ended while refresh was in flight".into());
        }
        _ => {}
    }

    let allow_local_development =
        local_host(candidate.relay_url.host_str().unwrap_or_default());
    let (relay_url, http) =
        relay_client(candidate.relay_url.as_str(), allow_local_development).await?;
    let refreshed = register_session(
        &state.identity,
        relay_url,
        http,
        candidate.display_name.clone(),
    )
    .await?;

    {
        let mut current = state.session.write().await;
        let still_same_session = current
            .as_ref()
            .map(|session| {
                session.relay_url == candidate.relay_url && session.token == candidate.token
            })
            .unwrap_or(false);
        if still_same_session {
            *current = Some(refreshed.clone());
        } else if let Some(current) = current.as_ref() {
            if current.relay_url == candidate.relay_url && current.is_fresh() {
                return Ok(current.clone());
            }
            return Err("relay session changed while refresh was completing".into());
        } else {
            return Err("relay session ended while refresh was completing".into());
        }
    }

    {
        let mut active = state.active_need.write().await;
        if let Some(active_need) = active.as_mut() {
            let still_same_active_session = active_need.relay_url == candidate.relay_url
                && active_need
                    .session
                    .as_ref()
                    .map(|session| session.token == candidate.token)
                    .unwrap_or(false);
            if still_same_active_session {
                active_need.session = Some(refreshed.clone());
            }
        }
    }
    Ok(refreshed)
}

async fn active_need_snapshot(state: &AppState, need_id: &str) -> Result<ActiveNeed, String> {
    let active = state
        .active_need
        .read()
        .await
        .clone()
        .ok_or_else(|| "no active TRUYN request".to_string())?;
    if active.need_id != need_id {
        return Err("request ID is not the active TRUYN request".into());
    }
    Ok(active)
}

async fn active_session(state: &AppState, active: &ActiveNeed) -> Result<RelaySession, String> {
    if let Some(session) = active.session.clone() {
        return ensure_session(state, session).await;
    }

    let _refresh = state.refresh_lock.lock().await;
    if let Some(current) = state.session.read().await.as_ref() {
        if current.relay_url == active.relay_url && current.is_fresh() {
            return Ok(current.clone());
        }
    }

    let (relay_url, http) = relay_client(
        active.relay_url.as_str(),
        active.allow_local_development,
    )
    .await?;
    let session = register_session(
        &state.identity,
        relay_url,
        http,
        active.display_name.clone(),
    )
    .await?;
    *state.session.write().await = Some(session.clone());
    {
        let mut guard = state.active_need.write().await;
        if let Some(current) = guard.as_mut() {
            if current.need_id == active.need_id {
                current.session = Some(session.clone());
            }
        }
    }
    Ok(session)
}

async fn update_active_need(state: &AppState, active: ActiveNeed) -> Result<(), String> {
    persist_active_need(&state.active_need_path, &active)?;
    *state.active_need.write().await = Some(active);
    Ok(())
}

async fn claim_active_work(state: &AppState) -> Result<(), String> {
    let mut claim = state.active_claim.lock().await;
    if claim.is_some() {
        return Ok(());
    }

    let file = open_active_claim(&state.active_claim_path)?;
    if state.active_need.read().await.is_none() {
        if let Some(recovered) = load_active_need(&state.active_need_path)? {
            *state.active_need.write().await = Some(recovered);
            *claim = Some(file);
            return Err(
                "existing TRUYN request recovery state was found after acquiring the process lock"
                    .into(),
            );
        }
    }

    *claim = Some(file);
    Ok(())
}

async fn release_active_work(state: &AppState) {
    let mut claim = state.active_claim.lock().await;
    if let Some(file) = claim.take() {
        let _ = FileExt::unlock(&file);
    }
}

async fn update_active_need_if_current(
    state: &AppState,
    expected_need_id: &str,
    active: ActiveNeed,
) -> Result<bool, String> {
    let mut current = state.active_need.write().await;
    let still_current = current
        .as_ref()
        .map(|candidate| candidate.need_id == expected_need_id)
        .unwrap_or(false);
    if !still_current {
        return Ok(false);
    }
    persist_active_need(&state.active_need_path, &active)?;
    *current = Some(active);
    Ok(true)
}

async fn clear_active_need(state: &AppState, need_id: &str) {
    let mut active = state.active_need.write().await;
    if active
        .as_ref()
        .map(|candidate| candidate.need_id == need_id)
        .unwrap_or(false)
    {
        *active = None;
        for path in [
            state.active_need_path.clone(),
            active_need_backup_path(&state.active_need_path),
        ] {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == ErrorKind::NotFound => {}
                Err(_) => {}
            }
        }
        release_active_work(state).await;
    }
}

#[tauri::command]
async fn client_info(state: State<'_, AppState>) -> Result<ClientInfo, String> {
    let session = state.session.read().await;
    let active = state.active_need.read().await;
    Ok(ClientInfo {
        version: env!("CARGO_PKG_VERSION"),
        node_id: state.identity.node_id.clone(),
        public_key: state.identity.public_key_pem.clone(),
        connected: session.as_ref().map(RelaySession::is_alive).unwrap_or(false),
        relay_url: session.as_ref().map(|session| session.relay_url.to_string()),
        display_name: session.as_ref().map(|session| session.display_name.clone()),
        active_need_id: active.as_ref().map(|need| need.need_id.clone()),
    })
}

#[tauri::command]
async fn connect(
    state: State<'_, AppState>,
    relay_url: String,
    name: String,
    allow_local_development: bool,
) -> Result<ClientInfo, String> {
    let _mutation = state.mutation_lock.lock().await;
    if state.active_need.read().await.is_some() {
        return Err("cannot change relay while a TRUYN request is active".into());
    }
    let display_name: String = name.trim().chars().take(80).collect();
    let (relay_url, http) = relay_client(&relay_url, allow_local_development).await?;
    let session =
        register_session(&state.identity, relay_url, http, display_name).await?;
    *state.session.write().await = Some(session);
    drop(_mutation);
    client_info(state).await
}

#[tauri::command]
async fn disconnect(state: State<'_, AppState>) -> Result<ClientInfo, String> {
    let _mutation = state.mutation_lock.lock().await;
    if state.active_need.read().await.is_some() {
        return Err("cannot disconnect while a TRUYN request is active".into());
    }
    *state.session.write().await = None;
    drop(_mutation);
    client_info(state).await
}

#[tauri::command]
async fn discover(state: State<'_, AppState>, capability: String) -> Result<Value, String> {
    let capability = capability.trim();
    if capability.is_empty() || capability.len() > MAX_CAPABILITY_BYTES {
        return Err("capability must be between 1 and 200 bytes".into());
    }
    let mut session = current_session(state.inner()).await?;
    let mut url = session
        .relay_url
        .join("/v1/offers")
        .map_err(|_| "cannot construct discovery URL".to_string())?;
    url.query_pairs_mut().append_pair("capability", capability);
    let first = request_json_detailed(auth(&session, session.http.get(url.clone()))).await;
    let body = match first {
        Ok(body) => body,
        Err(failure) if failure.is_unauthorized() || failure.is_transport() => {
            session = force_refresh_session(state.inner(), &session).await?;
            request_json_detailed(auth(&session, session.http.get(url)))
                .await
                .map_err(|failure| failure.message)?
        }
        Err(failure) => return Err(failure.message),
    };
    let offers = body
        .get("offers")
        .and_then(Value::as_array)
        .ok_or_else(|| "relay returned an invalid discovery response".to_string())?;
    for offer in offers {
        let signed = signed_offer_view(offer)?;
        verify_envelope(&signed, "OFFER")?;
    }
    Ok(body)
}

#[tauri::command]
async fn submit_need(
    state: State<'_, AppState>,
    capability: String,
    prompt: String,
) -> Result<Value, String> {
    let capability = capability.trim();
    if capability.is_empty() || capability.len() > MAX_CAPABILITY_BYTES {
        return Err("capability must be between 1 and 200 bytes".into());
    }
    if prompt.trim().is_empty() || prompt.len() > MAX_PROMPT_BYTES {
        return Err("request must be between 1 byte and 32 KiB".into());
    }

    let _mutation = state.mutation_lock.lock().await;
    if state.active_need.read().await.is_some() {
        return Err("finish or cancel the active TRUYN request before submitting another".into());
    }
    let session = current_session(state.inner()).await?;
    let need = envelope(
        &state.identity,
        "NEED",
        json!({
            "capability": { "name": capability },
            "input": { "prompt": prompt },
            "policy": {}
        }),
    )?;
    let expected_need_id = envelope_id(&need)?;
    let mut active = ActiveNeed {
        need_id: expected_need_id.clone(),
        provider: None,
        relay_url: session.relay_url.clone(),
        display_name: session.display_name.clone(),
        allow_local_development: local_host(
            session.relay_url.host_str().unwrap_or_default(),
        ),
        submitted_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        ambiguous: true,
        session: Some(session.clone()),
    };
    claim_active_work(state.inner()).await?;
    if let Err(error) = update_active_need(state.inner(), active.clone()).await {
        release_active_work(state.inner()).await;
        return Err(error);
    }

    let need_url = session
        .relay_url
        .join("/v1/needs")
        .map_err(|_| "cannot construct NEED URL".to_string())?;
    let need_body = json!({ "envelope": need });
    let first = request_json_detailed(auth(
        &session,
        session.http.post(need_url.clone()).json(&need_body),
    ))
    .await;
    let response = match first {
        Err(failure) if failure.is_unauthorized() => {
            let refreshed = force_refresh_session(state.inner(), &session).await?;
            active.session = Some(refreshed.clone());
            update_active_need(state.inner(), active.clone()).await?;
            request_json_detailed(auth(
                &refreshed,
                refreshed.http.post(need_url).json(&need_body),
            ))
            .await
        }
        other => other,
    };

    let body = match response {
        Ok(body) => body,
        Err(failure) if failure.ambiguous => {
            return Ok(json!({
                "ok": false,
                "ambiguous": true,
                "needId": expected_need_id,
                "provider": Value::Null,
                "status": "submitted_unconfirmed",
                "warning": failure.message
            }));
        }
        Err(failure) => {
            clear_active_need(state.inner(), &expected_need_id).await;
            return Err(failure.message);
        }
    };

    let returned_need_id = body
        .get("needId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "relay returned an invalid NEED receipt".to_string())?;
    let provider = body
        .get("provider")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "relay returned an invalid NEED provider".to_string())?;
    if body.get("ok").and_then(Value::as_bool) != Some(true)
        || returned_need_id != expected_need_id
    {
        return Err("relay NEED receipt does not match the submitted signed request".into());
    }

    active.provider = Some(provider.to_string());
    active.ambiguous = false;
    update_active_need(state.inner(), active).await?;
    Ok(body)
}

#[tauri::command]
async fn request_status(state: State<'_, AppState>, need_id: String) -> Result<Value, String> {
    let need_id = need_id.trim();
    if need_id.is_empty() || need_id.len() > 256 {
        return Err("request ID is invalid".into());
    }
    let mut active = active_need_snapshot(state.inner(), need_id).await?;
    let mut session = active_session(state.inner(), &active).await?;
    let encoded =
        url::form_urlencoded::byte_serialize(need_id.as_bytes()).collect::<String>();
    let url = session
        .relay_url
        .join(&format!("/v1/requests/{encoded}"))
        .map_err(|_| "cannot construct request-status URL".to_string())?;

    let first = request_json_detailed(auth(&session, session.http.get(url.clone()))).await;
    let response = match first {
        Err(failure) if failure.is_unauthorized() || failure.is_transport() => {
            session = force_refresh_session(state.inner(), &session).await?;
            request_json_detailed(auth(&session, session.http.get(url))).await
        }
        other => other,
    };
    let mut body = match response {
        Ok(body) => body,
        Err(failure)
            if !failure.ambiguous
                && failure.message == "request_not_found"
                && active.ambiguous =>
        {
            let submitted = DateTime::parse_from_rfc3339(&active.submitted_at)
                .map_err(|_| "active request submission time is invalid".to_string())?
                .with_timezone(&Utc);
            if Utc::now().signed_duration_since(submitted).num_seconds() >= 10 {
                clear_active_need(state.inner(), need_id).await;
                return Ok(json!({
                    "ok": false,
                    "requestId": need_id,
                    "status": "not_found",
                    "provider": Value::Null,
                    "resultVerified": false,
                    "terminal": true
                }));
            }
            return Err(failure.message);
        }
        Err(failure) => return Err(failure.message),
    };

    if body.get("requestId").and_then(Value::as_str) != Some(need_id) {
        return Err("relay status response is correlated to a different request".into());
    }
    let provider = body
        .get("provider")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "relay status response is missing the matched provider".to_string())?
        .to_string();
    if let Some(expected) = active.provider.as_deref() {
        if expected != provider {
            return Err("relay status provider does not match the accepted NEED provider".into());
        }
    } else {
        active.provider = Some(provider.clone());
        active.ambiguous = false;
        active.session = Some(session.clone());
        if !update_active_need_if_current(state.inner(), need_id, active.clone()).await? {
            return Err("request is no longer active".into());
        }
    }

    let status = body.get("status").and_then(Value::as_str).unwrap_or("unknown");
    let completed = status == "completed";
    let terminal = matches!(status, "completed" | "cancelled" | "failed");
    let verification = if completed {
        (|| -> Result<(), String> {
            let result_envelope = body
                .pointer("/result/envelope")
                .ok_or_else(|| "completed request is missing RESULT envelope".to_string())?;
            let signer = verify_envelope(result_envelope, "RESULT")?;
            if signer != provider {
                return Err("RESULT signer does not match the accepted NEED provider".into());
            }
            validate_result_payload(result_envelope, need_id)?;
            Ok(())
        })()
    } else {
        Ok(())
    };

    if terminal {
        clear_active_need(state.inner(), need_id).await;
    }

    if let Err(error) = verification {
        if let Some(object) = body.as_object_mut() {
            object.insert("resultVerified".into(), Value::Bool(false));
            object.insert("terminal".into(), Value::Bool(true));
            object.insert("verificationError".into(), Value::String(error));
        }
        return Ok(body);
    }

    if let Some(object) = body.as_object_mut() {
        object.insert("resultVerified".into(), Value::Bool(completed));
        object.insert("terminal".into(), Value::Bool(terminal));
    }
    Ok(body)
}

#[tauri::command]
async fn cancel_need(state: State<'_, AppState>, need_id: String) -> Result<Value, String> {
    let need_id = need_id.trim();
    if need_id.is_empty() || need_id.len() > 256 {
        return Err("request ID is invalid".into());
    }

    let _mutation = state.mutation_lock.lock().await;
    let active = active_need_snapshot(state.inner(), need_id).await?;
    let session = active_session(state.inner(), &active).await?;
    let revoke = envelope(
        &state.identity,
        "REVOKE",
        json!({
            "targetId": need_id,
            "targetKind": "need",
            "reason": "cancelled_by_native_client"
        }),
    )?;
    let revoke_url = session
        .relay_url
        .join("/v1/revoke")
        .map_err(|_| "cannot construct cancellation URL".to_string())?;
    let revoke_body = json!({ "envelope": revoke });
    let first = request_json_detailed(auth(
        &session,
        session.http.post(revoke_url.clone()).json(&revoke_body),
    ))
    .await;
    let response = match first {
        Err(failure) if failure.is_unauthorized() || failure.is_transport() => {
            let refreshed = force_refresh_session(state.inner(), &session).await?;
            request_json_detailed(auth(
                &refreshed,
                refreshed.http.post(revoke_url).json(&revoke_body),
            ))
            .await
        }
        other => other,
    };
    let body = match response {
        Ok(body) => body,
        Err(failure)
            if !failure.ambiguous && failure.message == "request_already_completed" =>
        {
            return Ok(json!({
                "ok": false,
                "targetId": need_id,
                "status": "completed",
                "terminal": false,
                "resumeStatus": true,
                "warning": "request completed before cancellation; retrieving the terminal RESULT"
            }));
        }
        Err(failure)
            if !failure.ambiguous
                && matches!(failure.message.as_str(), "target_not_found" | "request_failed") =>
        {
            let terminal_status = if failure.message == "request_failed" {
                "failed"
            } else {
                "not_found"
            };
            clear_active_need(state.inner(), need_id).await;
            return Ok(json!({
                "ok": false,
                "targetId": need_id,
                "status": terminal_status,
                "terminal": true,
                "warning": "relay request is already terminal; local recovery state was cleared"
            }));
        }
        Err(failure) => return Err(failure.message),
    };
    if body.get("targetId").and_then(Value::as_str) != Some(need_id)
        || body.get("ok").and_then(Value::as_bool) != Some(true)
        || body.get("cancelled").and_then(Value::as_bool) != Some(true)
        || body.get("targetKind").and_then(Value::as_str) != Some("need")
    {
        return Err("relay cancellation acknowledgement is invalid or mismatched".into());
    }
    clear_active_need(state.inner(), need_id).await;
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tcj1_orders_object_keys_by_utf16_code_units() {
        let value = json!({
            "\u{E000}": 2,
            "\u{10000}": 1
        });
        let text = String::from_utf8(tcj1_bytes(&value).unwrap()).unwrap();
        assert_eq!(text, "{\"𐀀\":1,\"\":2}");
        assert_eq!(canonical_number(&serde_json::Number::from_f64(1e20).unwrap()).unwrap(), "100000000000000000000");
        assert_eq!(canonical_number(&serde_json::Number::from_f64(1e21).unwrap()).unwrap(), "1e+21");
    }

    #[test]
    fn mapped_private_ipv6_is_rejected_as_private_ipv4() {
        let mapped: IpAddr = "::ffff:127.0.0.1".parse().unwrap();
        assert!(forbidden_public_ip(mapped));
        let mapped_private: IpAddr = "::ffff:10.0.0.1".parse().unwrap();
        assert!(forbidden_public_ip(mapped_private));
    }

    #[test]
    fn recovery_backup_path_is_distinct_and_stable() {
        let path = PathBuf::from("/tmp/active-need.json");
        assert_eq!(
            active_need_backup_path(&path),
            PathBuf::from("/tmp/active-need.json.bak")
        );
    }

    #[test]
    fn result_payload_requires_bounded_terminal_semantics() {
        let valid = json!({
            "payload": {
                "requestId": "need-1",
                "output": null,
                "completedAt": "2026-10-07T12:00:00.000Z",
                "metadata": {}
            }
        });
        assert!(validate_result_payload(&valid, "need-1").is_ok());

        let bad_time = json!({
            "payload": {
                "requestId": "need-1",
                "output": null,
                "completedAt": "not-a-time",
                "metadata": {}
            }
        });
        assert!(validate_result_payload(&bad_time, "need-1").is_err());

        let bad_metadata = json!({
            "payload": {
                "requestId": "need-1",
                "output": null,
                "completedAt": "2026-10-07T12:00:00.000Z",
                "metadata": []
            }
        });
        assert!(validate_result_payload(&bad_metadata, "need-1").is_err());
    }

    #[test]
    fn verifier_rejects_nonconforming_created_at() {
        let identity = identity_from_signing_key(SigningKey::generate(&mut OsRng)).unwrap();
        let mut value = envelope(
            &identity,
            "NEED",
            json!({"capability":{"name":"test"}, "input":{}, "policy":{}}),
        )
        .unwrap();
        let object = value.as_object_mut().unwrap();
        object.insert("createdAt".into(), Value::String("bogus".into()));
        object.remove("signature");
        let signature = identity
            .signing_key
            .sign(&tcj1_bytes(&Value::Object(object.clone())).unwrap());
        object.insert("signature".into(), Value::String(BASE64.encode(signature.to_bytes())));
        assert!(verify_envelope(&value, "NEED").is_err());
    }

    #[test]
    fn native_envelope_uses_tcj1_and_verifies() {
        let identity = identity_from_signing_key(SigningKey::generate(&mut OsRng)).unwrap();
        let value = envelope(
            &identity,
            "NEED",
            json!({
                "capability": { "name": "test" },
                "input": { "\u{E000}": 2, "\u{10000}": 1 },
                "policy": {}
            }),
        )
        .unwrap();
        assert_eq!(verify_envelope(&value, "NEED").unwrap(), identity.node_id);
    }

    #[test]
    fn relay_trust_metadata_is_not_part_of_provider_offer_signature() {
        let identity = identity_from_signing_key(SigningKey::generate(&mut OsRng)).unwrap();
        let offer = {
            let mut value = envelope(
                &identity,
                "NEED",
                json!({"capability":{"name":"test"}}),
            )
            .unwrap();
            let object = value.as_object_mut().unwrap();
            object.insert("type".into(), Value::String("OFFER".into()));
            object.remove("signature");
            let signature = identity.signing_key.sign(&tcj1_bytes(&Value::Object(object.clone())).unwrap());
            object.insert("signature".into(), Value::String(BASE64.encode(signature.to_bytes())));
            object.insert("trust".into(), json!({"score": 0.9}));
            value
        };
        let signed = signed_offer_view(&offer).unwrap();
        assert_eq!(verify_envelope(&signed, "OFFER").unwrap(), identity.node_id);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let identity = load_or_create_identity(app.handle())
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            let active_need_path = active_need_file(app.handle())
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            let active_need = load_active_need(&active_need_path)
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            let active_claim_path = active_claim_file(app.handle())
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            let active_claim = if active_need.is_some() {
                Some(
                    open_active_claim(&active_claim_path)
                        .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?,
                )
            } else {
                None
            };
            app.manage(AppState {
                identity,
                session: RwLock::new(None),
                active_need: RwLock::new(active_need),
                active_need_path,
                active_claim_path,
                active_claim: Mutex::new(active_claim),
                mutation_lock: Mutex::new(()),
                refresh_lock: Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            client_info,
            connect,
            disconnect,
            discover,
            submit_need,
            request_status,
            cancel_need
        ])
        .run(tauri::generate_context!())
        .expect("TRUYN native client runtime failed");
}
