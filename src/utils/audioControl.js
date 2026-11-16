// 音频播放控制
let birthdayAudio = null;

export const audioControl = {
  // 预加载生日快乐语音（不播放）
  preloadBirthday: () => {
    if (!birthdayAudio) {
      birthdayAudio = new Audio('/audio/birthday.mp3');
      birthdayAudio.preload = 'auto';
    }
    return birthdayAudio;
  },

  // 播放生日快乐语音（复用预加载实例）
  playBirthday: () => {
    const audio = birthdayAudio || new Audio('/audio/birthday.mp3');
    audio.currentTime = 0;
    audio.play().catch(error => {
      console.error('Audio play failed:', error);
    });
    if (!birthdayAudio) birthdayAudio = audio;
    return audio;
  },

  // 播放指定音频（不复用）
  play: (src) => {
    const audio = new Audio(src);
    audio.play().catch(error => {
      console.error('Audio play failed:', error);
    });
    return audio;
  }
};
