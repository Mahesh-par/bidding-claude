import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { ChatHistory } from '../models/ChatHistory.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import chatQueue, { getJobStatus } from '../services/queue/queue.service.js';

/**
 * POST /chat/new
 * Adds a job to the BullMQ queue instead of processing directly.
 * Returns a jobId for the frontend to poll.
 */
export const createNewChat = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    const attachments = req.files as Express.Multer.File[];

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }

    const userId = (req as AuthRequest).user._id.toString();

    logger.info(`[Controller] Queuing chat job. Prompt length: ${prompt.length}, Files: ${attachments?.length || 0}`);

    // Serialize attachment info (paths on disk) so the worker can use them
    const attachmentPaths = (attachments || []).map(f => ({
      originalname: f.originalname,
      path: f.path,
      size: f.size,
    }));

    // Add job to the queue
    const job = await chatQueue.add('claude-chat', {
      prompt,
      attachmentPaths,
      userId,
    });

    logger.info(`[Controller] Job queued with ID: ${job.id}`);

    res.status(202).json({
      success: true,
      message: 'Job queued successfully',
      jobId: job.id,
    });

  } catch (error: any) {
    logger.error('Controller error in createNewChat', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue chat',
      error: error.message
    });
  }
};

/**
 * GET /chat/status/:jobId
 * Frontend polls this to check if a queued job is done.
 */
export const getJobStatusController = async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const status = await getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.status(200).json({
      success: true,
      ...status,
    });
  } catch (error: any) {
    logger.error('Error in getJobStatus', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job status'
    });
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user._id;
    
    const history = await ChatHistory.find({ user: userId })
      .sort({ createdAt: -1 })
      .select('prompt response projectName chatUrl createdAt');

    const formattedHistory = history.map(item => ({
      id: item._id,
      projectName: item.projectName,
      chatUrl: item.chatUrl,
      inputTime: item.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      input: item.prompt,
      output: item.response
    }));

    res.status(200).json({
      success: true,
      count: history.length,
      history: formattedHistory
    });
  } catch (error: any) {
    logger.error('Error in getChatHistory', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history'
    });
  }
};

export const deleteChatHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as AuthRequest).user._id;

    const result = await ChatHistory.findOneAndDelete({ _id: id, user: userId });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Chat history not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Chat history deleted successfully'
    });
  } catch (error: any) {
    logger.error('Error in deleteChatHistory', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete chat history'
    });
  }
};
