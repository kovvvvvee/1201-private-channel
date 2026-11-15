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
  const initialPlayTimerRef = useRef(null);

  // Live Photo 播放诊断日志（仅 console，不影响用户界面）
  const logPlayError = (trigger, index, video, err) => {
    console.warn('[LiveDiag]', JSON.stringify({
      trigger,
      index,
      name: err && err.name,
      message: err && err.message,
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      currentTime: +video.currentTime.toFixed(2),
      src: video.currentSrc || video.src,
    }));
  };


  const companionMessages = [
    "继续往后看吧。"
  ];

  // ===== 预加载 Q版图片（仅当前+下一张，避免首屏抢占带宽） =====
  useEffect(() => {
    if (photos.length === 0) return;
    const next = (currentIndex + 1) % photos.length;
    [photos[currentIndex]?.chibi, photos[next]?.chibi].forEach(src => {
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [currentIndex, photos]);

  // ===== 加载照片（每张照片单独配置 chibi + comment） =====
  useEffect(() => {
    const loadedPhotos = [
      // 1: 实况
      {
        photo: '/photos/live/photo1.webp',
        video: '/photos/live/photo1.mp4',
        isLive: true,
        chibi: '/chibi/Q02.webp',
        comment: '你每次这样看过来的时候，都很难让我移开视线。'
      },
      // 2: 普通
      {
        photo: '/photos/photo2.webp',
        isLive: false,
        chibi: '/chibi/Q04.webp',
        comment: '已收藏'
      },
      // 3: 普通
      {
        photo: '/photos/photo3.webp',
        isLive: false,
        chibi: '/chibi/Q02.webp',
        comment: '这张拍糊了。不过好像刚好把那天的风留下来了'
      },
      // 4: 普通
      {
        photo: '/photos/photo4.webp',
        isLive: false,
        chibi: '/chibi/Q04.webp',
        comment: '装备检查完成。看起来已经准备好出来了。'
      },
      // 5: 实况 ← 多句评论（数组）
      {
        photo: '/photos/live/photo5.webp',
        video: '/photos/live/photo5.mp4',
        isLive: true,
        chibi: '/chibi/Q03.webp',
        comment: '离得太近了。这是准备突然袭击吗？'
      },
      // 6: 实况← 多句评论（数组）
      {
        photo: '/photos/live/photo6.webp',
        video: '/photos/live/photo6.mp4',
        isLive: true,
        chibi: '/chibi/Q01.webp',
        comment: ['我看到了' , '全都看到了']
      },
      // 7: 实况
      {
        photo: '/photos/live/photo7.webp',
        video: '/photos/live/photo7.mp4',
        isLive: true,
        chibi: '/chibi/Q04.webp',
        comment: '晚上的风有点凉。'
      },
      // 8: 普通
      {
        photo: '/photos/photo8.webp',
        isLive: false,
        chibi: '/chibi/Q03.webp',
        comment: '喜欢这一张。'
      },
      // 9: 普通
      {
        photo: '/photos/photo9.webp',
        isLive: false,
        chibi: '/chibi/Q01.webp',
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

  // ===== 辅助函数：清理指定视频 =====
  const cleanupVideo = (index) => {
    const video = videoRefs.current[index];
    if (!video) return;

    if (video._eventHandlers) {
      video._eventHandlers.forEach(({ event, handler }) => {
        video.removeEventListener(event, handler);
      });
      video._eventHandlers = [];
    }

    video.pause();
    video.removeAttribute('src');
    video.load();

    if (video.parentNode) {
      video.parentNode.removeChild(video);
    }

    delete videoRefs.current[index];
  };

  // ===== 辅助函数：清理所有视频 =====
  const cleanupAllVideos = () => {
    Object.keys(videoRefs.current).forEach(index => {
      cleanupVideo(parseInt(index));
    });
  };

  // ===== 辅助函数：为指定 live 卡片创建 video =====
  const createVideoForCard = (index) => {
    if (videoRefs.current[index]) {
      return videoRefs.current[index];
    }

    const item = photos[index];
    if (!item || !item.isLive) {
      return null;
    }

    const card = cardsRef.current[index];
    if (!card) {
      return null;
    }

    const mediaContainer = card.querySelector('.media-container');
    if (!mediaContainer) {
      return null;
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.src = item.video;
    video.poster = item.photo;
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.loop = true;
    video.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      position: absolute;
      top: 0;
      left: 0;
    `;

    const eventHandlers = [];

    const addEventHandler = (event, handler) => {
      video.addEventListener(event, handler);
      eventHandlers.push({ event, handler });
    };

    addEventHandler('loadedmetadata', () => {
      const data = {
        index,
        src: item.video,
        readyState: video.readyState,
        networkState: video.networkState
      };
    });

    addEventHandler('loadeddata', () => {
      const data = {
        index,
        src: item.video,
        readyState: video.readyState,
        networkState: video.networkState
      };
    });

    const tryPlayIfCurrent = (e) => {
      if (index === currentIndexRef.current && video.paused) {
        video.play().catch((err) => logPlayError(e.type, index, video, err));
      }
    };
    addEventHandler('canplay', tryPlayIfCurrent);
    addEventHandler('loadeddata', tryPlayIfCurrent);

    addEventHandler('playing', () => {
      const data = {
        index,
        src: item.video,
        readyState: video.readyState,
        networkState: video.networkState
      };
    });

    addEventHandler('waiting', () => {
      const data = {
        index,
        src: item.video,
        readyState: video.readyState,
        networkState: video.networkState
      };
    });

    addEventHandler('stalled', () => {
      const data = {
        index,
        src: item.video,
        readyState: video.readyState,
        networkState: video.networkState
      };
    });

    addEventHandler('error', () => {
      const data = {
        index,
        src: item.video,
        readyState: video.readyState,
        networkState: video.networkState,
        errorCode: video.error?.code,
        errorMessage: video.error?.message
      };
      console.error('[Collection Live] error:', data);
    });

    video._eventHandlers = eventHandlers;
    mediaContainer.appendChild(video);
    videoRefs.current[index] = video;

    return video;
  };

  // ===== 按需加载卡片图片（当前卡优先，再相邻卡） =====
  const loadWindowMedia = (index) => {
    const total = photos.length;
    const order = [index, (index + 1) % total, (index - 1 + total) % total];
    order.forEach((i, orderIdx) => {
      const card = cardsRef.current[i];
      const img = card && card.querySelector('.media-container img');
      if (img && !img.getAttribute('src') && img.dataset.src) {
        if (orderIdx === 0) img.setAttribute('fetchpriority', 'high');
        img.src = img.dataset.src;
      }
    });
  };

  // ===== 初始化卡片堆叠（使用 video 实况） =====
  useEffect(() => {
  const container = containerRef.current;

  if (photos.length === 0) return;
  if (!container) return;

  cleanupAllVideos();

  container.innerHTML = '';
  cardsRef.current = [];

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

      // 图片延迟赋 src：只加载当前卡附近的图片，避免首次进入一次性拉取全部 9 张
      const img = document.createElement('img');
      img.dataset.src = item.photo;
      img.alt = `照片${i+1}`;
      img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
      `;
      mediaContainer.appendChild(img);
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
    loadWindowMedia(0);

    if (initialPlayTimerRef.current) {
      clearTimeout(initialPlayTimerRef.current);
    }

    initialPlayTimerRef.current = setTimeout(() => {
      const firstPhoto = photos[0];
      if (firstPhoto && firstPhoto.isLive) {
        const firstVideo = createVideoForCard(0);
        if (firstVideo) {
          firstVideo.play().catch((err) => {
            logPlayError('initial-timer', 0, firstVideo, err);
          });
        }
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

    // 用户手势兜底：触摸时确保当前 Live Photo 正在播放（覆盖自动播放被拦截的情况）
    const handleTouchPlay = () => {
      const idx = currentIndexRef.current;
      const item = photos[idx];
      if (item && item.isLive) {
        const v = videoRefs.current[idx];
        if (v && v.paused) v.play().catch((err) => logPlayError('touchstart', idx, v, err));
      }
    };
    container.addEventListener('touchstart', handleTouchPlay, { passive: true });

    return () => {
  if (initialPlayTimerRef.current) {
    clearTimeout(initialPlayTimerRef.current);
    initialPlayTimerRef.current = null;
  }

  cleanupAllVideos();

  container.removeEventListener('touchstart', handleTouchStart);
  container.removeEventListener('touchend', handleTouchEnd);
  container.removeEventListener('touchstart', handleTouchPlay);

  cardsRef.current = [];
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
    loadWindowMedia(index);

    setIsSwitching(true);
    setTimeout(() => setIsSwitching(false), 600);

    const randomCompanion = companionMessages[Math.floor(Math.random() * companionMessages.length)];
    setCompanionText(randomCompanion);

  const currentPhoto = photos[index];
  let currentVideo = videoRefs.current[index];

  if (currentPhoto && currentPhoto.isLive && !currentVideo) {
    currentVideo = createVideoForCard(index);
  }

  const preloadIndex = (index + 1) % photos.length;
  const preloadVideo = videoRefs.current[preloadIndex];

  Object.keys(videoRefs.current).forEach(key => {
    const videoIndex = parseInt(key);
    const video = videoRefs.current[videoIndex];

    if (!video) return;

    if (videoIndex === index) {
      video.play().catch((err) => {
        logPlayError('switch', videoIndex, video, err);
      });
    } else if (videoIndex === preloadIndex) {
      video.pause();
    } else {
      cleanupVideo(videoIndex);
    }
  });

  if (photos[preloadIndex] && photos[preloadIndex].isLive && !preloadVideo) {
    createVideoForCard(preloadIndex);
  }


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
    return currentPhoto?.chibi || '/chibi/Q01.webp';
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
            key={getChibiImage()}
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