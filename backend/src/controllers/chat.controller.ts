import { Request, Response } from 'express';
import { chatService } from '../services/chat/chat.service.js';
import { logger } from '../utils/logger.js';
import { ChatHistory } from '../models/ChatHistory.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

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

    logger.info(`Received new chat request. Prompt length: ${prompt.length}, Files: ${attachments?.length || 0}`);

    if (attachments && attachments.length > 0) {
      attachments.forEach((file, index) => {
        logger.info(`File ${index + 1}: ${file.originalname} (${file.size} bytes)`);
      });
    }

    const result = await chatService.sendNewChat(prompt, attachments || []);

    // Save to history
    try {
      await ChatHistory.create({
        user: (req as AuthRequest).user._id,
        prompt,
        response: result.response,
        projectName: result.projectName,
        chatUrl: result.chatUrl,
        attachments: attachments?.map(f => ({
          filename: f.originalname,
          path: f.path,
          size: f.size
        }))
      });
      logger.info('Chat saved to history');
    } catch (dbError) {
      logger.error('Failed to save chat to history', dbError);
    }

    res.status(200).json(result);

  } catch (error: any) {
    logger.error('Controller error in createNewChat', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process chat',
      error: error.message
    });
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user._id;
    
    const history = await ChatHistory.find({ user: userId })
      .sort({ createdAt: -1 }) // Newest first
      .select('prompt response projectName chatUrl createdAt');

    // Format the response with India time
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
