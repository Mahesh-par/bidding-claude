/**
 * Helper to get current time in Indian Standard Time (IST)
 */
const getISTTime = () => {
  const now = new Date();
  return now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${getISTTime()}: ${message}`, ...args);
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${getISTTime()}: ${message}`, error || '');
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${getISTTime()}: ${message}`, ...args);
  }
};
