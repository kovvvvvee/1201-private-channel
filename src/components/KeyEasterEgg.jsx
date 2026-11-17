import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { audioControl } from '../utils/audioControl';
import '../styles/keyEasterEgg.css';

const KeyEasterEgg = () => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    // 首次进入时闪烁3次
    if (!storage.isKeyFound()) {
      setIsBlinking(true);
      const timer = setTimeout(() => {
        setIsBlinking(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    // 预热音频并监听就绪状态
    audioControl.preloadBirthday().then(() => {
      setAudioReady(true);
    }).catch(() => {
      // 预热失败也视为就绪（可以点击后直接播放）
      setAudioReady(true);
    });
  }, []);

  const handleClick = () => {
    audioControl.playBirthday();
    storage.setKeyFound(true);
  };

  return (
    <div
      className={`hidden-key ${isBlinking ? 'blinking' : ''} ${audioReady ? 'audio-ready' : ''}`}
      onClick={handleClick}
    >
      <img src="/icons/key.webp" alt="钥匙" />
      {audioReady && <div className="audio-ready-indicator" />}
    </div>
  );
};

export default KeyEasterEgg;