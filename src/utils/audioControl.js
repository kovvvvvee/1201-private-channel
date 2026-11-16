// 音频播放控制
const BIRTHDAY_AUDIO_SRC = '/audio/birthday.mp3';

const now = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

const birthdayTimings = {};
const markBirthdayTiming = (name, detail) => {
  if (birthdayTimings[name] !== undefined) return;
  birthdayTimings[name] = now();
  const suffix = detail ? ` ${detail}` : '';
  console.info(`[birthday-timing] ${name} t=${birthdayTimings[name].toFixed(1)}${suffix}`);
};

let birthdayAudio = null;
let birthdayPlayPromise = null;
let birthdayPlaybackStarted = false;
let birthdayLastError = null;

// 首页挂载后主动 fetch 预热；成功后优先用 Blob URL 供单例 Audio 复用，
// 避免首次点击时才开始网络下载。若用户在预热完成前点击，则中止 fetch 并
// 回退到原 URL，保证点击手势内同步进入 play()。
const birthdayPrefetch = {
  status: 'idle', // idle | loading | ready | failed | aborted
  blob: null,
  blobUrl: null,
  controller: null,
  promise: null,
};

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

const hasUsableBirthdaySrc = (audio) => {
  return !!(audio.currentSrc && audio.networkState !== 0 && audio.networkState !== 3 && !audio.error);
};

const revokeBirthdayBlobUrl = () => {
  if (birthdayPrefetch.blobUrl) {
    try {
      URL.revokeObjectURL(birthdayPrefetch.blobUrl);
    } catch {
      // 忽略 revoke 失败
    }
    birthdayPrefetch.blobUrl = null;
  }
};

// Blob 源失败时回退到原 URL，避免单例 Audio 卡在 blob error 状态。
const recoverBirthdayBlobSource = (audio) => {
  if (!birthdayPrefetch.blobUrl || audio.currentSrc !== birthdayPrefetch.blobUrl) return;
  birthdayPrefetch.status = 'failed';
  birthdayPrefetch.blob = null;
  revokeBirthdayBlobUrl();
  if (!birthdayPlaybackStarted && !birthdayPlayPromise) {
    audio.src = BIRTHDAY_AUDIO_SRC;
  }
};

// 只在原资源尚未成功接管时才允许用已预热的 Blob 替换 src；
// 播放中、已加载或正在加载的原资源不替换，避免打断播放/重复下载。
const canUseBirthdayBlob = (audio) => {
  if (!birthdayPrefetch.blob) return false;
  if (birthdayPrefetch.blobUrl && audio.currentSrc === birthdayPrefetch.blobUrl) return true;
  if (!audio.currentSrc) return true;
  return audio.networkState === 0 || audio.networkState === 3 || !!audio.error;
};

const adoptBirthdayBlob = (audio) => {
  if (!birthdayPrefetch.blob) return false;
  if (!birthdayPrefetch.blobUrl) {
    try {
      birthdayPrefetch.blobUrl = URL.createObjectURL(birthdayPrefetch.blob);
    } catch (error) {
      birthdayPrefetch.status = 'failed';
      reportBirthdayError('blob-url', error, audio);
      return false;
    }
  }
  if (audio.currentSrc !== birthdayPrefetch.blobUrl) {
    audio.src = birthdayPrefetch.blobUrl;
  }
  return true;
};

const maybeAdoptBirthdayBlob = () => {
  const audio = birthdayAudio;
  if (!audio) return false;
  if (birthdayPlayPromise || birthdayPlaybackStarted) return false;
  if (birthdayPrefetch.status !== 'ready') return false;
  if (!canUseBirthdayBlob(audio)) return false;
  return adoptBirthdayBlob(audio);
};

const ensureOriginalBirthdaySrc = (audio) => {
  if (!audio || audio.currentSrc || birthdayPlaybackStarted || birthdayPlayPromise) return;
  audio.src = BIRTHDAY_AUDIO_SRC;
};

// 播放路径上决定当前 src：优先已预热 Blob；否则在无 src 时使用原 URL。
// 只设置 src（浏览器自动开始加载），不在播放启动前后额外调用 load()，
// 避免 load() 打断同一手势内的 play()。后台预热不被中止，完成后由
// maybeAdoptBirthdayBlob() 在安全时机决定是否接管。
// 返回 true 表示本次调用设置了新的 src，调用方不再重复 reload。
const ensureBirthdaySrc = (audio) => {
  if (
    birthdayPrefetch.status === 'ready' &&
    birthdayPrefetch.blob &&
    canUseBirthdayBlob(audio) &&
    adoptBirthdayBlob(audio)
  ) {
    return true;
  }

  if (!audio.currentSrc) {
    audio.src = BIRTHDAY_AUDIO_SRC;
    return true;
  }

  return false;
};

