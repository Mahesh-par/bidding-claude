import { browserService } from "../browser/browser.service.js";
import { logger } from "../../utils/logger.js";
import { Page } from "puppeteer";
import path from "path";
import fs from "fs";

export class ChatService {
  /**
   * Send a new message with optional attachments to Claude
   */
  public async sendNewChat(
    prompt: string,
    attachments: Express.Multer.File[] = [],
    onProgress?: (partialText: string) => void,
  ) {
    const browser = await browserService.launch(false);

    // Reuse existing page if available to prevent tab accumulation
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    try {
      const url =
        "https://claude.ai/project/019df89e-e7c9-75f8-8ec9-d288f0f3396f";
      logger.info(`Navigating to Claude Chat: ${url}`);
      await page.goto(url, { waitUntil: "networkidle2" });

      // Handle attachments if any
      if (attachments.length > 0) {
        logger.info(`Uploading ${attachments.length} attachments...`);
        const filePaths = attachments.map((file) => path.resolve(file.path));

        // Find file input and upload
        const fileInput = await page.waitForSelector('input[type="file"]', {
          timeout: 10000,
        });
        if (fileInput) {
          await fileInput.uploadFile(...filePaths);
          logger.info("Files uploaded successfully.");
          // Wait for Claude to process files (progress bars to finish)
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      // Paste the prompt with retry logic
      logger.info("Pasting prompt...");
      await this.pastePromptWithRetry(page, prompt);

      // Click Send Button with retry verification
      logger.info("Clicking send...");
      await this.clickSendWithRetry(page);

      // Wait for response to finish (with live progress reporting)
      await this.waitForResponse(page, onProgress);

      // Extract Project Name / Chat Title and Current URL
      logger.info("Extracting project name and URL...");
      const chatUrl = page.url();
      const projectName = await page.evaluate(() => {
        // Look for the bold title in the top bar breadcrumbs
        const titleEl = document.querySelector(
          "header .font-base-bold, [data-testid='chat-title']",
        );
        return titleEl
          ? (titleEl as HTMLElement).innerText.trim()
          : "Unknown Project";
      });

      // Extract clipboard content
      logger.info("Extracting clipboard content...");
      const clipboardContent = await this.copyLastMessage(page);

      return {
        success: true,
        message: "Chat finished successfully",
        projectName,
        chatUrl,
        response: clipboardContent,
      };
    } catch (error) {
      logger.error("Error in sendNewChat", error);
      // Take error screenshot
      try {
        const screenshotDir = path.join(process.cwd(), "error_screenshots");
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

        const now = new Date();
        const timestamp = now
          .toLocaleString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour12: false,
          })
          .replace(/[/]/g, "-")
          .replace(/[:]/g, "-")
          .replace(/[,]/g, "")
          .replace(/[ ]/g, "_");

        const screenshotPath = path.join(
          screenshotDir,
          `error-${timestamp}.png`,
        );
        await page.screenshot({ path: screenshotPath });
        logger.info(`Error screenshot saved to: ${screenshotPath}`);
      } catch (screenshotError) {
        logger.error("Failed to take error screenshot", screenshotError);
      }

      throw error;
    }
  }

  private async waitForResponse(page: Page, onProgress?: (partialText: string) => void): Promise<string> {
    logger.info("Monitoring response state...");

    let stopButtonExisted = false;
    let lastText = "";
    let stableTime = 0;
    const POLLING_INTERVAL = 1500;
    const STABILIZATION_THRESHOLD = 15000;
    const startTime = Date.now();

    while (Date.now() - startTime < 300000) {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));

