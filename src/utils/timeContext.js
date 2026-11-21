// 构建用户本地时间上下文（每次发送消息时重新获取，不缓存）
const getPeriod = (hour) => {
  if (hour < 5 || hour >= 23) return '深夜';
  if (hour < 9) return '早晨';
  if (hour < 12) return '上午';
  if (hour < 13) return '中午';
  if (hour < 17) return '下午';
  if (hour < 19) return '傍晚';
  return '晚上';
};

export const buildTimeContext = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'long', timeZoneName: 'longOffset',
  }).formatToParts(now);

  const get = (type) => parts.find(p => p.type === type)?.value || '';
  const hour = parseInt(get('hour'), 10) % 24;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '未知时区';

  return [
    '【当前时间】',
    `用户本地时间：${get('year')}-${get('month')}-${get('day')} ${get('weekday')} ${String(hour).padStart(2, '0')}:${get('minute')}（${tz}，${getPeriod(hour)}）。`,
    '这是本次请求的权威时间，请以此为准回应用户当前的时间感受；',
    '不要根据你自身的系统日期猜测用户时间，不要混淆早晨、上午、中午、下午、傍晚、晚上、深夜；',
    '可以结合当前时段理解她的日常状态，但不要仅凭时间断定她正在做什么；',
    '不需要每次主动提及时间，也不要机械地重复问候语；',
    '她主动提及的时间、事件和感受优先作为对话内容处理。',
  ].join('\n');
};
