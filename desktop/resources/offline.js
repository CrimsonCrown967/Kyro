const retry = document.getElementById("retry");
const status = document.getElementById("retry-status");
const params = new URLSearchParams(location.search);
const certificate = params.get("reason") === "certificate";
const code = Number(params.get("code"));
const explanations = {
  "-7": "Kyro took too long to respond. We'll try connecting again shortly.",
  "-105":
    "Your device couldn't find Kyro's address. This can be a temporary DNS or service issue, even with working internet.",
  "-106":
    "The network connection was interrupted. We'll try again automatically when it returns.",
  "-118":
    "The connection to Kyro timed out. The service or network may be temporarily unavailable.",
};
if (explanations[code]) {
  document.getElementById("connection-detail").textContent = explanations[code];
}
if (Number.isInteger(code) && code < 0) {
  document.getElementById("connection-code").textContent =
    `www.kyro-chat.cyou · Connection error ${code}`;
}
let remaining = 15;
let connecting = false;

if (certificate) {
  document.getElementById("connection-detail").textContent =
    "Kyro couldn't establish a secure connection. Check your PC's date and time, or try again later.";
  status.textContent = "Waiting for a secure connection";
}

function reconnect() {
  if (connecting) return;
  connecting = true;
  clearInterval(timer);
  status.textContent = "Connecting to Kyro…";
  retry.setAttribute("aria-disabled", "true");
  // Only a fixed first-party URL. The main process restores the failed route.
  location.assign(retry.href);
}

const timer = setInterval(() => {
  if (certificate || connecting) return;
  remaining -= 1;
  status.textContent = `Reconnecting in ${remaining} seconds…`;
  if (remaining <= 0) reconnect();
}, 1000);

retry.addEventListener("click", (event) => {
  event.preventDefault();
  reconnect();
});
window.addEventListener("online", () => {
  if (!certificate) reconnect();
});
