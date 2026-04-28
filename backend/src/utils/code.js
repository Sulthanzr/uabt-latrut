export function generateSessionCode() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `UABT-${n}`;
}

export function generateQrCode() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SQ-${part()}-${part()}`;
}
