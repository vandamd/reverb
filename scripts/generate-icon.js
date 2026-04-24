const { createCanvas, registerFont } = require("canvas");
const fs = require("node:fs");
const path = require("node:path");

const fontPath = path.join(
  import.meta.dirname,
  "../assets/fonts/PublicSans-Regular.ttf"
);
registerFont(fontPath, { family: "PublicSans" });

const appConfig = JSON.parse(fs.readFileSync("app.json", "utf8"));
const appName = appConfig.expo.name;
const firstLetter = appName.charAt(0).toUpperCase();

const size = 100;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext("2d");

ctx.fillStyle = "black";
ctx.fillRect(0, 0, size, size);

ctx.fillStyle = "white";
ctx.font = "85.4px PublicSans";
ctx.textAlign = "center";
ctx.textBaseline = "alphabetic";
const metrics = ctx.measureText(firstLetter);
const y =
  (size + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) /
  2;
ctx.fillText(firstLetter, size / 2, y);

const outputPath = path.join(import.meta.dirname, "../assets/images/icon.png");
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const buffer = canvas.toBuffer("image/png");
fs.writeFileSync(outputPath, buffer);

console.log(`Icon saved to ${outputPath}`);
