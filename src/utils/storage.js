// 频道状态持久化
const CHANNEL_STORAGE_KEY = 'private_channel_1201';
const KEY_FOUND_KEY = '1201_key_found';
const DIALOGUE_STORAGE_KEY = '1201_dialogue_state';

// 初始化频道状态
const initializeChannelState = () => {
  const existing = localStorage.getItem(CHANNEL_STORAGE_KEY);
  if (!existing) {
    const initialState = {
      channelId: '1201',
      remainCount: 12,
      closed: false,
      endingTriggered: false,
      messages: []
    };
    localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(initialState));
    return initialState;
  }
  return JSON.parse(existing);
};

export const storage = {
  // 获取完整频道状态
  getChannelState: () => {
    const existing = localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (!existing) {
      return initializeChannelState();
    }
    return JSON.parse(existing);
  },

  // 保存完整频道状态
  saveChannelState: (state) => {
    localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(state));
  },

  // 获取频道关闭状态
  isChannelClosed: () => {
    const state = storage.getChannelState();
    return state.closed;
  },

  // 设置频道关闭状态
  setChannelClosed: (closed) => {
    const state = storage.getChannelState();
    state.closed = closed;
    if (closed) {
      state.remainCount = 0;
    }
    storage.saveChannelState(state);
  },

  // 获取剩余次数
  getRemainCount: () => {
    const state = storage.getChannelState();
    return state.remainCount;
  },

  // 设置剩余次数
  setRemainCount: (count) => {
    const state = storage.getChannelState();
    state.remainCount = count;
    storage.saveChannelState(state);
  },

  // 获取聊天记录
  getMessages: () => {
    const state = storage.getChannelState();
    return state.messages || [];
  },

  // 添加消息
  addMessage: (message) => {
    const state = storage.getChannelState();
    state.messages.push(message);
    storage.saveChannelState(state);
  },

  // 获取结局触发状态
  isEndingTriggered: () => {
    const state = storage.getChannelState();
    return state.endingTriggered;
  },

  // 设置结局触发状态
  setEndingTriggered: (triggered) => {
    const state = storage.getChannelState();
    state.endingTriggered = triggered;
    storage.saveChannelState(state);
  },

  // 获取钥匙是否被发现
  isKeyFound: () => {
    return localStorage.getItem(KEY_FOUND_KEY) === 'true';
  },

  // 设置钥匙被发现
  setKeyFound: (found) => {
    localStorage.setItem(KEY_FOUND_KEY, found);
  },

  // 重置所有状态（用于测试）
  resetAll: () => {
    localStorage.removeItem(CHANNEL_STORAGE_KEY);
    localStorage.removeItem(KEY_FOUND_KEY);
  },

  // 重置频道状态（保留钥匙状态）
  resetChannel: () => {
    localStorage.removeItem(CHANNEL_STORAGE_KEY);
  },

  // ===== 对话系统持久化 =====
  // 获取对话状态
  getDialogueState: () => {
    const existing = localStorage.getItem(DIALOGUE_STORAGE_KEY);
    if (!existing) {
      return {
        shownDialogues: [],
        lastDialogue: null,
        clickCount: 0,
        lastClickTime: null
      };
    }
    return JSON.parse(existing);
  },

  // 保存对话状态
  saveDialogueState: (state) => {
    localStorage.setItem(DIALOGUE_STORAGE_KEY, JSON.stringify(state));
  },

  // 添加已显示的对话
  addShownDialogue: (dialogue) => {
    const state = storage.getDialogueState();
    if (!state.shownDialogues.includes(dialogue)) {
      state.shownDialogues.push(dialogue);
    }
    state.lastDialogue = dialogue;
    storage.saveDialogueState(state);
  },

  // 更新点击次数
  updateClickCount: (count) => {
    const state = storage.getDialogueState();
    state.clickCount = count;
    state.lastClickTime = Date.now();
    storage.saveDialogueState(state);
  },

  // 重置对话状态
  resetDialogueState: () => {
    localStorage.removeItem(DIALOGUE_STORAGE_KEY);
  }
};
