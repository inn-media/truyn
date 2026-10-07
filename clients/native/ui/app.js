const invoke = window.__TAURI__.core.invoke;

const byId = (id) => document.getElementById(id);
const connectForm = byId("connectForm");
const connectButton = connectForm.querySelector('button[type="submit"]');
const disconnectButton = byId("disconnectButton");
const discoverForm = byId("discoverForm");
const needForm = byId("needForm");
const needButton = needForm.querySelector('button[type="submit"]');
const cancelButton = byId("cancelButton");
const connectionBadge = byId("connectionBadge");
const nodeId = byId("nodeId");
const offers = byId("offers");
const requestId = byId("requestId");
const providerId = byId("providerId");
const requestStatus = byId("requestStatus");
const resultOutput = byId("resultOutput");
const verificationBadge = byId("verificationBadge");

let activeNeedId = null;
let pollGeneration = 0;
let pollFailures = 0;
let connecting = false;
let connected = false;

function showError(id, error) {
  const el = byId(id);
  el.textContent = error instanceof Error ? error.message : String(error);
  el.hidden = false;
}

function clearError(id) {
  const el = byId(id);
  el.textContent = "";
  el.hidden = true;
}

function refreshControls() {
  const active = Boolean(activeNeedId);
  connectButton.disabled = connecting || active;
  for (const input of connectForm.querySelectorAll("input")) input.disabled = connecting || active;
  disconnectButton.disabled = connecting || active || !connected;
  needButton.disabled = active;
  cancelButton.disabled = !active;
}

function updateConnection(info) {
  nodeId.textContent = info.nodeId;
  connected = Boolean(info.connected);
  if (info.activeNeedId && !activeNeedId) activeNeedId = info.activeNeedId;
  connectionBadge.textContent = connected ? "CONNECTED" : "OFFLINE";
  connectionBadge.className = "badge " + (connected ? "online" : "offline");
  refreshControls();
}

function outputValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

async function refreshInfo({ recoverActive = false } = {}) {
  try {
    const info = await invoke("client_info");
    updateConnection(info);
    if (recoverActive && info.activeNeedId) {
      activeNeedId = info.activeNeedId;
      pollGeneration += 1;
      pollFailures = 0;
      requestId.textContent = info.activeNeedId;
      providerId.textContent = "recovering";
      requestStatus.textContent = "recovering";
      resultOutput.textContent = "Recovering active TRUYN request…";
      refreshControls();
      pollNeed(info.activeNeedId, pollGeneration);
    }
  } catch (error) {
    showError("connectError", error);
  }
}

connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeNeedId || connecting) return;
  clearError("connectError");
  connecting = true;
  refreshControls();
  try {
    const info = await invoke("connect", {
      relayUrl: byId("relayUrl").value,
      name: byId("nodeName").value,
      allowLocalDevelopment: byId("localMode").checked
    });
    updateConnection(info);
  } catch (error) {
    showError("connectError", error);
  } finally {
    connecting = false;
    refreshControls();
  }
});

disconnectButton.addEventListener("click", async () => {
  if (activeNeedId || connecting) return;
  clearError("connectError");
  connecting = true;
  refreshControls();
  try {
    updateConnection(await invoke("disconnect"));
  } catch (error) {
    showError("connectError", error);
  } finally {
    connecting = false;
    refreshControls();
  }
});

discoverForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError("discoverError");
  offers.className = "offers";
  offers.replaceChildren();
  try {
    const body = await invoke("discover", { capability: byId("discoverCapability").value });
    const list = Array.isArray(body.offers) ? body.offers : [];
    if (list.length === 0) {
      offers.className = "offers empty";
      offers.textContent = "No authorized providers found.";
      return;
    }
    for (const offer of list) {
      const item = document.createElement("div");
      item.className = "offer";
      const title = document.createElement("strong");
      title.textContent = offer.payload && offer.payload.capability ? offer.payload.capability.name : "TRUYN provider";
      const identity = document.createElement("span");
      identity.textContent = offer.from || "unknown identity";
      item.append(title, identity);
      offers.append(item);
    }
  } catch (error) {
    offers.className = "offers empty";
    offers.textContent = "Discovery unavailable.";
    showError("discoverError", error);
  }
});

