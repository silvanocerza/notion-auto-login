import "dotenv/config";
import UserAgent from "user-agents";
import { chromium, Page } from "playwright";
import { TOTP } from "totp-generator";
import { mkdirSync, writeFileSync } from "node:fs";

async function main() {
  if (!process.env.GOOGLE_MAIL) {
    throw Error("GOOGLE_MAIL env var not set");
  }
  if (!process.env.GOOGLE_PASSWORD) {
    throw Error("GOOGLE_PASSWORD env var not set");
  }
  if (!process.env.GOOGLE_TOTP_SECRET && !process.env.GOOGLE_TOTP) {
    throw Error("GOOGLE_TOTP_SECRET and GOOGLE_TOTP env vars are both unset");
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

  const members = await getMembers(page);
  mkdirSync("data/screenshots", { recursive: true });
  writeFileSync("data/data.json", JSON.stringify(members));

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

  let otp = "";
  if (process.env.GOOGLE_TOTP) {
    // If the TOTP is set explicitly use that
    otp = process.env.GOOGLE_TOTP;
  } else if (process.env.GOOGLE_TOTP_SECRET) {
    // If the TOTP is not set use the provided TOTP secret to generate it
    const res = TOTP.generate(process.env.GOOGLE_TOTP_SECRET);
    otp = res.otp;
  }
  await page.fill('input[type="tel"]', otp);
  await page.click('button:has-text("Next")');
};

// Wait between 1 and 4 seconds
const waitSomeTime = async (page: Page) => {
  await page.waitForTimeout(Math.floor(Math.random() * 3000) + 1000);
};

const getMembers = async (page: Page) => {
  page.waitForLoadState("domcontentloaded");
  await page.getByText("Settings", { exact: true }).click();

  await page.waitForSelector("#settings-tab-members", {
    state: "visible",
    timeout: 10000,
  });
  await page.click("#settings-tab-members");

  // Just wait for everything to load
  await waitSomeTime(page);
  await page.getByText("Members", { exact: true }).click();

  return extractAllMembers(page);
};

async function extractVisibleMembers(page: Page) {
  const memberRows = page.locator(
    '[style*="position: absolute"][style*="transform: translateY"]',
  );

  return await memberRows.evaluateAll((rows) => {
    return rows
      .map((row) => {
        const nameDiv = row.querySelector(
          'div[title][style*="font-weight: 510"]',
        );
        const name =
          nameDiv?.getAttribute("title") || nameDiv?.textContent?.trim();

        const emailDiv = row.querySelector(
          'div[title][style*="color: rgb(115, 114, 110)"]',
        );
        const email =
          emailDiv?.getAttribute("title") || emailDiv?.textContent?.trim();

        const role = row.querySelector("span.notranslate")?.textContent?.trim();

        return {
          name,
          email,
          role,
        };
      })
      .filter((member) => member.name);
  });
}

async function extractAllMembers(page: Page) {
  const members = [];
  const seenEmails = new Set();
  const virtualContainer = page.locator(
    '[style*="flex: 1 1 0px; overflow: hidden auto"]',
  );

  let isAtBottom = false;
  let index = 1;
  while (!isAtBottom) {
    // Extract current batch using your existing function
    const currentMembers = await extractVisibleMembers(page);

    // We wait for the UI to be fully loaded before taking a screenshot
    // otherwise some user data might not load in time
    await waitSomeTime(page);

    virtualContainer.screenshot({
      path: `data/screenshots/members_${index}.png`,
    });

    // Add new unique members
    for (const member of currentMembers) {
      if (member.email && !seenEmails.has(member.email)) {
        seenEmails.add(member.email);
        members.push(member);
      }
    }

    // Check if at bottom and scroll
    isAtBottom = await virtualContainer.evaluate((el) => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
      if (!atBottom) el.scrollTop += 500;
      return atBottom;
    });
    await page.waitForTimeout(300);
    index += 1;
  }

  return members;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
