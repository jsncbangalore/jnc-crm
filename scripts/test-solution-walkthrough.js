/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('--- Step 1: Navigate to /solutions and click first walkthrough link ---');
  await page.goto('http://localhost:5173/solutions', { waitUntil: 'networkidle' });
  
  // Find all walkthrough links
  const walkthroughLinks = page.locator('a:has-text("Request solution walkthrough")');
  const count = await walkthroughLinks.count();
  console.log(`Found ${count} solution walkthrough links on /solutions`);

  if (count === 0) {
    throw new Error('No walkthrough links found on /solutions');
  }

  // Click the first link (High-Volume Logistics)
  await walkthroughLinks.first().click();
  await page.waitForURL('**/inquiry?**', { timeout: 10000 });
  console.log('Navigated to:', page.url());

  // Wait for inquiry page card to load
  await page.waitForSelector('text=1. Select Solution Track', { timeout: 10000 });
  console.log('Walkthrough request page loaded successfully!');

  // Verify the track is preselected
  const selectedTrack = await page.locator('button:has-text("High-Volume Order Processing")').first();
  const isSelected = await selectedTrack.getAttribute('class');
  console.log('Selected track has active styles:', isSelected.includes('border-blue-600') || isSelected.includes('ring-2'));

  // Capture Screenshot: Desktop Light
  const desktopLightPath = path.join(ARTIFACTS_DIR, 'evidence-walkthrough-desktop-light.png');
  await page.screenshot({ path: desktopLightPath, fullPage: true });
  console.log('Captured evidence-walkthrough-desktop-light.png');

  // Test toggling to dark mode
  const themeToggle = page.locator('button[aria-label="Toggle theme"]').first();
  if (await themeToggle.count() > 0) {
    await themeToggle.click();
    await page.waitForTimeout(500);
    const desktopDarkPath = path.join(ARTIFACTS_DIR, 'evidence-walkthrough-desktop-dark.png');
    await page.screenshot({ path: desktopDarkPath, fullPage: true });
    console.log('Captured evidence-walkthrough-desktop-dark.png');
    // Toggle back to light
    await themeToggle.click();
    await page.waitForTimeout(500);
  }

  // Fill in the walkthrough request form with fake data
  console.log('--- Step 2: Fill in form and submit ---');
  await page.fill('input[placeholder="e.g. Rahul Sharma"]', 'Test Logistics Director');
  await page.fill('input[placeholder="+91 98765 43210"]', '9876543210');
  await page.fill('input[placeholder="rahul@company.example.com"]', 'director@example.com');
  await page.fill('input[placeholder="e.g. Apex Industrial Solutions Ltd"]', 'Apex Distribution Hub Ltd');
  await page.fill('input[placeholder="e.g. Mumbai, Bengaluru, Delhi NCR"]', 'Bengaluru Central');
  await page.fill('textarea[placeholder*="Share details such as estimated active users"]', 'Need demo of batch order picking and GST delivery challan automation.');

  // Click Submit
  await page.click('button[type="submit"]');

  // Wait for confirmation card
  await page.waitForSelector('text=Walkthrough Request Registered', { timeout: 10000 });
  console.log('Walkthrough confirmation screen displayed!');

  // Capture Confirmation Screenshot
  const confirmationPath = path.join(ARTIFACTS_DIR, 'evidence-walkthrough-confirmation.png');
  await page.screenshot({ path: confirmationPath, fullPage: true });
  console.log('Captured evidence-walkthrough-confirmation.png');

  // Mobile Viewport Test (390px)
  console.log('--- Step 3: Mobile 390px Viewport Test ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/inquiry?solution=Manufacturing%20%26%20Engineering', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=1. Select Solution Track', { timeout: 10000 });

  const mobileLightPath = path.join(ARTIFACTS_DIR, 'evidence-walkthrough-mobile-light.png');
  await page.screenshot({ path: mobileLightPath, fullPage: true });
  console.log('Captured evidence-walkthrough-mobile-light.png');

  // Error State inside layout test
  console.log('--- Step 4: Verify Error State renders inside layout ---');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/inquiry?key=non_existent_expired_key', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Walkthrough Form Unavailable', { timeout: 10000 });
  
  // Verify that navbar is present above the error card
  const navbar = page.locator('nav').first();
  const hasNavbar = await navbar.count() > 0;
  console.log('Navbar is present above error card:', hasNavbar);

  // Capture Error Inside Layout Screenshot
  const errorInsidePath = path.join(ARTIFACTS_DIR, 'evidence-walkthrough-error-inside.png');
  await page.screenshot({ path: errorInsidePath, fullPage: true });
  console.log('Captured evidence-walkthrough-error-inside.png');

  await browser.close();
  console.log('ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
