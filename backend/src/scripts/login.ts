import { browserService } from '../services/browser/browser.service.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

async function login() {
  try {
    logger.info('Starting manual login flow...');
    
    // Launch browser in non-headless mode for manual login
    const browser = await browserService.launch(false);
    
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    if (!page) throw new Error('Could not open page');

    logger.info(`Navigating to ${config.CLAUDE_URL}`);
    await page.goto(config.CLAUDE_URL, { waitUntil: 'networkidle2' });

    console.log('\n==================================================');
    console.log('ACTION REQUIRED:');
    console.log('1. Please login to Claude using your Google account.');
    console.log('2. Your session will be saved automatically.');
    console.log('3. Close the browser manually after login is complete.');
    console.log('==================================================\n');

    // Keep the script running until the browser is closed manually
    browser.on('disconnected', () => {
      logger.info('Browser disconnected. Session saved.');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start login flow', error);
    process.exit(1);
  }
}

login();
