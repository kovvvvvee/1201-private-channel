import { useState, useEffect, useRef } from 'react';
import { storage } from '../utils/storage';
import { 
  normalBirthdayDialogues, 
  specialBirthdayDialogues, 
  hiddenBirthdayDialogues, 
  continuousClickEasterEggs 
} from '../data/characterDialogues';
import '../styles/character.css';

const Character = ({ onDialogue }) => {
  const [clickCount, setClickCount] = useState(0);
  const clickTimeoutRef = useRef(null);

  // 加载保存的点击次数
  useEffect(() => {
    const dialogueState = storage.getDialogueState();
    setClickCount(dialogueState.clickCount || 0);
  }, []);

  // 重置连续点击计数（3秒内没有新点击）
  const resetClickCount = () => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = setTimeout(() => {
      setClickCount(0);
      storage.updateClickCount(0);
    }, 3000);
  };

  // 洗牌算法
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // 获取随机对话（根据概率分布）
  const getRandomDialogue = () => {
    const dialogueState = storage.getDialogueState();
    const shownDialogues = dialogueState.shownDialogues || [];
    const lastDialogue = dialogueState.lastDialogue;

    // 检查是否触发连续点击彩蛋
    const easterEggThresholds = Object.keys(continuousClickEasterEggs).map(Number).sort((a, b) => a - b);
    for (const threshold of easterEggThresholds) {
      if (clickCount === threshold) {
        return continuousClickEasterEggs[threshold];
      }
    }

    // 获取未显示的对话
    const allDialogues = [
      ...normalBirthdayDialogues,
      ...specialBirthdayDialogues,
      ...hiddenBirthdayDialogues
    ];
    const availableDialogues = allDialogues.filter(d => !shownDialogues.includes(d));

    // 如果所有对话都已显示，重置已显示列表
    let dialoguesToUse = availableDialogues;
    if (availableDialogues.length === 0) {
      dialoguesToUse = allDialogues;
    }

    // 过滤掉上一句对话，避免连续重复
    const filteredDialogues = dialoguesToUse.filter(d => d !== lastDialogue);
    const finalPool = filteredDialogues.length > 0 ? filteredDialogues : dialoguesToUse;

    // 根据概率分布选择对话池
    const random = Math.random() * 100;
    let selectedPool = normalBirthdayDialogues;
    let poolType = 'normal';

    if (random < 2) {
      // 2% 隐藏对话
      selectedPool = hiddenBirthdayDialogues;
      poolType = 'hidden';
    } else if (random < 20) {
      // 18% 特殊对话
      selectedPool = specialBirthdayDialogues;
      poolType = 'special';
    }

    // 从选定的池中过滤可用对话
    const poolAvailable = selectedPool.filter(d => 
      !shownDialogues.includes(d) && d !== lastDialogue
    );

    let finalDialogues = poolAvailable;
    if (poolAvailable.length === 0) {
      // 如果池中对话都已显示，使用整个池
      finalDialogues = selectedPool.filter(d => d !== lastDialogue);
      if (finalDialogues.length === 0) {
        finalDialogues = selectedPool;
      }
    }

    // 随机选择一句
    const shuffled = shuffleArray(finalDialogues);
    const selectedDialogue = shuffled[0];

    // 保存到已显示列表
    storage.addShownDialogue(selectedDialogue);

    return selectedDialogue;
  };

  const handleClick = () => {
    // 更新连续点击次数
    const newCount = clickCount + 1;
    setClickCount(newCount);
    storage.updateClickCount(newCount);
    resetClickCount();

    // 获取对话
    const dialogue = getRandomDialogue();
    onDialogue(dialogue);
  };

  return (
    <img
      src="/character/xinghui-home.png"
      alt="沈星回"
      className="character"
      onClick={handleClick}
    />
  );
};

export default Character;
