// 音频播放控制
export const audioControl = {
  // 播放生日快乐语音
  playBirthday: () => {
    const audio = new Audio('/audio/birthday.mp3');
    audio.play().catch(error => {
      console.error('Audio play failed:', error);
    });
    return audio;
  },

  // 播放指定音频
  play: (src) => {
    const audio = new Audio(src);
    audio.play().catch(error => {
      console.error('Audio play failed:', error);
    });
    return audio;
  }
};
