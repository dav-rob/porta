# Porta

[![CI](https://github.com/dav-rob/porta/actions/workflows/ci.yml/badge.svg)](https://github.com/dav-rob/porta/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.7.0-green)

Porta is a mobile-friendly web UI for local
[Antigravity](https://antigravity.google/) agent sessions.

This is a remote-access focused fork of
[L1M80/porta](https://github.com/L1M80/porta). It keeps Porta self-hosted while
making it practical to use from a phone, tablet, or remote browser.

- [Remote access](#remote-access)
- [Agent permissions](#agent-permissions)
- [Permission details](#permission-details)
- [Architecture](#architecture)
- [Tailscale setup](docs/tailscale.md)
- [Cloudflare setup](docs/cloudflare.md)

## Agent Permissions

Default keeps command approval manual. Full access (in red) auto-approves
terminal command prompts for the workspace.

<p align="center">
  <img src="docs/default-manual-approval.jpg" alt="Porta on iPhone with Default selected and a command waiting for approval" width="300">
  <img src="docs/full-access-after.jpg" alt="Porta on iPhone with Full Access selected after command approval succeeds" width="300">
</p>

## Quick Start

Prerequisites:

- A machine running Antigravity
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+

Install Porta:

```bash
git clone https://github.com/dav-rob/porta.git
cd porta
pnpm install
cp .env.example .env
```

Start Porta locally:

```bash
pnpm dev
```

Open `http://localhost:5173` in your browser.

## Remote Access

Porta can be used locally, over a private network, or through a secured tunnel:

- Local/LAN: simplest setup for devices on the same network.
- [Tailscale](docs/tailscale.md): private mesh VPN access, useful for iPhone
  and iPad workflows.
- [Cloudflare](docs/cloudflare.md): public hostname with Cloudflare Tunnel,
  Pages, and optional Zero Trust access.

For Tailscale use, `scripts/util/runporta.sh` is a convenience wrapper around
`pnpm dev:tailscale`. It is optional; the normal development command remains
`pnpm dev`.

## Permission Details

Porta has a workspace permission selector in the chat composer:

- `Default`: terminal command prompts stay manual.
- `Full access`: terminal command prompts are auto-approved for that workspace.

This is intended to emulate the useful parts of Codex's permission mode inside
Porta. It is workspace-scoped, so one workspace can use Full Access while
another stays on Default.

File permission prompts are not auto-approved by this mode. They stay manual.

## Architecture

Porta has three main parts.

### Web App

The React UI running in the browser. It shows the chat list, chat view, command
cards, file permission cards, input box, settings, and workspace permission
selector.

### Porta Proxy

The local TypeScript server between the browser and Antigravity.

The browser talks to Porta over HTTP and WebSocket. Porta talks to the local
Antigravity language server / RPC API.

The live chat view works through a WebSocket. The web app opens a socket to
Porta for the current conversation. Porta keeps reading new steps from
Antigravity and pushes those steps to the browser.

### Antigravity Language Server

The local service that owns the agent session. It produces conversation steps:
messages, tool calls, command permission requests, file permission requests,
and run status updates.

This local API is private rather than a documented public Google SDK. Porta
discovers it by finding Antigravity's local language server process or daemon
metadata, reading the dynamic port and CSRF token, then calling local
Connect/RPC-style endpoints such as:

```text
/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps
```

The endpoint names and payloads are based on observed Antigravity behavior and
Codeium/Windsurf language-server conventions. Future Antigravity updates may
require adapter changes in the proxy.

## How Full Access Works

The workspace permission selector stores one setting per workspace in the
browser.

When the chat view fetches or streams steps, the web app sends the current mode
to the proxy:

```text
/api/conversations/:id/steps?permissionMode=full
/api/conversations/:id/ws?permissionMode=full
```

or:

```text
permissionMode=default
```

The proxy then applies the mode while handling incoming Antigravity steps:

- If the mode is `default`, it does nothing and command permission cards stay
  manual.
- If the mode is `full`, it watches for waiting terminal command permission
  requests and sends Antigravity the same approval response the user would send
  by pressing Approve.
- File permission requests are ignored by this auto-approval path.

Full Access does not change Antigravity globally. It is Porta approving
terminal command permission steps on the user's behalf for the active
workspace.

## Development

Common commands:

```bash
pnpm -r test
pnpm -r build
pnpm dev
pnpm dev:tailscale
```

See [AGENTS.md](AGENTS.md) for short notes for future coding agents.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
