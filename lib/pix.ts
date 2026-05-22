/* eslint-disable prefer-const */
interface PixData {
  amount: number;
  pixKey?: string;
  merchantName?: string;
  city?: string;
}

export function generatePixQRCode({
  amount,
  pixKey = "00980322405",
  merchantName = "CLAUDENIVA GOMES",
  city = "BRASIL",
}: PixData): string {
  const formattedAmount = Number(amount).toFixed(2);

  const cleanName = merchantName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/gi, "")
    .substring(0, 25)
    .trim()
    .toUpperCase();

  const cleanCity = city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/gi, "")
    .substring(0, 15)
    .trim()
    .toUpperCase();

  const pixDomain = "br.gov.bcb.pix";
  const txid = "***";

  function pad2(n: number | string) {
    return String(n).padStart(2, "0");
  }

  const merchantAccInfo = [
    "00",
    pad2(pixDomain.length),
    pixDomain,
    "01",
    pad2(pixKey.length),
    pixKey,
  ].join("");
  const merchantField = `26${pad2(merchantAccInfo.length)}${merchantAccInfo}`;

  const txidField = `62${pad2(txid.length + 4)}0503${txid}`;

  let payload = [
    "000201",
    merchantField,
    "52040000",
    "5303986",
    `54${pad2(formattedAmount.length)}${formattedAmount}`,
    "5802BR",
    `59${pad2(cleanName.length)}${cleanName}`,
    `60${pad2(cleanCity.length)}${cleanCity}`,
    txidField,
    "6304",
  ].join("");

  const crc16 = calculateCRC16(payload);
  return payload + crc16;
}

function calculateCRC16(str: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;
  for (let pos = 0; pos < str.length; pos++) {
    crc ^= str.charCodeAt(pos) << 8;
    for (let i = 0; i < 8; i++) {
      crc = ((crc << 1) ^ (crc & 0x8000 ? polynomial : 0)) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function generateTxId(): string {
  return Math.random().toString(36).substring(2, 14).toUpperCase();
}
