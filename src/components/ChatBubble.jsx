import '../styles/chatBubble.css';

const ChatBubble = ({ message, type, delay = 0 }) => {
  const isUser = type === 'user';

  return (
    <div className={`message ${type}`}>
      <div className="message-avatar">
        {isUser ? (
          <img src="/avatars/user-avatar.webp" alt="我" />
        ) : (
          <img src="/avatars/xinghui-avatar.webp" alt="沈星回" />
        )}
      </div>
      <div className="message-bubble">
        {message}
      </div>
    </div>
  );
};

export default ChatBubble;