import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { audioControl } from '../utils/audioControl';
import '../styles/keyEasterEgg.css';

const KeyEasterEgg = () => {
  const [isBlinking, setIsBlinking] = useState(false);

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

  const handleClick = () => {
    audioControl.playBirthday();
    storage.setKeyFound(true);
  };

  return (
    <div
      className={`hidden-key ${isBlinking ? 'blinking' : ''}`}
      onClick={handleClick}
    >
      <img src="/icons/key.png" alt="钥匙" />
    </div>
  );
};

export default KeyEasterEgg;