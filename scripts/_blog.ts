import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 1300 } });
await p.goto("http://localhost:3000/blog", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: "test-results/blog.png", fullPage: true });
await b.close();
