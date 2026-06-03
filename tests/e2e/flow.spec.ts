import { test, expect } from '@playwright/test';

test.describe('World Cup 2026 Prediction App - End to End', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the local server
    await page.goto('/');

    // If the Firebase multiplayer login overlay is showing, click to return to Sandbox
    const disconnectButton = page.locator('button:has-text("Disconnect Firebase & Return to Sandbox")');
    if (await disconnectButton.isVisible()) {
      await disconnectButton.click();
    }

    // Check if the bet resolution summary popup is visible, and dismiss it
    const dismissButton = page.locator('button:has-text("Great, Continue!")');
    try {
      await expect(dismissButton).toBeVisible({ timeout: 2000 });
      await dismissButton.click();
    } catch (e) {
      // No popup was visible, proceed safely
    }
  });

  test('should load the dashboard and verify primary layouts', async ({ page }) => {
    // Assert title or core elements are present
    const mainHeading = page.locator('h1, h2, h3').first();
    await expect(mainHeading).toBeVisible();

    // Verify presence of the navigation tabs (e.g. Match Center, Standings, Leaderboard, Chat, Settings)
    const sidebar = page.locator('aside, nav');
    await expect(sidebar).toBeVisible();
  });

  test('should navigate tabs successfully', async ({ page }) => {
    // Navigate to Standings & Bracket Tab
    const standingsTab = page.locator('button:has-text("Standings & Bracket"), li:has-text("Standings")').first();
    if (await standingsTab.isVisible()) {
      await standingsTab.click();
      await expect(page.locator('text=Standings & Tournament Bracket')).toBeVisible();
    }

    // Navigate to Banter Chat Tab
    const chatTab = page.locator('button:has-text("Banter Chat"), li:has-text("Chat")').first();
    if (await chatTab.isVisible()) {
      await chatTab.click();
      await expect(page.locator('text=League Banter Chat')).toBeVisible();
    }
  });

  test('should toggle national themes from the sidebar', async ({ page }) => {
    // Locate the theme select dropdown in the sidebar
    const themeSelect = page.locator('div:has-text("App Theme") select').first();
    if (await themeSelect.isVisible()) {
      const originalValue = await themeSelect.inputValue();
      
      // Select another theme by index (e.g., France theme at index 4)
      await themeSelect.selectOption({ index: 4 });
      await expect(themeSelect).not.toHaveValue('default-dark');

      // Revert back
      await themeSelect.selectOption({ value: originalValue });
    }
  });

  test('should interact with the Banter Chat input', async ({ page }) => {
    // Click on Banter Chat Tab
    const chatTab = page.locator('button:has-text("Banter Chat"), li:has-text("Chat")').first();
    if (await chatTab.isVisible()) {
      await chatTab.click();
      
      // Fill message input and send
      const chatInput = page.locator('input[placeholder="Message the league..."]');
      await chatInput.fill('E2E Test Message!');
      await chatInput.press('Enter');

      // Verify message is added to screen
      await expect(page.locator('text=E2E Test Message!')).toBeVisible();
    }
  });

  test('should restrict bet placement to one per match', async ({ page }) => {
    // 1. Navigate to settings and start the season
    const settingsTab = page.locator('button:has-text("Settings"), li:has-text("Settings")').first();
    await settingsTab.click();
    
    const startButton = page.locator('button:has-text("Start Season & Lock Rules")');
    await expect(startButton).toBeVisible();
    await startButton.click();
    
    const confirmButton = page.locator('button:has-text("Confirm & Lock")');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();
    
    // 2. Navigate back to Match Center
    const matchesTab = page.locator('button:has-text("Match Center"), li:has-text("Matches")').first();
    await matchesTab.click();
    
    // 3. Select Home odds for the first match card
    const homeOddsButton = page.locator('button:has-text("1 (Home)")').first();
    await homeOddsButton.click();
    
    // 4. Input stake amount in the single bet slip
    const stakeInput = page.locator('input[placeholder="Points to wager"]').first();
    await stakeInput.fill('50');
    
    // 5. Confirm prediction
    const confirmPredButton = page.locator('button:has-text("Confirm Prediction")');
    await confirmPredButton.click();
    
    // Verify that the bet slip closes (Confirm Prediction button disappears)
    await expect(confirmPredButton).not.toBeVisible();

    // Log diagnostics
    const savedBets = await page.evaluate(() => localStorage.getItem('wc_single_bets'));
    console.log("localStorage wc_single_bets:", savedBets);
    const activeUser = await page.evaluate(() => localStorage.getItem('wc_current_user'));
    console.log("localStorage wc_current_user:", activeUser);

    // 6. Try placing another bet on the same match (Draw outcome)
    const drawOddsButton = page.locator('button:has-text("X (Draw)")').first();
    await drawOddsButton.click();
    
    // Log the input value to see if it is visible
    const isSlipVisible = await confirmPredButton.isVisible();
    console.log("Is slip visible after clicking Draw odds?", isSlipVisible);

    // Attempt to place second bet and wait for the alert dialog
    const [dialog] = await Promise.all([
      page.waitForEvent('dialog'),
      confirmPredButton.click()
    ]);
    
    const alertMessage = dialog.message();
    console.log("DIALOG TRIGGERED:", alertMessage);
    await dialog.dismiss();
    
    // Verify that the dialog message is correct
    expect(alertMessage).toContain('Only 1 bet per game is allowed');
  });

  test('should allow setting winner prediction and verify it updates', async ({ page }) => {
    // Locate the select element in the WinnerPredictionWidget
    const select = page.locator('select:has(option:has-text("Select a team..."))').first();
    const isSelectVisible = await select.isVisible();
    console.log("Is select visible?", isSelectVisible);

    if (isSelectVisible) {
      const options = await select.evaluate((el: HTMLSelectElement) => Array.from(el.options).map(o => o.label));
      console.log("SELECT OPTIONS FOUND:", options);

      // Select Argentina as winner prediction and wait for success alert
      const [dialog] = await Promise.all([
        page.waitForEvent('dialog'),
        select.selectOption({ label: 'Argentina' })
      ]);

      console.log("PREDICTION DIALOG:", dialog.message());
      expect(dialog.message()).toContain('Successfully predicted Argentina');
      await dialog.dismiss();

      // Verify that selection changed in display
      await expect(select).toHaveValue('Argentina');
    }
  });
});