const ensureBirthdayAudio = () => {
  if (birthdayAudio) return birthdayAudio;

  const audio = new Audio();
  audio.preload = 'auto';

  audio.addEventListener('loadedmetadata', () => {
    markBirthdayTiming('loadedmetadata');
  });
  audio.addEventListener('canplay', () => {
    markBirthdayTiming('canplay');
  });
  audio.addEventListener('playing', () => {
    birthdayPlaybackStarted = true;
    birthdayLastError = null;
    markBirthdayTiming('playing');
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
    recoverBirthdayBlobSource(audio);
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
  // 首页挂载后主动预热生日音频：优先 fetch 得到可复用 Blob，
  // 不依赖 preload='auto' 在移动端是否真正下载。
  preloadBirthday: () => {
    const audio = ensureBirthdayAudio();
    markBirthdayTiming('home-mounted');

    if (hasUsableBirthdaySrc(audio)) {
      return Promise.resolve(audio);
    }
    if (birthdayPrefetch.status === 'loading') {
      return birthdayPrefetch.promise;
    }
    if (birthdayPrefetch.status === 'ready' && birthdayPrefetch.blob) {
      maybeAdoptBirthdayBlob();
      return Promise.resolve(birthdayPrefetch.blobUrl || audio);
    }
    if (birthdayPrefetch.status === 'aborted') {
      return Promise.resolve(audio);
    }

    birthdayPrefetch.status = 'loading';
    markBirthdayTiming('prefetch-start');
    birthdayPrefetch.controller = new AbortController();
    birthdayPrefetch.promise = fetch(BIRTHDAY_AUDIO_SRC, { signal: birthdayPrefetch.controller.signal })
      .then(async (response) => {
        if (birthdayPrefetch.status !== 'loading') return null;
        if (!response || !response.ok) {
          throw new Error(`HTTP ${response ? response.status : 'no-response'}`);
        }
        const contentType = response.headers.get('content-type') || '';
        const blob = await response.blob();
        if (!blob || blob.size === 0) {
          throw new Error('empty audio body');
        }
        birthdayPrefetch.blob = blob;
        birthdayPrefetch.status = 'ready';
        birthdayPrefetch.controller = null;
        markBirthdayTiming('prefetch-complete', `bytes=${blob.size} type=${contentType}`);
        maybeAdoptBirthdayBlob();
        return birthdayPrefetch.blobUrl || audio;
      })
      .catch((error) => {
        if (birthdayPrefetch.status === 'aborted' || (error && error.name === 'AbortError')) {
          if (birthdayPrefetch.status === 'loading') birthdayPrefetch.status = 'aborted';
          return null;
        }
        birthdayPrefetch.status = 'failed';
        birthdayPrefetch.controller = null;
        markBirthdayTiming('prefetch-complete', `failed=${error && error.message}`);
        reportBirthdayError('prefetch', error, audio);
        ensureOriginalBirthdaySrc(audio);
        return null;
      })
      .finally(() => {
        birthdayPrefetch.controller = null;
      });

    return birthdayPrefetch.promise;
  },

  // 播放生日快乐语音（复用单例实例；点击手势内同步进入播放启动流程）
  playBirthday: () => {
    const audio = ensureBirthdayAudio();
    markBirthdayTiming('first-key-click');

    // 上一次 play() Promise 尚未完成时合并本次点击，避免并发播放流程互相覆盖。
    if (birthdayPlayPromise) {
      return audio;
    }

    const srcChanged = ensureBirthdaySrc(audio);

    if (!srcChanged && needsBirthdayReload(audio)) {
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

    // 已在播放中的重复点击直接忽略，不重置 currentTime，避免打断/重播。
    if (playing) {
      return audio;
    }

    if (audio.currentTime !== 0 && canSeekBirthday(audio)) {
      try {
        audio.currentTime = 0;
      } catch (error) {
        reportBirthdayError('seek', error, audio);
      }
    }

    try {
      markBirthdayTiming('play-called', `readyState=${audio.readyState} networkState=${audio.networkState} src=${birthdayPrefetch.blobUrl && audio.currentSrc === birthdayPrefetch.blobUrl ? 'blob' : 'remote'}`);
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
