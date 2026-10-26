# Privacy

- Followers, Following, snapshot data, and the language preference are stored only in `chrome.storage.local`.
- Instagram Inspector does not send collected account data to the developer or to a third-party server.
- Followers and Following collection works by opening and automatically scrolling Instagram's own list dialogs.
- Story collection uses the Instagram web session already open in Chrome and Instagram's own web requests.
- The extension does not request or store an Instagram username, password, session cookie, or request token, and it does not transfer those values to the extension page.
- Story account information and temporary media URLs remain only in the extension page's memory. They are not written to `chrome.storage.local`, snapshots, or exported JSON files.
- Story media is loaded directly from Instagram CDN domains. Instagram can observe those network requests.
- The extension does not send a separate “seen” request, but it cannot guarantee that Instagram will not record viewing.
- User-exported JSON files are written only to the download location selected by the user.
- Snapshots store profile-photo URLs and a normalized media key for photo-change comparison. Temporary CDN host/signature changes are not treated as profile-photo changes.
- The extension does not follow or unfollow accounts, remove followers, send messages, or publish content.
