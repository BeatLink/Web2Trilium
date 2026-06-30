// background.js
browser.browserAction.onClicked.addListener(async () => {
  const url = browser.runtime.getURL("manage.html")
  const existing = await browser.tabs.query({ url })
  if (existing.length > 0) {
    await browser.tabs.update(existing[0].id, { active: true })
    await browser.windows.update(existing[0].windowId, { focused: true })
  } else {
    browser.tabs.create({ url })
  }
})