      // Check for stop button using the exact aria-label from screenshot
      const isGenerating = await page.evaluate(() => {
        const stopButton = document.querySelector(
          'button[aria-label="Stop response"]',
        );
        if (stopButton) {
          const style = window.getComputedStyle(stopButton);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            stopButton.getClientRects().length > 0
          );
        }
        return false;
      });

      if (isGenerating) {
        if (!stopButtonExisted)
          logger.info("Generation in progress (Stop button detected).");
        stopButtonExisted = true;
        stableTime = 0;
      }

      const currentText = await page.evaluate(() => {
        const msgs = document.querySelectorAll(
          '.font-claude-message, [data-testid="message-container"]',
        );
        return msgs.length > 0
          ? (msgs[msgs.length - 1] as HTMLElement).innerText
          : "";
      });

      if (currentText === lastText && lastText !== "") {
        stableTime += POLLING_INTERVAL;
      } else {
        stableTime = 0;
      }
      lastText = currentText;

      // Report partial text to the queue for live streaming
      if (currentText && onProgress) {
        onProgress(currentText);
      }

      // Completion Logic
      if (stopButtonExisted && !isGenerating) {
        logger.info(
          "Generation stopped (Stop button gone). Waiting 2s for UI to settle...",
        );
        await new Promise((r) => setTimeout(r, 2000)); // Buffer for Copy button to appear
        break;
      }

      if (stableTime >= STABILIZATION_THRESHOLD && !isGenerating) {
        logger.info("Response stabilized for 15s.");
        break;
      }

      await new Promise((r) => setTimeout(r, POLLING_INTERVAL));
    }
    return lastText;
  }

  /**
   * Clicks the copy button of the last message and returns clipboard content
   */
  private async copyLastMessage(page: Page): Promise<string> {
    try {
      // 1. Locate the messages with expanded selectors
      const messageSelectors = [
        '[data-testid="message-container"]',
        ".font-claude-message",
        'div[data-is-streaming="false"]',
        "article",
      ].join(", ");

      const messages = await page.$$(messageSelectors);
      logger.info(`Found ${messages.length} message containers.`);

      // 2. Strategy A: Find copy button within the last message
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const copyBtn = await lastMessage.$(
          'button[data-testid="action-bar-copy"], button[aria-label="Copy"]',
        );
        if (copyBtn) {
          logger.info("Found Copy button in last message container.");
          await copyBtn.click();
          const content = await this.readClipboard(page);
          if (content) return content;
        }
      }

      // 3. Strategy B: Global Fallback - Find the last Copy button on the page
      logger.warn("Strategy A failed, trying Strategy B (Global fallback)...");
      const globalCopyButtons = await page.$$(
        'button[data-testid="action-bar-copy"], button[aria-label="Copy"]',
      );
      if (globalCopyButtons.length > 0) {
        logger.info(
          `Found ${globalCopyButtons.length} copy buttons globally. Clicking the last one.`,
        );
        const lastBtn = globalCopyButtons[globalCopyButtons.length - 1];
        await lastBtn.click();
        const content = await this.readClipboard(page);
        if (content) return content;
      }

      // Strategy C: Scrape directly from DOM if clipboard fails
      logger.warn("Clipboard strategy failed or blocked. Falling back to DOM scraping...");
      return await page.evaluate(() => {
        const messageSelectors = [
          '[data-testid="message-container"]',
          ".font-claude-message",
          'div[data-is-streaming="false"]',
          "article"
        ];
        
        const containers = document.querySelectorAll(messageSelectors.join(', '));
        if (containers.length > 0) {
          const lastMsg = containers[containers.length - 1] as HTMLElement;
          // Try to get text but exclude the action bar/buttons
          const textEl = lastMsg.querySelector('.grid-cols-1') || lastMsg;
          return (textEl as HTMLElement).innerText.trim();
        }
        return "FAILED_TO_EXTRACT_CONTENT";
      });
    } catch (error) {
      logger.error("Error in copyLastMessage", error);
      return "ERROR_DURING_EXTRACTION";
    }
  }

  private async readClipboard(page: Page): Promise<string | null> {
    await new Promise((r) => setTimeout(r, 1000));
    return await page.evaluate(async () => {
      try {
        // Must be focused to read clipboard
        window.focus();
        return await navigator.clipboard.readText();
      } catch (err) {
        return null;
      }
    });
  }

  /**
   * Paste prompt with up to 3 retry attempts using different strategies
   */
  private async pastePromptWithRetry(page: Page, prompt: string): Promise<void> {
    const inputSelector = 'div[contenteditable="true"], textarea, [role="textbox"]';
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await page.waitForSelector(inputSelector, { timeout: 10000 });
        await page.click(inputSelector);
        await new Promise((r) => setTimeout(r, 500));

        // Strategy 1: execCommand insertText (works best with React)
        const pasted = await page.evaluate((text) => {
          const input = document.querySelector(
            'div[contenteditable="true"], textarea, [role="textbox"]',
          ) as HTMLElement;
          if (!input) return false;

          input.focus();
          if (input.tagName === "TEXTAREA") {
            (input as HTMLTextAreaElement).value = "";
          } else {
            input.innerHTML = "";
          }

          const success = document.execCommand("insertText", false, text);

          ["input", "change", "blur"].forEach((name) => {
            input.dispatchEvent(new Event(name, { bubbles: true }));
          });

          return success;
        }, prompt);

        // Verify text was actually entered
        const currentText = await page.evaluate(() => {
          const input = document.querySelector(
            'div[contenteditable="true"], textarea, [role="textbox"]',
          ) as HTMLElement;
          if (!input) return "";
          return input.tagName === "TEXTAREA"
            ? (input as HTMLTextAreaElement).value
            : input.innerText;
        });

        if (currentText && currentText.trim().length > 0) {
          logger.info(`Prompt pasted successfully on attempt ${attempt}`);
          return;
        }

        // Strategy 2: Clipboard API paste
        logger.warn(`Attempt ${attempt}: execCommand returned empty. Trying clipboard paste...`);
        await page.evaluate(async (text) => {
          const input = document.querySelector(
            'div[contenteditable="true"], textarea, [role="textbox"]',
          ) as HTMLElement;
          if (!input) return;
          input.focus();
          
          // Write to clipboard then paste
          await navigator.clipboard.writeText(text);
          document.execCommand("paste");
        }, prompt);

        await new Promise((r) => setTimeout(r, 500));

        // Re-verify
        const checkAgain = await page.evaluate(() => {
          const input = document.querySelector(
            'div[contenteditable="true"], textarea, [role="textbox"]',
          ) as HTMLElement;
          if (!input) return "";
          return input.tagName === "TEXTAREA"
            ? (input as HTMLTextAreaElement).value
            : input.innerText;
        });

        if (checkAgain && checkAgain.trim().length > 0) {
          logger.info(`Prompt pasted via clipboard on attempt ${attempt}`);
          return;
        }

        // Strategy 3: Direct keyboard typing (slowest but most reliable)
        logger.warn(`Attempt ${attempt}: Clipboard paste failed. Typing directly...`);
        await page.click(inputSelector, { count: 3 }); // Triple-click to select all
        await page.keyboard.type(prompt, { delay: 5 });

        logger.info(`Prompt typed directly on attempt ${attempt}`);
        return;
      } catch (err) {
        logger.error(`Paste attempt ${attempt} failed:`, err);
        if (attempt === MAX_RETRIES) {
          throw new Error("Failed to paste prompt after all retries");
        }
        // Wait before retry
        await new Promise((r) => setTimeout(r, 2000));
        // Reload the page for a fresh state
        logger.warn("Reloading page for fresh retry...");
        await page.reload({ waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /**
   * Click send with retry and verification that generation started
   */
  private async clickSendWithRetry(page: Page): Promise<void> {
    const sendSelectors = [
      'button[aria-label="Send Message"]',
      'button[aria-label*="Send"]',
      'button.bg-accent',
      'button[data-testid="send-button"]',
    ];
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Try each selector
        let clicked = false;
        for (const selector of sendSelectors) {
          try {
            const btn = await page.$(selector);
            if (btn) {
              // Check if button is enabled
              const isDisabled = await page.evaluate(
                (el) => (el as HTMLButtonElement).disabled,
                btn,
              );
              if (!isDisabled) {
                await btn.click();
                clicked = true;
                logger.info(`Send clicked via: ${selector}`);
                break;
              }
            }
          } catch (_) { /* try next selector */ }
        }

        if (!clicked) {
          // JS fallback: find any button with "Send" text
          clicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll("button");
            for (const btn of buttons) {
              if (
                btn.textContent?.includes("Send") ||
                btn.getAttribute("aria-label")?.includes("Send")
              ) {
                btn.click();
                return true;
              }
            }
            return false;
          });
        }

        if (!clicked) {
          // Last resort: press Enter
          logger.warn(`Attempt ${attempt}: No send button found, pressing Enter...`);
          await page.keyboard.press("Enter");
        }

        // Verify generation started (stop button should appear within 5s)
        await new Promise((r) => setTimeout(r, 2000));
        const generationStarted = await page.evaluate(() => {
          const stopBtn = document.querySelector('button[aria-label="Stop response"]');
          return !!stopBtn;
        });

        if (generationStarted) {
          logger.info(`Send verified: generation started on attempt ${attempt}`);
          return;
        }

        logger.warn(`Attempt ${attempt}: Send didn't trigger generation, retrying...`);
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        logger.error(`Send attempt ${attempt} failed:`, err);
        if (attempt === MAX_RETRIES) {
          throw new Error("Failed to send message after all retries");
        }
      }
    }
  }
}

export const chatService = new ChatService();
