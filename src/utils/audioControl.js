// 音频播放控制
const BIRTHDAY_AUDIO_SRC = '/audio/birthday.mp3';

let birthdayAudio = null;
let birthdayPlayPromise = null;
let birthdayPlaybackStarted = false;
let birthdayLastError = null;

const birthdaySnapshot = (audio) => ({
  readyState: audio.readyState,
  networkState: audio.networkState,
  paused: audio.paused,
  ended: audio.ended,
  currentTime: audio.currentTime,
  duration: audio.duration,
  error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
  src: audio.currentSrc || audio.src
});

const reportBirthdayError = (context, error, audio) => {
  birthdayLastError = {
    context,
    name: error && error.name,
    message: error && error.message,
    code: error && error.code,
    mediaError: audio && audio.error ? audio.error.code : null,
    at: Date.now()
  };
  console.error('[audioControl] birthday audio error:', context, birthdayLastError, birthdaySnapshot(audio));
};

const canSeekBirthday = (audio) => {
  if (audio.readyState >= 2) return true;
  try {
    return !!(audio.seekable && audio.seekable.length > 0 && audio.seekable.end(0) > 0);
  } catch {
    return false;
  }
};

const isBirthdayEnded = (audio) => {
  return audio.ended || (
    Number.isFinite(audio.duration) &&
    audio.duration > 0 &&
    audio.currentTime >= audio.duration - 0.05
  );
};

const needsBirthdayReload = (audio) => {
  return !!(audio.error || audio.networkState === 3);
};

const ensureBirthdayAudio = () => {
  if (birthdayAudio) return birthdayAudio;

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = BIRTHDAY_AUDIO_SRC;

  audio.addEventListener('playing', () => {
    birthdayPlaybackStarted = true;
    birthdayLastError = null;
  });
  audio.addEventListener('pause', () => {
    birthdayPlaybackStarted = false;
  });
  audio.addEventListener('ended', () => {
    birthdayPlaybackStarted = false;
    birthdayLastError = null;
  });
  audio.addEventListener('error', () => {
    birthdayPlaybackStarted = false;
    birthdayPlayPromise = null;
    reportBirthdayError('media-error', audio.error, audio);
  });
  audio.addEventListener('stalled', () => {
    console.warn('[audioControl] birthday audio stalled', birthdaySnapshot(audio));
  });
  audio.addEventListener('emptied', () => {
    birthdayPlaybackStarted = false;
    console.warn('[audioControl] birthday audio emptied', birthdaySnapshot(audio));
  });
  audio.addEventListener('abort', () => {
    birthdayPlaybackStarted = false;
    console.warn('[audioControl] birthday audio abort', birthdaySnapshot(audio));
  });

  birthdayAudio = audio;
  return audio;
};

export const audioControl = {
  // 预加载生日快乐语音（不播放）
  preloadBirthday: () => {
    return ensureBirthdayAudio();
  },

  // 播放生日快乐语音（复用预加载实例）
  playBirthday: () => {
    const audio = ensureBirthdayAudio();

    if (birthdayPlayPromise) {
      return audio;
    }

    if (needsBirthdayReload(audio)) {
      birthdayPlaybackStarted = false;
      birthdayPlayPromise = null;
      try {
        audio.load();
      } catch (error) {
        reportBirthdayError('reload', error, audio);
      }
    }

    const ended = isBirthdayEnded(audio);
    const playing = birthdayPlaybackStarted && !audio.paused && !ended;

    if (audio.currentTime !== 0 && canSeekBirthday(audio)) {
      try {
        audio.currentTime = 0;
      } catch (error) {
        reportBirthdayError('seek', error, audio);
      }
    }

    if (playing) {
      return audio;
    }

    try {
      const result = audio.play();
      const promise = result && typeof result.then === 'function'
        ? result
        : Promise.resolve(result);

      birthdayPlayPromise = promise;

      promise.then(
        () => {
          if (birthdayPlayPromise === promise) {
            birthdayPlayPromise = null;
            birthdayPlaybackStarted = !audio.paused && !isBirthdayEnded(audio);
            birthdayLastError = null;
          }
        },
        (error) => {
          if (birthdayPlayPromise === promise) {
            birthdayPlayPromise = null;
            birthdayPlaybackStarted = false;
            reportBirthdayError('play-rejected', error, audio);
          }
        }
      );
    } catch (error) {
      birthdayPlayPromise = null;
      birthdayPlaybackStarted = false;
      reportBirthdayError('play-threw', error, audio);
    }

    return audio;
  },

  // 播放指定音频（不复用）
  play: (src) => {
    const audio = new Audio(src);
    audio.play().catch(error => {
      console.error('Audio play failed:', error);
    });
    return audio;
  }
};
