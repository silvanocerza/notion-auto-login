import "dotenv/config";
import UserAgent from "user-agents";
import { chromium, Page } from "playwright";
import { TOTP } from "totp-generator";

async function main() {
  if (!process.env.GOOGLE_MAIL) {
    throw Error("GOOGLE_MAIL env var not set");
  }
  if (!process.env.GOOGLE_PASSWORD) {
    throw Error("GOOGLE_PASSWORD env var not set");
  }
  if (!process.env.GOOGLE_TOTP_SECRET) {
    console.warn(
      "GOOGLE_TOTP_SECRET env var not provided, login might fail if TOTP code is required",
    );
  }

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
      "--disable-extensions",
      "--start-maximized",
    ],
  });

  const context = await browser.newContext({
    userAgent: new UserAgent({ deviceCategory: "desktop" }).toString(),
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await page.goto("https://www.notion.so/login");
  const [googleLoginPage] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByText("Continue with Google").click(),
  ]);

  await loginWithGoogle(
    googleLoginPage,
    process.env.GOOGLE_MAIL,
    process.env.GOOGLE_PASSWORD,
  );

  await page.waitForTimeout(20000);
  await browser.close();
}

const loginWithGoogle = async (page: Page, mail: string, password: string) => {
  await page.waitForSelector('input[type="email"]', {
    state: "visible",
    timeout: 10000,
  });

  await waitSomeTime(page);
  await page.fill('input[type="email"]', mail);
  await page.click('button:has-text("Next")');

  await page.waitForSelector('input[type="password"]', {
    state: "visible",
    timeout: 10000,
  });

  await waitSomeTime(page);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Next")');

  // At this point we either logged in or we need to pass 2FA
  await waitSomeTime(page);
  await page.getByText("Try another way").click();

  await page
    .getByText("Get a verification code from the Google Authenticator app")
    .click();

  await page.waitForSelector('input[type="tel"]', {
    state: "visible",
    timeout: 10000,
  });

  if (!process.env.GOOGLE_TOTP_SECRET) {
    throw Error("Totp code is necessary but GOOGLE_TOTP_SECRET is not set");
  }
  const { otp } = TOTP.generate(process.env.GOOGLE_TOTP_SECRET);
  await page.fill('input[type="tel"]', otp);
  await page.click('button:has-text("Next")');
};

// Wait between 1 and 4 seconds, we don't want to interact to fast to avoid being recognized as bots
const waitSomeTime = async (page: Page) => {
  await page.waitForTimeout(Math.floor(Math.random() * 3000) + 1000);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
