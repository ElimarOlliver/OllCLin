// OllCLin — QA da Landing Page (Fase 6) — rota dedicada.
// Como ALLOW_DEV_AUTH=true autentica como dev na rota "/", a landing é
// acessada diretamente em /landing (rota pública dedicada para QA/demo).
export default async function run(page, ui) {
  const results = {};

  await page.goto("http://localhost:3000/landing", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  results.headerOllclin = await page.getByText("OllCLin", { exact: false }).first().isVisible().catch(() => false);
  results.heroHeading = await page.getByText(/cuida da sua clínica/i).first().isVisible().catch(() => false);
  results.carouselRegion = await page.getByRole("region", { name: /recursos em destaque/i }).isVisible().catch(() => false);
  results.contactSection = await page.getByText(/fale com a gente/i).first().isVisible().catch(() => false);
  results.enterButton = await page.getByRole("button", { name: /entrar/i }).first().isVisible().catch(() => false);

  // Carrossel avança automaticamente
  const tab1 = page.getByRole("tab", { name: /destaque 1/i });
  const tab2 = page.getByRole("tab", { name: /destaque 2/i });
  const before = await tab1.getAttribute("aria-selected").catch(() => null);
  await page.waitForTimeout(2400);
  const after1 = await tab1.getAttribute("aria-selected").catch(() => null);
  const after2 = await tab2.getAttribute("aria-selected").catch(() => null);
  results.carouselAutoAdvance = {
    before, afterTab1: after1, afterTab2: after2,
    advanced: before === "true" && after1 === "false" && after2 === "true",
  };

  // Sem overflow horizontal em 390px (mobile)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  results.mobileNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );

  // Captura mobile
  await page.screenshot({ path: ".landing-mobile.png", fullPage: false });

  // Botão Entrar → /entrar
  const enter = page.getByRole("button", { name: /entrar/i }).first();
  if (await enter.isVisible().catch(() => false)) {
    await enter.click();
    await page.waitForTimeout(1200);
    results.entrarUrl = page.url();
    results.loginFormVisible = await page.locator("input").first().isVisible().catch(() => false);
  }

  return results;
}
