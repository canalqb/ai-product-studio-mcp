import { createWorker } from "tesseract.js";
import sharp from "sharp";

const svg = Buffer.from(
  '<svg width="400" height="120"><rect width="400" height="120" fill="white"/><text x="20" y="70" font-size="48" fill="black">CANALQB 123</text></svg>'
);
const png = await sharp(svg).png().toBuffer();
const w = await createWorker("eng");
const { data } = await w.recognize(png);
console.log("TEXT:", JSON.stringify(String(data.text).trim()));
console.log("CONF:", data.confidence);
console.log("KEYS:", Object.keys(data).join(","));
await w.terminate();
