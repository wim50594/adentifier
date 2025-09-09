// -----------------------------
// Fetch EasyList on install
// -----------------------------
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Ad Scanner installed.");

  const url = "https://easylist.to/easylist/easylist.txt";
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    chrome.storage.local.set({ easylist: text }, () => {
      console.log("EasyList rules stored.");
    });
  } catch (e) {
    console.error("Failed to fetch EasyList:", e);
  }
});

// -----------------------------
// Capture visible tab screenshot
// -----------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "capture_tab") {
    if (!sender.tab || !sender.tab.windowId) {
      sendResponse(null);
      return;
    }

    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error("Capture failed:", chrome.runtime.lastError.message);
          sendResponse(null);
          return;
        }
        sendResponse(dataUrl);
      }
    );

    // Keep the message channel open for async response
    return true;
  }
});
