import puppeteer, { Browser, Page } from 'puppeteer';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class BrowserService {
  private static instance: BrowserService;
  private browser: Browser | null = null;

  private constructor() {}

  public static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  /**
   * Launch browser with persistent session
   * userDataDir is used to save cookies, local storage, and session data
   */
  public async launch(headless: boolean = false): Promise<Browser> {
    // Check if browser exists and is still connected
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    // If browser is disconnected or null, re-launch
    if (this.browser) {
      logger.warn('Browser disconnected, re-launching...');
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore close errors
      }
      this.browser = null;
    }

    logger.info('Launching Puppeteer browser...');

    this.browser = await puppeteer.launch({
      headless,
      userDataDir: config.SESSION_DIR, // Persistence: saves session locally
      protocolTimeout: 600000, // 10 minutes timeout for heavy processing
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled', // Helps avoid bot detection
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      defaultViewport: null
    });

    logger.info('Browser launched successfully');
    
    // Grant clipboard permissions for reliable data extraction
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions('https://claude.ai', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

    return this.browser;
  }

  public async getNewPage(): Promise<Page> {
    const browser = await this.launch();
    return await browser.newPage();
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }
}

export const browserService = BrowserService.getInstance();
