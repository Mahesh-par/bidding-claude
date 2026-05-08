import mongoose from 'mongoose';

const ChatHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  prompt: {
    type: String,
    required: true,
  },
  response: {
    type: String,
    required: true,
  },
  projectName: {
    type: String,
  },
  chatUrl: {
    type: String,
  },
  attachments: [{
    filename: String,
    path: String,
    size: Number,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

export const ChatHistory = mongoose.model('ChatHistory', ChatHistorySchema);
