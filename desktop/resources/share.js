let selected = null;
const sources = document.getElementById("sources");
const share = document.getElementById("share");
const status = document.getElementById("status");
window.kyroShare
  .sources()
  .then((result) => {
    document.getElementById("audio-label").hidden = !result.audioRequested;
    for (const source of result.sources) {
      const button = document.createElement("button");
      button.className = "source";
      button.setAttribute("aria-pressed", "false");
      const image = document.createElement("img");
      image.src = source.thumbnail;
      image.alt = "";
      const label = document.createElement("span");
      label.textContent = source.name;
      button.append(image, label);
      button.addEventListener("click", () => {
        selected = source.id;
        for (const option of sources.children)
          option.setAttribute("aria-pressed", String(option === button));
        share.disabled = false;
      });
      sources.append(button);
    }
    status.textContent = result.sources.length
      ? ""
      : "No screens or windows are available.";
  })
  .catch(() => {
    status.textContent =
      "Couldn't load your screens. Close this window and try again.";
  });
document
  .getElementById("cancel")
  .addEventListener("click", () => window.kyroShare.select(null, false));
share.addEventListener("click", () => {
  share.disabled = true;
  void window.kyroShare.select(
    selected,
    document.getElementById("audio").checked,
  );
});
