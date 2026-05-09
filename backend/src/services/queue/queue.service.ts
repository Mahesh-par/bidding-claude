import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config/env.js';
import { chatService } from '../chat/chat.service.js';
import { ChatHistory } from '../../models/ChatHistory.js';
import { logger } from '../../utils/logger.js';

// Redis connection shared across queue and worker
const connection = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('connect', () => logger.info('Redis connected for BullMQ'));
connection.on('error', (err) => logger.error('Redis connection error:', err));

// Job data shape
export interface ChatJobData {
  prompt: string;
  attachmentPaths: { originalname: string; path: string; size: number }[];
  userId: string;
}

// Job result shape
export interface ChatJobResult {
  success: boolean;
  message: string;
  projectName: string;
  chatUrl: string;
  response: string;
}

// ── Queue ──
const QUEUE_NAME = 'claude-automation';

export const chatQueue = new Queue<ChatJobData, ChatJobResult>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { age: 3600 },   // Keep completed jobs for 1 hour
    removeOnFail: { age: 86400 },       // Keep failed jobs for 24 hours
  },
});

// ── Worker (concurrency: 1 = one job at a time) ──
const worker = new Worker<ChatJobData, ChatJobResult>(
  QUEUE_NAME,
  async (job: Job<ChatJobData, ChatJobResult>) => {
    logger.info(`[Queue] Processing job ${job.id} — prompt: "${job.data.prompt.substring(0, 50)}..."`);

    // Reconstruct multer-like file objects for chatService
    const fakeFiles = job.data.attachmentPaths.map((f) => ({
      originalname: f.originalname,
      path: f.path,
      size: f.size,
    })) as Express.Multer.File[];

    // Progress callback: reports partial text to BullMQ for live streaming
    const onProgress = (partialText: string) => {
      job.updateProgress({ partialText });
    };

    const result = await chatService.sendNewChat(job.data.prompt, fakeFiles, onProgress);

    // Save to history inside the worker (since the controller no longer waits)
    try {
      await ChatHistory.create({
        user: job.data.userId,
        prompt: job.data.prompt,
        response: result.response,
        projectName: result.projectName,
        chatUrl: result.chatUrl,
        attachments: job.data.attachmentPaths.map((f) => ({
          filename: f.originalname,
          path: f.path,
          size: f.size,
        })),
      });
      logger.info(`[Queue] Job ${job.id} saved to history`);
    } catch (dbError) {
      logger.error(`[Queue] Failed to save job ${job.id} to history`, dbError);
    }

    return result;
  },
  {
    connection,
    concurrency: 1, // ← Only one job at a time
    limiter: {
      max: 1,
      duration: 1000,
    },
  },
);

// Worker event listeners
worker.on('completed', (job) => {
  logger.info(`[Queue] Job ${job?.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  logger.error(`[Queue] Job ${job?.id} failed: ${err.message}`);
});

worker.on('active', (job) => {
  logger.info(`[Queue] Job ${job.id} is now active`);
});

// ── Helper to get job status for polling ──
export const getJobStatus = async (jobId: string) => {
  const job = await chatQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const waitingCount = await chatQueue.getWaitingCount();

  // Extract partial text from progress (BullMQ stores it as object or number)
  const progress = job.progress as { partialText?: string } | number;
  const partialText = typeof progress === 'object' ? progress?.partialText || null : null;

  return {
    jobId: job.id,
    state,                       // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
    partialText,                 // Live partial response while generating
    queuePosition: state === 'waiting' ? waitingCount : 0,
    result: state === 'completed' ? job.returnvalue : null,
    error: state === 'failed' ? job.failedReason : null,
  };
};

export default chatQueue;
