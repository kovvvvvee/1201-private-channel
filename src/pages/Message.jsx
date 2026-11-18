import { useState, useEffect, useRef } from 'react';
import '../styles/message.css';

const Message = ({ onBack }) => {
  const [currentMessage, setCurrentMessage] = useState('');
  const [messageVisible, setMessageVisible] = useState(false);
  const [showEnvelope, setShowEnvelope] = useState(false);
  const [showLetter, setShowLetter] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [showAudioButton, setShowAudioButton] = useState(false);
  const audioRef = useRef(null);
  const bgmDiagRef = useRef('');

  const messages = [
    "今天回来的时候……",
    "发现门口放着一个东西。",
    "好像……是给你的。"
  ];

  // 预加载背景图、信封与信纸
  useEffect(() => {
    ['/letter/message-bg.webp', '/letter/envelope.webp', '/letter/letter.webp'].forEach(src => {
      const img = new Image();
      const t0 = performance.now();
      img.onload = () => console.log('[MessageDiag] preload loaded:', src,
        (performance.now() - t0).toFixed(0) + 'ms', img.naturalWidth + 'x' + img.naturalHeight);
      img.onerror = () => console.error('[MessageDiag] preload failed:', src,
        (performance.now() - t0).toFixed(0) + 'ms');
      img.src = src;
    });
  }, []);

  // 初始化音频并尝试播放
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = '/audio/bgm.mp3';
    audio.loop = true;
    audio.volume = 0.5;
    audioRef.current = audio;

    // ===== [MessageBgmDiag] read-only media diagnostics =====
    const diagId = 'bgm-' + Math.random().toString(36).slice(2, 8);
    bgmDiagRef.current = diagId;
    const diagT0 = performance.now();
    const diagRanges = (tr) => { const o = []; for (let i = 0; i < tr.length; i++) o.push(tr.start(i).toFixed(2) + '-' + tr.end(i).toFixed(2)); return o.join(','); };
    const logEvt = (ev) => {
      const me = audio.error;
      console.log('[MessageBgmDiag]', diagId, ev, 't='+(performance.now()-diagT0).toFixed(0)+'ms',
        'dur='+audio.duration, 'pos='+audio.currentTime.toFixed(2),
        'rs='+audio.readyState, 'ns='+audio.networkState,
        'paused='+audio.paused, 'ended='+audio.ended,
        'err='+(me ? me.code+':'+me.message : 'none'),
        'buf=['+diagRanges(audio.buffered)+']', 'seek=['+diagRanges(audio.seekable)+']');
    };
    ['loadstart','loadedmetadata','loadeddata','canplay','canplaythrough','play','playing','waiting','stalled','progress','pause','ended','error','suspend','abort'].forEach(ev => audio.addEventListener(ev, () => logEvt(ev)));
    console.log('[MessageBgmDiag]', diagId, 'created', 'preload='+audio.preload, 'src='+audio.src, 't=0');
    let active = true;

    const updatePlayingState = () => {
      setIsAudioPlaying(!audio.paused);
    };

    const handlePlay = () => {
      updatePlayingState();
      setShowAudioButton(false);
    };

    const handlePause = () => {
      updatePlayingState();
      setShowAudioButton(true);
    };

    const handleEnded = () => {
      if (audio.loop) {
        setIsAudioPlaying(true);
      } else {
        setIsAudioPlaying(false);
      }
    };

    const handleError = (error) => {
      console.error('[Message] Audio error:', error);
      setIsAudioPlaying(false);
      setShowAudioButton(true);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    const attemptPlay = async () => {
      try {
        console.log('[MessageBgmDiag]', diagId, 'play() invoked');
        await audio.play().then(
          () => console.log('[MessageBgmDiag]', diagId, 'play() resolved'),
          (e) => { console.log('[MessageBgmDiag]', diagId, 'play() rejected', e && e.name); throw e; }
        );
        if (active) setIsAudioPlaying(true);
      } catch (error) {
        console.log('[Message] Autoplay blocked, showing play button:', error.message);
        if (!active) return;
        setIsAudioPlaying(false);
        setShowAudioButton(true);
      }
    };

    console.log('[MessageBgmDiag]', diagId, 'attemptPlay() invoked');
    attemptPlay();

    return () => {
      console.log('[MessageBgmDiag]', diagId, 'cleanup/unmount');
      active = false;
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
        audioRef.current = null;
      }
    };
  }, []);

  // 文字逐条显示逻辑
  useEffect(() => {
    let index = 0;

    const showNextMessage = () => {
      if (index < messages.length) {
        setCurrentMessage(messages[index]);
        setMessageVisible(true);

        setTimeout(() => {
          setMessageVisible(false);
          setTimeout(() => {
            index++;
            showNextMessage();
          }, 500);
        }, 2000);
      } else {
        setTimeout(() => {
          setShowEnvelope(true);
        }, 500);
      }
    };

    showNextMessage();
  }, []);

  const handleEnvelopeClick = () => {
    setShowEnvelope(false);
    setShowLetter(true);
  };

  const handleCloseLetter = () => {
    setShowLetter(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    onBack();
  };

  const handleBack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    onBack();
  };

  const handlePlayAudio = () => {
    if (audioRef.current && audioRef.current.paused) {
      console.log('[MessageBgmDiag]', bgmDiagRef.current, 'manual play clicked');
            audioRef.current.play()
        .then(() => {
          setShowAudioButton(false);
        })
        .catch(error => {
          console.error('[Message] Manual play failed:', error);
        });
    }
  };

  return (
    <div className="message-page">
      <div className="page-header">
        <button className="back-button" onClick={handleBack}>←</button>
        <div className="page-title">留言</div>
      </div>
      <div className="message-content">
        <div className={`message-text ${messageVisible ? 'visible' : ''}`}>
          {currentMessage}
        </div>
        {showEnvelope && (
          <div className="envelope-container visible" onClick={handleEnvelopeClick}>
            <img
              src="/letter/envelope.webp"
              alt="信封"
              className="envelope-image"
              onLoad={(e) => {
                console.log('[Message] Envelope loaded:', e.target.src,
                  `${e.target.naturalWidth}x${e.target.naturalHeight}`);
              }}
              onError={(e) => {
                if (!e.target.dataset.fallbackTried) {
                  e.target.dataset.fallbackTried = '1';
                  console.error('[Message] Envelope webp failed, fallback to png:', e.target.src);
                  e.target.src = '/letter/envelope.png';
                } else {
                  console.error('[Message] Envelope png fallback also failed:', e.target.src);
                }
              }}
            />
          </div>
        )}
        {showAudioButton && (
          <button className="audio-play-button" onClick={handlePlayAudio}>
            🎵 播放音乐
          </button>
        )}
      </div>
      {showLetter && (
        <div className="letter-container visible">
          <div className="letter-content">
            <button className="letter-close" onClick={handleCloseLetter}>×</button>
            <div className="letter-wrapper">
              <div className="letter-text">
                <p className="letter-greeting">哈喽哈喽，是安妮写的信哦！</p>
                <p>首先的首先，祝你生日快乐嘻嘻！</p>
                <p>
                  这次做网站是希望能以你喜欢的形式呈现我对你的祝福，
                  不管是祝你生日快乐，还是祝你和沈星回永远在一起。
                </p>
                <p>
                  第一次做这种梦女向的网站，完全是一头雾水摸索着做，
                  不知道最后能不能达到你的预期。
                </p>
                <p>
                  做的时候一直在翻阅你的朋友圈，又去找沈星回的设定，
                  像一个红娘来的。
                </p>
                <p>
                  挑了我最喜欢的，我觉得适合的八张照片，
                  每一张我都觉得很萌！
                </p>
                <p>
                  还要说什么呢，似乎只剩下一些客套的漂亮话，
                  但还是要说一遍：
                </p>
                <p className="letter-highlight">
                  希望你天天开心，能一直坚持自己喜欢的东西，
                  有机会去做自己感兴趣的事。
                </p>
                <p>
                  不管是什么，自己舒心自在最重要！
                </p>
                <p>
                  其实有在心里隐隐把你当成榜样，想做什么就去做，
                  也是因为你这学期开始健身，我才想着我也要去跑步
                  （虽然似乎就坚持了一周），然后这个暑假也将严肃进行游泳。
                </p>
                <p>
                  明明是12月的生日，我居然7月就在写生日信。
                </p>
                <p>
                  但情感不会变哦！哪怕之后的每个生日我想我写的东西肯定也差不多，
                  最多就是事情不同，因为每年都在增加新记忆。
                </p>
                <p className="letter-ending">
                  罗里吧嗦地写了一堆没逻辑的东西，
                  希望你喜欢我的生日礼物！嘻嘻！
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;