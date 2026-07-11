import { useState } from 'react';
import { storage } from '../utils/storage';
import Character from '../components/Character';
import BottomNav from '../components/BottomNav';
import KeyEasterEgg from '../components/KeyEasterEgg';
import '../styles/home.css';
import '../styles/character.css';
import '../styles/bottomNav.css';

const Home = ({ onNavigate }) => {
  const [dialogue, setDialogue] = useState('');
  const [showDialogue, setShowDialogue] = useState(false);

  const handleDialogue = (text) => {
    setDialogue(text);
    setShowDialogue(true);
    setTimeout(() => {
      setShowDialogue(false);
    }, 5000);
  };

  const handleNavigate = (page) => {
    // 检查频道关闭状态
    if (page === 'chat' && storage.isChannelClosed()) {
      // 不允许进入聊天页面，显示提示
      alert('📡 频道已关闭');
      return;
    }
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
