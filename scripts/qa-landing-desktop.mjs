// OllCLin — Captura desktop 1440px da landing em /landing.
export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/landing", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: ".landing-desktop.png", fullPage: false });
  return { screenshot: ".landing-desktop.png" };
}
