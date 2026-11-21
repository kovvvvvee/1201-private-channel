import { useState, useRef, useEffect } from 'react';
import { audioControl } from '../utils/audioControl';
import Character from '../components/Character';
import BottomNav from '../components/BottomNav';
import KeyEasterEgg from '../components/KeyEasterEgg';
import '../styles/home.css';
import '../styles/character.css';
import '../styles/bottomNav.css';

const Home = ({ onNavigate }) => {
  const [dialogue, setDialogue] = useState('');
  const [showDialogue, setShowDialogue] = useState(false);
  const dialogueTimerRef = useRef(null);

  // 预加载 Key 音频（不播放，仅准备资源）
  // 延迟到 window.load 之后，避免与首屏渲染抢跑
  useEffect(() => {
    const preloadAudio = () => {
      audioControl.preloadBirthday();
    };

    if (document.readyState === 'complete') {
      // 页面已加载完成，延迟 500ms 后预热
      setTimeout(preloadAudio, 500);
    } else {
      // 等待 window.load 事件
      window.addEventListener('load', () => {
        setTimeout(preloadAudio, 500);
      }, { once: true });
    }
  }, []);

  const handleDialogue = (text) => {
    setDialogue(text);
    setShowDialogue(true);
    
    // 清除之前的定时器
    if (dialogueTimerRef.current) {
      clearTimeout(dialogueTimerRef.current);
    }
    
    // 设置新的定时器
    dialogueTimerRef.current = setTimeout(() => {
      setShowDialogue(false);
    }, 5000);
  };

  const handleNavigate = (page) => {
    // 频道关闭后仍允许进入聊天页查看历史记录（页面为只读关闭状态）
    onNavigate(page);
  };

  return (
    <div className="home-page">
      <div className="home-background"></div>
      <div className="home-overlay"></div>
      <Character onDialogue={handleDialogue} />
      {showDialogue && (
        <div className={`dialogue-bubble ${showDialogue ? 'visible' : ''}`}>
          {dialogue}
        </div>
      )}
      <KeyEasterEgg />
      <BottomNav onNavigate={handleNavigate} />
    </div>
  );
};

export default Home;
