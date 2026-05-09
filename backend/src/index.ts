import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import mongoose from 'mongoose';
import healthRoutes from './routes/health.route.js';
import chatRoutes from './routes/chat.route.js';
import authRoutes from './routes/auth.js';
import './services/queue/queue.service.js'; // Starts the BullMQ worker on boot

const app = express();

// Request Logger (IST Time)
app.use((req, _, next) => {
  const info =
    req.method +
    " " +
    req.url +
    "   " +
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  console.log("API HIT -------------->", info, "\n|\nv\n|\nv\n");
  next();
});

// Database Connection
mongoose.connect(config.MONGODB_URI)
  .then(() => logger.info('Connected to MongoDB local'))
  .catch((err) => logger.error('MongoDB connection error:', err));

// Middleware
app.use(cors()); // Enable CORS for all origins
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/chat', chatRoutes);
app.use('/auth', authRoutes);

// Start Server
const server = app.listen(config.PORT, () => {
  logger.info(`Server running on port ${config.PORT}`);
});

// Set connection persistence timeout (120 seconds) for large file transfers
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
