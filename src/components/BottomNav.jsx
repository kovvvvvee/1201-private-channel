import '../styles/bottomNav.css';

const BottomNav = ({ onNavigate }) => {
  return (
    <div className="bottom-nav">
      <button className="nav-button" onClick={() => onNavigate('collection')}>
        📖 收藏夹
      </button>
      <button className="nav-button" onClick={() => onNavigate('message')}>
        💬 留言
      </button>
      <button className="nav-button" onClick={() => onNavigate('chat')}>
        📡 特别通讯
      </button>
    </div>
  );
};

export default BottomNav;
