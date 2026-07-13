import { useState, useEffect } from 'react';
import '../styles/launch.css';

const LaunchAnimation = ({ onComplete }) => {
  const [currentText, setCurrentText] = useState('');
  const [showIcon, setShowIcon] = useState(true);
  const [textVisible, setTextVisible] = useState(false);

  const messages = [
    "私人频道连接中...",
    "频道编号:1201",
    "今日权限已开启",
    "连接对象：沈星回"
  ];

  const handleStart = () => {
    setShowIcon(false);
    let index = 0;

    const showNextMessage = () => {
      if (index < messages.length) {
        setCurrentText(messages[index]);
        setTextVisible(true);

        setTimeout(() => {
          setTextVisible(false);
          setTimeout(() => {
            index++;
            showNextMessage();
          }, 500);
        }, 1500);
      } else {
        setTimeout(() => {
          onComplete();
        }, 500);
      }
    };

    showNextMessage();
  };

  return (
    <div className="launch-screen">
      {showIcon && (
        <img
          src="/icons/xinghui-start.png"
          alt="Start"
          className="start-icon"
          onClick={handleStart}
        />
      )}
      {!showIcon && (
        <div className={`launch-text ${textVisible ? 'visible' : ''}`}>
          {currentText}
        </div>
      )}
    </div>
  );
};

export default LaunchAnimation;
