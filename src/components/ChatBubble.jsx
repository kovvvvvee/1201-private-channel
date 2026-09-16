import '../styles/chatBubble.css';

const ChatBubble = ({ message, type, delay = 0 }) => {
  const isUser = type === 'user';

  return (
    <div className={`message ${type}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="message-avatar">
        {isUser ? (
          <img src="/avatars/user-avatar.png" alt="我" />
        ) : (
          <img src="/avatars/xinghui-avatar.png" alt="沈星回" />
        )}
      </div>
      <div className="message-bubble">
        {message}
      </div>
    </div>
  );
};

export default ChatBubble;