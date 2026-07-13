import { useState, useEffect, useRef } from 'react';
import '../styles/collection.css';

const Collection = ({ onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [companionText, setCompanionText] = useState('');
  const [commentIndex, setCommentIndex] = useState(0);
  const containerRef = useRef(null);
  const cardsRef = useRef([]);
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
        video: '/photos/live/photo1.mov',
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
        video: '/photos/live/photo5.mov',
        isLive: true,
        chibi: '/chibi/Q03.png',
        comment: '离得太近了。这是准备突然袭击吗？'
      },
      // 6: 实况← 多句评论（数组）
      {
        photo: '/photos/live/photo6.jpg',
        video: '/photos/live/photo6.mov',
        isLive: true,
        chibi: '/chibi/Q01.png',
        comment: ['我看到了' , '全都看到了']
      },
      // 7: 实况
      {
        photo: '/photos/live/photo7.jpg',
        video: '/photos/live/photo7.mov',
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

  // ===== 初始化卡片堆叠（使用 video 实况） =====
  useEffect(() => {
    if (photos.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    cardsRef.current = [];
    videoRefs.current = {};

    photos.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    opacity 0.4s ease;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
        will-change: transform;
        backface-visibility: hidden;
      `;

      const mediaContainer = document.createElement('div');
      mediaContainer.className = 'media-container';
      mediaContainer.style.cssText = `
        width: 100%;
        height: 100%;
        position: relative;
      `;
      card.appendChild(mediaContainer);
      container.appendChild(card);
      cardsRef.current.push(card);

      if (item.isLive) {
        const video = document.createElement('video');
        video.src = item.video;
        video.poster = item.photo;
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
          position: absolute;
          top: 0;
          left: 0;
        `;
        video.onerror = function() {
          const fallbackImg = document.createElement('img');
          fallbackImg.src = item.photo;
          fallbackImg.alt = `照片${i+1}`;
          fallbackImg.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            position: absolute;
            top: 0;
            left: 0;
          `;
          mediaContainer.appendChild(fallbackImg);
        };
        mediaContainer.appendChild(video);
        videoRefs.current[i] = video;
      } else {
        const img = document.createElement('img');
        img.src = item.photo;
        img.alt = `照片${i+1}`;
        img.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
        `;
        mediaContainer.appendChild(img);
      }
    });

    const total = photos.length;
    currentIndexRef.current = 0;
    cardsRef.current.forEach((card, i) => {
      if (i === 0) {
        card.style.transform = 'translateX(0) scale(1)';
        card.style.opacity = '1';
        card.style.zIndex = total + 10;
      } else {
        card.style.transform = 'translateX(0) scale(0.92)';
        card.style.opacity = '0';
        card.style.zIndex = total - i;
      }
    });
    setCurrentIndex(0);

    setTimeout(() => {
      const firstVideo = videoRefs.current[0];
      if (firstVideo) {
        firstVideo.play().catch(() => {});
      }
    }, 500);

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
  }, [photos]);

  // ===== 切换函数 =====
  const goTo = (index, direction) => {
    if (isAnimating.current) return;
    if (index < 0 || index >= photos.length) return;
    const prev = currentIndexRef.current;
    if (index === prev) return;
    isAnimating.current = true;

    const dir = direction || (index > prev ? 1 : -1);
    const cards = cardsRef.current;
    const total = photos.length;

    cards[prev].style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease';
    cards[prev].style.transform = `translateX(${-100 * dir}%) scale(0.9)`;
    cards[prev].style.opacity = '0';
    cards[prev].style.zIndex = total - prev;

    cards[index].style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease';
    cards[index].style.transform = `translateX(${100 * dir}%) scale(0.95)`;
    cards[index].style.opacity = '0.8';
    cards[index].style.zIndex = total + 10;

    requestAnimationFrame(() => {
      cards[index].style.transform = 'translateX(0) scale(1)';
      cards[index].style.opacity = '1';
    });

    cards.forEach((card, i) => {
      if (i !== prev && i !== index) {
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
        currentVideo.play().catch(() => {});
      }
    }, 500);

    setTimeout(() => {
      cards.forEach(card => {
        card.style.transition = '';
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
          />
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