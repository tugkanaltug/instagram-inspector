const DASHBOARD_URL = chrome.runtime.getURL('dashboard.html');

chrome.action.onClicked.addListener(async () => {
  const existingTabs = await chrome.tabs.query({ url: DASHBOARD_URL });
  const existingTab = existingTabs[0];

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (typeof existingTab.windowId === 'number') {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: DASHBOARD_URL });
});
