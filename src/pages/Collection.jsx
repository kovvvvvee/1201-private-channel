import { useState, useEffect, useRef } from 'react';
import '../styles/collection.css';

const Collection = ({ onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [companionText, setCompanionText] = useState('');
  const [commentIndex, setCommentIndex] = useState(0);
  const containerRef = useRef(null);
  const cardRefs = useRef([]);
  const videoRefs = useRef({});
  const isAnimating = useRef(false);
  const currentIndexRef = useRef(0);
  const commentTimerRef = useRef(null);

  const companionMessages = [
    "继续往后看吧。"
  ];

  // ===== 加载照片（每张照片单独配置 chibi + comment） =====
  useEffect(() => {
    const loadedPhotos = [
      // 1: 实况
      {
        photo: '/photos/live/photo1.jpg',
        video: '/photos/live/photo1.MOV',
        isLive: true,
        chibi: '/chibi/Q02.png',
        comment: '你每次这样看过来的时候，都很难让我移开视线。'
      },
      // 2: 普通
      {
        photo: '/photos/photo2.jpg',
        isLive: false,
        chibi: '/chibi/Q04.png',
        comment: '已收藏'
      },
      // 3: 普通
      {
        photo: '/photos/photo3.jpg',
        isLive: false,
        chibi: '/chibi/Q02.png',
        comment: '这张拍糊了。不过好像刚好把那天的风留下来了'
      },
      // 4: 普通
      {
        photo: '/photos/photo4.jpg',
        isLive: false,
        chibi: '/chibi/Q04.png',
        comment: '装备检查完成。看起来已经准备好出来了。'
      },
      // 5: 实况 ← 多句评论（数组）
      {
        photo: '/photos/live/photo5.jpg',
        video: '/photos/live/photo5.MOV',
        isLive: true,
        chibi: '/chibi/Q03.png',
        comment: '离得太近了。这是准备突然袭击吗？'
      },
      // 6: 实况← 多句评论（数组）
      {
        photo: '/photos/live/photo6.jpg',
        video: '/photos/live/photo6.MOV',
        isLive: true,
        chibi: '/chibi/Q01.png',
        comment: ['我看到了' , '全都看到了']
      },
      // 7: 实况
      {
        photo: '/photos/live/photo7.jpg',
        video: '/photos/live/photo7.MOV',
        isLive: true,
        chibi: '/chibi/Q04.png',
        comment: '晚上的风有点凉。'
      },
      // 8: 普通
      {
        photo: '/photos/photo8.jpg',
        isLive: false,
        chibi: '/chibi/Q03.png',
        comment: '喜欢这一张。'
      },
      // 9: 普通
      {
        photo: '/photos/photo9.jpg',
        isLive: false,
        chibi: '/chibi/Q01.png',
        comment: '我保存下来了。'
      }
    ];

    setPhotos(loadedPhotos);
    const randomCompanion = companionMessages[Math.floor(Math.random() * companionMessages.length)];
    setCompanionText(randomCompanion);
  }, []);

  // ===== 处理多句评论定时器 =====
  useEffect(() => {
    if (commentTimerRef.current) {
      clearTimeout(commentTimerRef.current);
      commentTimerRef.current = null;
    }

    setCommentIndex(0);

    const currentPhoto = photos[currentIndex];
    if (!currentPhoto) return;

    if (Array.isArray(currentPhoto.comment) && currentPhoto.comment.length > 1) {
      const total = currentPhoto.comment.length;
      let idx = 0;
      const showNext = () => {
        idx++;
        if (idx < total) {
          setCommentIndex(idx);
          commentTimerRef.current = setTimeout(showNext, 1000);
        }
      };
      commentTimerRef.current = setTimeout(showNext, 2000);
    }

    return () => {
      if (commentTimerRef.current) {
        clearTimeout(commentTimerRef.current);
        commentTimerRef.current = null;
      }
    };
  }, [currentIndex, photos]);

  // ===== 初始化视频引用和触摸事件 =====
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e) => {
      container._touchStartX = e.touches[0].clientX;
      container._touchStartY = e.touches[0].clientY;
    };
    const handleTouchEnd = (e) => {
      const startX = container._touchStartX || 0;
      const startY = container._touchStartY || 0;
      const diffX = startX - e.changedTouches[0].clientX;
      const diffY = startY - e.changedTouches[0].clientY;
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX > 0) nextCard();
        else prevCard();
      }
    };
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // ===== 初始化第一个视频播放 =====
  useEffect(() => {
    if (photos.length === 0) return;
    currentIndexRef.current = 0;
    setCurrentIndex(0);

    setTimeout(() => {
      const firstVideo = videoRefs.current[0];
      if (firstVideo) {
        firstVideo.load();
        firstVideo.play().catch(() => {});
      }
    }, 500);
  }, [photos]);

  // ===== 切换函数 =====
  const goTo = (index, direction) => {
    if (isAnimating.current) return;
    if (index < 0 || index >= photos.length) return;
    const prev = currentIndexRef.current;
    if (index === prev) return;
    isAnimating.current = true;

    const dir = direction || (index > prev ? 1 : -1);
    const cards = cardRefs.current;
    const total = photos.length;

    if (cards[prev]) {
      cards[prev].style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease';
      cards[prev].style.transform = `translateX(${-100 * dir}%) scale(0.9)`;
      cards[prev].style.opacity = '0';
      cards[prev].style.zIndex = total - prev;
    }

    if (cards[index]) {
      cards[index].style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease';
      cards[index].style.transform = `translateX(${100 * dir}%) scale(0.95)`;
      cards[index].style.opacity = '0.8';
      cards[index].style.zIndex = total + 10;

      requestAnimationFrame(() => {
        cards[index].style.transform = 'translateX(0) scale(1)';
        cards[index].style.opacity = '1';
      });
    }

    cards.forEach((card, i) => {
      if (card && i !== prev && i !== index) {
        card.style.transition = 'opacity 0.2s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.92)';
        card.style.zIndex = total - i;
      }
    });

    currentIndexRef.current = index;
    setCurrentIndex(index);

    setIsSwitching(true);
    setTimeout(() => setIsSwitching(false), 600);

    const randomCompanion = companionMessages[Math.floor(Math.random() * companionMessages.length)];
    setCompanionText(randomCompanion);

    setTimeout(() => {
      Object.values(videoRefs.current).forEach(video => {
        if (video) {
          video.pause();
        }
      });
      const currentVideo = videoRefs.current[index];
      if (currentVideo) {
        currentVideo.load();
        currentVideo.play().catch(() => {});
      }
    }, 500);

    setTimeout(() => {
      cards.forEach(card => {
        if (card) {
          card.style.transition = '';
        }
      });
      isAnimating.current = false;
    }, 450);
  };

  const nextCard = () => {
    const next = (currentIndexRef.current + 1) % photos.length;
    goTo(next, 1);
  };

  const prevCard = () => {
    const prev = (currentIndexRef.current - 1 + photos.length) % photos.length;
    goTo(prev, -1);
  };

  // ===== 获取当前评论（支持多句） =====
  const getCurrentComment = () => {
    const currentPhoto = photos[currentIndex];
    if (!currentPhoto) return '';
    const comment = currentPhoto.comment;
    if (Array.isArray(comment)) {
      const safeIndex = Math.min(commentIndex, comment.length - 1);
      return comment[safeIndex] || comment[0] || '';
    }
    return comment || '';
  };

  // ===== Q版 =====
  const getChibiImage = () => {
    const currentPhoto = photos[currentIndex];
    return currentPhoto?.chibi || '/chibi/Q01.png';
  };

  // ===== 渲染 =====
  return (
    <div className="collection-page">
      <div className="page-header">
        <button className="back-button" onClick={onBack}>←</button>
        <div className="page-title">收藏夹</div>
      </div>

      <div className="collection-content">
        <div className="photo-area">
          <div
            className="photo-container"
            ref={containerRef}
            style={{ touchAction: 'none' }}
          >
            {photos.map((item, i) => {
              const total = photos.length;
              const isCurrent = i === currentIndex;
              const isPrev = i === currentIndexRef.current;
              
              let transformStyle = 'translateX(0) scale(0.92)';
              let opacityStyle = '0';
              let zIndexStyle = total - i;
              
              if (isCurrent) {
                transformStyle = 'translateX(0) scale(1)';
                opacityStyle = '1';
                zIndexStyle = total + 10;
              }
              
              return (
                <div
                  key={i}
                  ref={el => cardRefs.current[i] = el}
                  className="photo-card"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                    transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    WebkitUserDrag: 'none',
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                    transform: transformStyle,
                    opacity: opacityStyle,
                    zIndex: zIndexStyle,
                  }}
                >
                  <div
                    className="media-container"
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                    }}
                  >
                    {item.isLive ? (
                      <>
                        <video
                          ref={el => videoRefs.current[i] = el}
                          preload="none"
                          src={item.video}
                          poster={item.photo}
                          muted
                          playsInline
                          loop
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                          }}
                        />
                      </>
                    ) : (
                      <img
                        src={item.photo}
                        alt={`照片${i + 1}`}
                        onError={(e) => {
                          console.error(`Failed to load image: ${item.photo}`);
                          e.target.style.display = 'none';
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="chibi-area">
          <img
            src={getChibiImage()}
            alt="Q版沈星回"
            className={`chibi-character ${isSwitching ? 'switching' : ''}`}
          />
          <div className="chibi-dialogue">{getCurrentComment()}</div>
          <div className="companion-status">{companionText}</div>
        </div>

        <div className="pagination-dots">
          {photos.map((_, index) => (
            <div
              key={index}
              className={`pagination-dot ${index === currentIndex ? 'active' : ''}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Collection;