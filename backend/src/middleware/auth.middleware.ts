import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

export interface AuthRequest extends Request {
  user?: any;
}

export const authentication = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization) {
    try {
      // Get token directly from header
      token = req.headers.authorization;

      // Verify token
      const decoded: any = jwt.verify(token, config.JWT_SECRET || 'fallback_secret');

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        res.status(401).json({ message: 'Not authorized, user not found' });
        return;
      }

      logger.info(`Authenticated user email: ${req.user.email} (${req.method} ${req.originalUrl})`);

      next();
    } catch (error) {
      console.error('Auth Middleware Error:', error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};
