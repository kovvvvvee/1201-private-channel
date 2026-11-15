import { useState, useEffect, useRef } from 'react';
import '../styles/launch.css';

const LaunchAnimation = ({ onComplete }) => {
  const [currentText, setCurrentText] = useState('');
  const [showIcon, setShowIcon] = useState(true);
  const [textVisible, setTextVisible] = useState(false);
  const timerRef = useRef(null);
  const indexRef = useRef(0);
  const hasCompletedRef = useRef(false);

  const messages = [
    "私人频道连接中...",
    "频道编号:1201",
    "今日权限已开启",
    "连接对象：沈星回"
  ];

  const clearAllTimers = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const showNextMessage = () => {
    if (hasCompletedRef.current) return;

    if (indexRef.current < messages.length) {
      setCurrentText(messages[indexRef.current]);
      setTextVisible(true);

      timerRef.current = setTimeout(() => {
        setTextVisible(false);
        timerRef.current = setTimeout(() => {
          indexRef.current++;
          showNextMessage();
        }, 500);
      }, 1500);
    } else {
      timerRef.current = setTimeout(() => {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete();
        }
      }, 500);
    }
  };

  const handleStart = () => {
    clearAllTimers();
    setShowIcon(false);
    indexRef.current = 0;
    hasCompletedRef.current = false;
    showNextMessage();
  };

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

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
