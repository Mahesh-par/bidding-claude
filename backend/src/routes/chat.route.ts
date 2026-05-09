import { Router } from 'express';
import multer from 'multer';
import { createNewChat, getChatHistory, deleteChatHistory, getJobStatusController } from '../controllers/chat.controller.js';
import { authentication } from '../middleware/auth.middleware.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage });
/**
 * POST /chat/new
 * payload: { prompt: string, attachments: File[] }
 */
router.post('/new', authentication, upload.array('attachments'), createNewChat);
router.get('/status/:jobId', authentication, getJobStatusController);
router.get('/history', authentication, getChatHistory);
router.delete('/history/:id', authentication, deleteChatHistory);

export default router;
