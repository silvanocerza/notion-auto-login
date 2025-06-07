import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: false }); // Set headless to true for background execution
  const page = await browser.newPage();
  await page.goto("https://notion.com");
  console.log(await page.title());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
