const $ = selector => document.querySelector(selector);
const form = $("#search-form"), input = $("#identifier"), result = $("#result"), title = $("#item-title"), meta = $("#item-meta"), count = $("#file-count"), select = $("#track-select"), video = $("#player"), audio = $("#audio-player"), list = $("#file-list"), notice = $("#notice");
let currentItem = null, currentKey = "";
function showNotice(message, error = false) { notice.textContent = message; notice.style.color = error ? "#ff9c9c" : ""; }
function streamKey(identifier, file) { const bytes = new TextEncoder().encode(JSON.stringify({ identifier, file })); let binary = ""; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function readableSize(size) { const value = Number(size); if (!Number.isFinite(value) || value <= 0) return "Size unknown"; const units = ["B", "KB", "MB", "GB"], index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function activate(file) {
  currentKey = streamKey(currentItem.identifier, file.name); const url = `/api/stream?key=${encodeURIComponent(currentKey)}`, isVideo = /\.(mp4|m4v|webm|ogv)$/i.test(file.name);
  video.pause(); audio.pause(); video.hidden = !isVideo; audio.hidden = isVideo; const player = isVideo ? video : audio; player.src = url; player.load(); select.value = file.name;
  [...list.children].forEach(button => button.classList.toggle("active", button.dataset.file === file.name)); $("#stream-info").textContent = `Streaming ${file.name} · HTTP byte ranges enabled where supported`;
}
async function loadItem(identifier) {
  showNotice("Looking up Archive.org metadata…"); form.querySelector("button").disabled = true;
  try {
    const response = await fetch(`/api/metadata/${encodeURIComponent(identifier)}`), data = await response.json();
    if (!response.ok) throw new Error(data.error || "Metadata lookup failed"); if (!data.files?.length) throw new Error("No supported audio/video files were found in this item.");
    currentItem = data; title.textContent = data.title; meta.textContent = [data.creator, data.year, identifier].filter(Boolean).join(" · "); count.textContent = `${data.files.length} playable files`; select.replaceChildren(); list.replaceChildren();
    data.files.forEach(file => {
      const option = document.createElement("option"); option.value = file.name; option.textContent = file.name; select.append(option);
      const button = document.createElement("button"); button.type = "button"; button.className = "file"; button.dataset.file = file.name;
      const strong = document.createElement("strong"); strong.textContent = file.name; const small = document.createElement("small"); small.textContent = `${file.format || "Media"} · ${readableSize(file.size)}`;
      button.append(strong, small); button.addEventListener("click", () => activate(file)); list.append(button);
    });
    result.hidden = false; activate(data.files[0]); showNotice("Item loaded. Choose a track to switch audio or video."); result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { showNotice(error.message, true); } finally { form.querySelector("button").disabled = false; }
}
form.addEventListener("submit", event => { event.preventDefault(); const identifier = input.value.trim(); if (identifier) loadItem(identifier); });
select.addEventListener("change", () => { const file = currentItem?.files.find(item => item.name === select.value); if (file) activate(file); });
$("#copy-key").addEventListener("click", async () => { if (!currentKey) return; try { await navigator.clipboard.writeText(currentKey); showNotice("Base64URL stream key copied."); } catch { showNotice("Clipboard access was blocked by your browser.", true); } });
