// Minimal service worker for badge updates
// Draws count directly on icon to avoid badge box

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "badge" && typeof message.count === "number") {
    void updateIconWithCount(message.count);
  }
  if (message.type === "levelup" && typeof message.level === "number") {
    chrome.notifications.create(`milady-levelup-${Date.now()}`, {
      type: "basic",
      iconUrl: "milady-logo.png",
      title: "Milady Level Up!",
      message: `You reached Level ${message.level}`,
      priority: 1,
    });
  }
});

async function updateIconWithCount(count: number): Promise<void> {
  if (count <= 0) {
    // Draw rounded icon without count
    try {
      const canvas = new OffscreenCanvas(128, 128);
      const ctx = canvas.getContext("2d")!;
      const response = await fetch(chrome.runtime.getURL("milady-logo.png"));
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const r = 28;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(128 - r, 0); ctx.quadraticCurveTo(128, 0, 128, r);
      ctx.lineTo(128, 128 - r); ctx.quadraticCurveTo(128, 128, 128 - r, 128);
      ctx.lineTo(r, 128); ctx.quadraticCurveTo(0, 128, 0, 128 - r);
      ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath(); ctx.clip();
      ctx.drawImage(bitmap, 0, 0, 128, 128);
      const imageData = ctx.getImageData(0, 0, 128, 128);
      await chrome.action.setIcon({ imageData: { 128: imageData } });
    } catch {
      await chrome.action.setIcon({ path: "milady-logo.png" });
    }
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  try {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext("2d")!;

    const response = await fetch(chrome.runtime.getURL("milady-logo.png"));
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Draw logo with rounded corners
    const r = 28;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(128 - r, 0);
    ctx.quadraticCurveTo(128, 0, 128, r);
    ctx.lineTo(128, 128 - r);
    ctx.quadraticCurveTo(128, 128, 128 - r, 128);
    ctx.lineTo(r, 128);
    ctx.quadraticCurveTo(0, 128, 0, 128 - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(bitmap, 0, 0, 128, 128);

    const text = String(count);
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";

    // White outline for legibility
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 14;
    ctx.strokeText(text, 116, 128);

    // Green fill
    ctx.fillStyle = "#2f4d0c";
    ctx.fillText(text, 116, 128);

    const imageData = ctx.getImageData(0, 0, 128, 128);
    await chrome.action.setIcon({ imageData: { 128: imageData } });
    await chrome.action.setBadgeText({ text: "" });
  } catch {
    // Fallback to regular badge if OffscreenCanvas fails
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
    await chrome.action.setBadgeTextColor({ color: "#2f4d0c" });
  }
}
