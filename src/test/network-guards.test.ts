import { describe, expect, it } from "vitest";
import { ipPrivadoLocalOuReservado } from "@/lib/network-guards";
import { urlPermitida } from "@/lib/site-fetch.server";

describe("proteção de destinos de rede", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.51.100.10",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])("bloqueia IP local, privado ou reservado: %s", (ip) => {
    expect(ipPrivadoLocalOuReservado(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) (
    "permite IP público: %s",
    (ip) => expect(ipPrivadoLocalOuReservado(ip)).toBe(false),
  );

  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "http://192.168.1.20",
    "http://[::1]/",
    "file:///etc/passwd",
    "https://usuario:senha@example.com",
  ])("recusa URL insegura: %s", (url) => {
    expect(urlPermitida(url)).toBeNull();
  });

  it("aceita URL pública para validar o DNS antes do fetch", () => {
    expect(urlPermitida("https://example.com/contato")?.hostname).toBe("example.com");
  });
});
