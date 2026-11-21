import { chatReplies, endingMessages } from '../data/chatReplies';

// 聊天逻辑管理
export const chatLogic = {
  // 初始次数
  INITIAL_COUNT: 12,

  // 生成AI回复
  generateResponse: (currentCount, endingTriggered = false) => {
    const baseIndex = Math.min(12 - currentCount - 1, chatReplies.length - 1);
    return [...chatReplies[baseIndex]];
  },

  // 检查是否应该触发结局
  shouldTriggerEnding: (currentCount, endingTriggered = false) => {
    // 如果结局已经触发过，不再触发
    if (endingTriggered) {
      return false;
    }
    return currentCount === 0;
  },

  // 获取结局消息
  getEndingMessages: () => {
    return endingMessages;
  },

  // 拆分多句回复为多个气泡
  splitMessages: (messages) => {
    return messages;
  }
};
