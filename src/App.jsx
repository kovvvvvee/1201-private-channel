import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import LaunchAnimation from './components/LaunchAnimation';
import Home from './pages/Home';
import Collection from './pages/Collection';
import Message from './pages/Message';
import Chat from './pages/Chat';
import './styles/global.css';

function AppContent() {
  const [showLaunch, setShowLaunch] = useState(true);
  const navigate = useNavigate();

  const handleLaunchComplete = () => {
    setShowLaunch(false);
    const params = new URLSearchParams(window.location.search);
    const debugLive = params.get('debugLive') === '1';
    navigate(debugLive ? '/home?debugLive=1' : '/home');
  };

  const handleNavigate = (page) => {
    const params = new URLSearchParams(window.location.search);
    const debugLive = params.get('debugLive') === '1';
    navigate(debugLive ? `/${page}?debugLive=1` : `/${page}`);
  };

  const handleBack = () => {
    const params = new URLSearchParams(window.location.search);
    const debugLive = params.get('debugLive') === '1';
    navigate(debugLive ? '/home?debugLive=1' : '/home');
  };

  if (showLaunch) {
    return <LaunchAnimation onComplete={handleLaunchComplete} />;
  }

  return (
    <Routes>
      <Route
        path="/home"
        element={<Home onNavigate={handleNavigate} />}
      />
      <Route
        path="/collection"
        element={<Collection onBack={handleBack} />}
      />
      <Route
        path="/message"
        element={<Message onBack={handleBack} />}
      />
      <Route
        path="/chat"
        element={<Chat onBack={handleBack} />}
      />
      <Route
        path="*"
        element={<Home onNavigate={handleNavigate} />}
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;