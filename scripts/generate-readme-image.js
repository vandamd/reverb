const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("node:fs");
const path = require("node:path");

const fontPath = path.join(
  import.meta.dirname,
  "../assets/fonts/PublicSans-Regular.ttf"
);
registerFont(fontPath, { family: "PublicSans" });

const width = 2572;
const height = 1048;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

ctx.fillStyle = "#393939";
ctx.fillRect(0, 0, width, height);

const appConfig = JSON.parse(fs.readFileSync("app.json", "utf8"));
const appName = appConfig.expo.name;

const firstLetter = appName.charAt(0).toUpperCase();
const iconSize = 150;
const iconCanvas = createCanvas(iconSize, iconSize);
const iconCtx = iconCanvas.getContext("2d");

iconCtx.fillStyle = "black";
iconCtx.fillRect(0, 0, iconSize, iconSize);

iconCtx.fillStyle = "white";
iconCtx.font = "128.1px PublicSans";
iconCtx.textAlign = "center";
iconCtx.textBaseline = "alphabetic";
const iconMetrics = iconCtx.measureText(firstLetter);
const iconY =
  (iconSize +
    iconMetrics.actualBoundingBoxAscent -
    iconMetrics.actualBoundingBoxDescent) /
  2;
iconCtx.fillText(firstLetter, iconSize / 2, iconY);

const icon = iconCanvas;

const screenshots = ["A", "B", "C", "D"];
const screenshotWidth = 573;
const screenshotGap = 40;
const screenshotY = 310;

const screenshotImages = await Promise.all(
  screenshots.map((name) => {
    const p = path.join(import.meta.dirname, `../assets/images/${name}.png`);
    return loadImage(p);
  })
);

const fontSize = 64;
const gap = 24;
const textY = 80;

const centerX = width / 2;

ctx.fillStyle = "white";
ctx.font = `${fontSize}px PublicSans`;

const totalWidth = iconSize + gap + ctx.measureText(appName).width;
const startX = centerX - totalWidth / 2;

ctx.drawImage(icon, startX, textY, iconSize, iconSize);

ctx.textAlign = "left";
ctx.textBaseline = "middle";
ctx.fillText(appName, startX + iconSize + gap, textY + iconSize / 2);

const totalScreenshotWidth =
  screenshots.length * screenshotWidth +
  (screenshots.length - 1) * screenshotGap;
const screenshotStartX = centerX - totalScreenshotWidth / 2;

for (let i = 0; i < screenshotImages.length; i++) {
  const x = screenshotStartX + i * (screenshotWidth + screenshotGap);
  ctx.drawImage(screenshotImages[i], x, screenshotY, screenshotWidth, 658);
}

const outputPath = path.join(
  import.meta.dirname,
  "../assets/images/example.png"
);
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const buffer = canvas.toBuffer("image/png");
fs.writeFileSync(outputPath, buffer);

console.log(`Generated readme example image at ${outputPath}`);
