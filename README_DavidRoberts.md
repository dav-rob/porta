# Porta — David Roberts Setup

## Getting the Code

```bash
git clone https://github.com/dav-rob/porta.git
cd porta
pnpm install
```

This clones directly onto the `develop` branch which is the one you want.

---

## To Change This Code

Make your changes, then:

```bash
git add .
git commit -m "your message"
git push dav-rob develop
```

To get updates from the original author:

```bash
git pull origin develop
```

---

## Running with Tailscale

Make sure your `.env` file has your Tailscale IP set:

```
PORTA_HOST=100.123.104.63     # replace with your Tailscale IP if different
PORTA_PORT=3170
```

Then run:

```bash
pnpm dev:tailscale
```

- **On your Mac** — open [http://localhost:5173](http://localhost:5173)
- **On your phone** — make sure it's on Tailscale, then open `http://<your-tailscale-ip>:5173` (e.g. `http://100.123.104.63:5173`)

To find your Tailscale IP at any time:

```bash
tailscale ip -4
```
