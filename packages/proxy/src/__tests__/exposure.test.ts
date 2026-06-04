import { describe, expect, it } from "vitest";
import {
  assertSupportedListenHost,
  formatListenAddress,
  isLoopbackHost,
  isPrivateLanHost,
  resolveProxyHost,
} from "../exposure.js";

describe("proxy exposure guard", () => {
  it("defaults PORTA_HOST to loopback", () => {
    expect(resolveProxyHost({} as NodeJS.ProcessEnv)).toBe("127.0.0.1");
  });

  it("accepts loopback hosts", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(() => assertSupportedListenHost("127.0.0.1")).not.toThrow();
  });

  it("accepts explicit private LAN IPs", () => {
    expect(isPrivateLanHost("192.168.1.20")).toBe(true);
    expect(isPrivateLanHost("10.0.0.5")).toBe(true);
    expect(isPrivateLanHost("172.16.0.8")).toBe(true);
    expect(() => assertSupportedListenHost("192.168.1.20")).not.toThrow();
  });

  it("accepts Tailscale IPs", () => {
    expect(() => assertSupportedListenHost("100.64.0.1")).not.toThrow();
    expect(() => assertSupportedListenHost("100.127.255.254")).not.toThrow();
  });

  it("rejects non-CGNAT IPs starting with 100", () => {
    expect(() => assertSupportedListenHost("100.63.255.255")).toThrow(
      /Public internet exposure is unsupported/,
    );
    expect(() => assertSupportedListenHost("100.128.0.1")).toThrow(
      /Public internet exposure is unsupported/,
    );
  });

  it("rejects wildcard bind addresses", () => {
    expect(() => assertSupportedListenHost("0.0.0.0")).toThrow(/Wildcard bind/);
    expect(() => assertSupportedListenHost("::")).toThrow(/Wildcard bind/);
  });

  it("rejects public addresses and unknown hostnames", () => {
    expect(isPrivateLanHost("8.8.8.8")).toBe(false);
    expect(() => assertSupportedListenHost("8.8.8.8")).toThrow(
      /Public internet exposure is unsupported. Set PORTA_HOST to a loopback address, an explicit private LAN IP, or a Tailscale IP/,
    );
    expect(() => assertSupportedListenHost("porta.example.com")).toThrow(
      /Public internet exposure is unsupported. Set PORTA_HOST to a loopback address, an explicit private LAN IP, or a Tailscale IP/,
    );
  });

  it("formats listen addresses for logs", () => {
    expect(formatListenAddress("127.0.0.1", 3100)).toBe(
      "http://127.0.0.1:3100",
    );
    expect(formatListenAddress("::1", 3100)).toBe("http://[::1]:3100");
  });
});
