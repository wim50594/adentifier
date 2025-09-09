// -----------------------------
// Config: backend server
// -----------------------------
async function getConfig() {
  const defaultConfig = { backendUrl: "http://localhost", backendPort: 5500 };
  const stored = await chrome.storage.local.get(["backendUrl", "backendPort"]);
  return {
    backendUrl: stored.backendUrl || defaultConfig.backendUrl,
    backendPort: stored.backendPort || defaultConfig.backendPort,
  };
}

// -----------------------------
// Helper: extract ad URL from element
// -----------------------------
// Extract first ad URL (iframe or img) recursively
function getAdUrl(element) {
  if (element.tagName === "IFRAME" && element.src) return element.src;
  if (element.tagName === "IMG" && element.src) return element.src;

  const iframe = element.querySelector("iframe[src]");
  if (iframe) return iframe.src;

  const img = element.querySelector("img[src]");
  if (img) return img.src;

  return null;
}

// -----------------------------
// Capture screenshot (scroll element into view first)
// -----------------------------
async function captureScreenshot(adElement) {
  return new Promise((resolve) => {
    adElement.scrollIntoView({ behavior: "auto", block: "center" });

    // Give the browser some time to scroll/render
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "capture_tab" }, (dataUrl) => {
        if (!dataUrl) return resolve(null);

        // Crop to element bounding rect
        const rect = adElement.getBoundingClientRect();
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = rect.width * window.devicePixelRatio;
          canvas.height = rect.height * window.devicePixelRatio;
          const ctx = canvas.getContext("2d");

          ctx.drawImage(
            img,
            rect.left * window.devicePixelRatio,
            rect.top * window.devicePixelRatio,
            rect.width * window.devicePixelRatio,
            rect.height * window.devicePixelRatio,
            0,
            0,
            rect.width * window.devicePixelRatio,
            rect.height * window.devicePixelRatio
          );

          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    }, 300); // small delay for scroll
  });
}

// -----------------------------
// Send to server
// -----------------------------
async function sendToServer(adId, adUrl, screenshot, domHtml) {
  const { backendUrl, backendPort } = await getConfig();
  const serverUrl = `${backendUrl}:${backendPort}/upload_ad`;

  const payload = {
    ad_id: adId,
    ad_url: adUrl,
    screenshot: screenshot || null,
    dom_html: domHtml || null,
    context: window.location.href,
  };

  try {
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("Server error:", res.status);
    else console.log("Ad sent:", adId);
  } catch (e) {
    console.error("Failed to send data:", e);
  }
}

// -----------------------------
// Scan ads using selectors
// -----------------------------
async function scanAds() {
  const { easylist } = await chrome.storage.local.get("easylist");
  if (!easylist) return;

  const selectors = easylist
    .split("\n")
    .filter((line) => line.startsWith("##"))
    .map((line) => line.slice(2).trim());

  const adsFound = [];
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        el.style.outline = "2px solid red";
        adsFound.push(el);
      });
    } catch {}
  }

  console.log(`Detected ${adsFound.length} ads.`);

  for (const ad of adsFound) {
    const adUrl = getAdUrl(ad);
    const screenshot = await captureScreenshot(ad);
    const domHtml = ad.outerHTML;

    await sendToServer(ad.id || "no-id", adUrl, screenshot, domHtml);
  }
}

// -----------------------------
// Run after page load
// -----------------------------
window.addEventListener("load", () => {
  setTimeout(scanAds, 2000);
});
