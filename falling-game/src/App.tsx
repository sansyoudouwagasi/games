import { Analytics } from '@vercel/analytics/react';
import Game from './components/Game';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <Game />
      <Analytics />
    </div>
  );
}

export default App;
