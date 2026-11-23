import { isIP } from "node:net";

function prefixMatch(valor: bigint, prefixo: bigint, bits: number): boolean {
  return (valor >> BigInt(128 - bits)) === (prefixo >> BigInt(128 - bits));
}

function ipv4EmBigInt(endereco: string): bigint | null {
  if (isIP(endereco) !== 4) return null;
  const octetos = endereco.split(".").map(Number);
  if (octetos.length !== 4 || octetos.some((n) => n < 0 || n > 255)) return null;
  return octetos.reduce((valor, octeto) => (valor << 8n) | BigInt(octeto), 0n);
}

function ipv6EmBigInt(enderecoBruto: string): bigint | null {
  let endereco = enderecoBruto.toLowerCase().split("%")[0] ?? "";
  if (isIP(endereco) !== 6) return null;
  if (endereco.includes(".")) {
    const pos = endereco.lastIndexOf(":");
    const ipv4 = ipv4EmBigInt(endereco.slice(pos + 1));
    if (pos < 0 || ipv4 === null) return null;
    const grupo1 = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const grupo2 = Number(ipv4 & 0xffffn).toString(16);
    endereco = `${endereco.slice(0, pos + 1)}${grupo1}:${grupo2}`;
  }
  const blocos = endereco.split("::");
  if (blocos.length > 2) return null;
  const esquerda = (blocos[0] ?? "").split(":").filter(Boolean);
  const direita = (blocos[1] ?? "").split(":").filter(Boolean);
  const zeros = blocos.length === 2 ? 8 - esquerda.length - direita.length : 0;
  const grupos = [...esquerda, ...Array(Math.max(0, zeros)).fill("0"), ...direita];
  if (grupos.length !== 8) return null;
  try {
    return grupos.reduce((valor, grupo) => (valor << 16n) | BigInt(`0x${grupo || "0"}`), 0n);
  } catch { return null; }
}

function ipv4PrivadoLocalOuReservado(endereco: string): boolean {
  const valor = ipv4EmBigInt(endereco);
  if (valor === null) return true;
  const octetos = endereco.split(".").map(Number);
  const a = octetos[0] ?? 0; const b = octetos[1] ?? 0; const c = octetos[2] ?? 0;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) || (a === 192 && b === 31 && c === 196) ||
    (a === 192 && b === 175 && c === 48) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

export function ipPrivadoLocalOuReservado(endereco: string): boolean {
  const tipo = isIP(endereco);
  if (tipo === 4) return ipv4PrivadoLocalOuReservado(endereco);
  if (tipo !== 6) return true;
  const valor = ipv6EmBigInt(endereco);
  if (valor === null) return true;
  const faixaGlobalUnicast = (valor >> 125n) === 1n; // 2000::/3
  const documentacao = prefixMatch(valor, 0x20010db8000000000000000000000000n, 32) ||
    prefixMatch(valor, 0x3fff0000000000000000000000000000n, 20);
  const transicaoOuEspecial = prefixMatch(valor, 0x20010000000000000000000000000000n, 23) ||
    prefixMatch(valor, 0x20020000000000000000000000000000n, 16);
  return !faixaGlobalUnicast || documentacao || transicaoOuEspecial;
}