async function pollNeed(needId, generation) {
  if (generation !== pollGeneration || activeNeedId !== needId) return;
  try {
    const body = await invoke("request_status", { needId });
    if (generation !== pollGeneration || activeNeedId !== needId) return;
    if (!connected) {
      const info = await invoke("client_info");
      if (generation !== pollGeneration || activeNeedId !== needId) return;
      updateConnection(info);
    }
    pollFailures = 0;
    clearError("needError");
    requestStatus.textContent = body.status || "unknown";
    providerId.textContent = body.provider || providerId.textContent;
    if (body.status === "completed" && body.resultVerified !== true) {
      verificationBadge.textContent = "RESULT REJECTED";
      verificationBadge.className = "verify pending";
      resultOutput.textContent = "Terminal RESULT was rejected by native verification.";
      showError("needError", body.verificationError || "TRUYN RESULT is not verified");
      activeNeedId = null;
      refreshControls();
      return;
    }
    if (body.status === "completed") {
      const output = body.result && body.result.envelope && body.result.envelope.payload
        ? body.result.envelope.payload.output
        : null;
      verificationBadge.textContent = "SIGNATURE VERIFIED";
      verificationBadge.className = "verify ok";
      resultOutput.textContent = outputValue(output);
      activeNeedId = null;
      refreshControls();
      return;
    }
    if (body.terminal === true || body.status === "cancelled" || body.status === "failed") {
      resultOutput.textContent = body.status === "cancelled" ? "Request cancelled." : "Request terminated without a RESULT.";
      activeNeedId = null;
      refreshControls();
      return;
    }
    window.setTimeout(() => pollNeed(needId, generation), 1000);
  } catch (error) {
    if (generation !== pollGeneration || activeNeedId !== needId) return;
    pollFailures += 1;
    requestStatus.textContent = "retrying";
    showError("needError", "Status check failed; retrying without abandoning the active request. " + String(error));
    refreshControls();
    const delay = Math.min(10000, 1000 * (2 ** Math.min(pollFailures, 3)));
    window.setTimeout(() => pollNeed(needId, generation), delay);
  }
}

needForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeNeedId) return;
  clearError("needError");
  verificationBadge.textContent = "NOT VERIFIED";
  verificationBadge.className = "verify pending";
  resultOutput.textContent = "Waiting for RESULT…";
  requestStatus.textContent = "submitting";
  needButton.disabled = true;
  try {
    const receipt = await invoke("submit_need", {
      capability: byId("needCapability").value,
      prompt: byId("prompt").value
    });
    activeNeedId = receipt.needId;
    pollGeneration += 1;
    pollFailures = 0;
    requestId.textContent = receipt.needId;
    providerId.textContent = receipt.provider || "pending confirmation";
    requestStatus.textContent = receipt.ambiguous ? "reconciling" : "matched";
    if (receipt.warning) showError("needError", receipt.warning);
    refreshControls();
    pollNeed(receipt.needId, pollGeneration);
  } catch (error) {
    showError("needError", error);
    try {
      const info = await invoke("client_info");
      updateConnection(info);
      if (info.activeNeedId) {
        activeNeedId = info.activeNeedId;
        pollGeneration += 1;
        pollFailures = 0;
        requestId.textContent = info.activeNeedId;
        providerId.textContent = "pending confirmation";
        requestStatus.textContent = "reconciling";
        resultOutput.textContent = "Reconciling a submission whose acknowledgement was not trusted.";
        refreshControls();
        pollNeed(info.activeNeedId, pollGeneration);
        return;
      }
    } catch {}
    requestStatus.textContent = "failed";
    refreshControls();
  }
});

cancelButton.addEventListener("click", async () => {
  if (!activeNeedId) return;
  clearError("needError");
  const target = activeNeedId;
  cancelButton.disabled = true;
  try {
    const result = await invoke("cancel_need", { needId: target });
    if (activeNeedId !== target) return;
    if (result && result.resumeStatus === true) {
      requestStatus.textContent = "completed before cancel";
      resultOutput.textContent = "Request completed before cancellation. Retrieving and verifying RESULT…";
      if (result.warning) showError("needError", result.warning);
      refreshControls();
      pollNeed(target, pollGeneration);
      return;
    }
    pollGeneration += 1;
    activeNeedId = null;
    const terminalStatus = result && result.status;
    if (terminalStatus === "failed") {
      requestStatus.textContent = "failed";
      resultOutput.textContent = "Request failed before cancellation.";
    } else if (terminalStatus === "not_found") {
      requestStatus.textContent = "not found";
      resultOutput.textContent = "Relay no longer had this request; local recovery state was cleared.";
    } else {
      requestStatus.textContent = "cancelled";
      resultOutput.textContent = "Request cancelled.";
    }
    if (result && result.warning) showError("needError", result.warning);
  } catch (error) {
    showError("needError", error);
    try {
      const info = await invoke("client_info");
      updateConnection(info);
      if (!info.activeNeedId) {
        pollGeneration += 1;
        activeNeedId = null;
        requestStatus.textContent = "released";
      }
    } catch {}
  } finally {
    refreshControls();
  }
});

refreshInfo({ recoverActive: true });
