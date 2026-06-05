# Installing Porta as a PWA

Porta is a [Progressive Web App (PWA)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps):
a website that can be installed on your device and used like a native app.
Once installed, it launches from your home screen or app launcher with
its own window and receives updates automatically.

## How to install

| Platform             | Steps                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Android (Chrome)** | Tap the browser menu (⋮) → **Install app** or **Add to Home screen**. See [Chrome: Install PWAs](https://support.google.com/chrome/answer/9658361).                                                      |
| **iOS (Safari)**     | Tap the Share button (↑) → **Add to Home Screen**. See [Apple: Add to Home Screen](https://support.apple.com/en-us/108379).                                                                              |
| **Desktop (Chrome)** | Click the install icon (⊕) in the address bar, or go to the browser menu (⋮) → **Install Porta**. See [Chrome: Install PWAs](https://support.google.com/chrome/answer/9658361).                          |
| **Desktop (Edge)**   | Click the install icon (⊕) in the address bar, or go to Settings (···) → **Apps** → **Install Porta**. See [Edge: Install PWAs](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/). |

> **Note:** PWA installation requires HTTPS or `localhost`. If you access
> Porta over LAN by IP address, the install prompt will not appear.
> Use [Cloudflare remote access](cloudflare.md) for a
> full PWA experience on mobile.
