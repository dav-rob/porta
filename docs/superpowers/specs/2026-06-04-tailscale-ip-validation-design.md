# Spec: Support Tailscale IPs by Default in Host Validation

Enable Tailscale CGNAT IPs (range `100.64.0.0/10`) to be used as `PORTA_HOST` without requiring the `PORTA_TAILSCALE=1` environment variable.

## Background

Porta has a security guard (`assertSupportedListenHost`) that prevents exposing the proxy to the public internet. By default, it allows loopback interfaces (`127.0.0.1`, `localhost`, `::1`) and private LAN IPs (Class A, B, C RFC 1918 and link-local IPv6 ranges).

Tailscale interfaces utilize IPs in the CGNAT address space `100.64.0.0/10` (from `100.64.0.0` to `100.127.255.255`). Previously, validating a Tailscale host required setting the environment variable `PORTA_TAILSCALE=1`. Since Tailscale is a secure private overlay network, these CGNAT addresses should be treated as private/safe by default, alongside loopback and private LAN addresses.

## Proposed Changes

### [packages/proxy/src/exposure.ts](file:///Users/davidroberts/projects/quick-scripts/porta/packages/proxy/src/exposure.ts)

* Modify `assertSupportedListenHost` to include `isTailscaleIp(normalized)` in the main validation whitelist alongside loopback and private LAN checks.
* Remove the conditional environment check `env.PORTA_TAILSCALE === "1"`.
* Update the fallback error message to mention Tailscale IPs:
  ```
  "Public internet exposure is unsupported. Set PORTA_HOST to a loopback address, an explicit private LAN IP, or a Tailscale IP."
  ```

### [packages/proxy/src/__tests__/exposure.test.ts](file:///Users/davidroberts/projects/quick-scripts/porta/packages/proxy/src/__tests__/exposure.test.ts)

* Add test case `accepts Tailscale IPs`:
  * Validates `100.64.0.1`, `100.127.255.254`, etc. are accepted without throwing.
* Add test case ensuring public IPs starting with `100.` but outside CGNAT (e.g., `100.63.255.255`, `100.128.0.1`) are still rejected.

## Verification Plan

### Automated Tests
Run unit tests in the `@porta/proxy` package:
```bash
pnpm --filter @porta/proxy test
```
Ensure all tests, including new Tailscale validation tests, pass successfully.
