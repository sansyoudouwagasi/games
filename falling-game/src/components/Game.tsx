import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Game.css';

type GameState = 'start' | 'playing' | 'gameover';

interface FallingItem {
  id: number;
  x: number;
  y: number;
  type: 'normal' | 'obstacle';
  color: string;
  speed: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
}

const NORMAL_COLORS = ['#7b3c3c', '#4caf50', '#ff9800']; // 小豆色, 緑色, オレンジ色
const OBSTACLE_COLOR = '#111111'; // お邪魔アイテム（黒系）
const PLAYER_WIDTH = 100;
const PLAYER_HEIGHT = 20;

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);

  const playerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight - 100 });
  const itemsRef = useRef<FallingItem[]>([]);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const itemIdCounter = useRef<number>(0);

  const startGame = () => {
    setGameState('playing');
    setScore(0);
    itemsRef.current = [];
    playerRef.current.x = window.innerWidth / 2;
    itemIdCounter.current = 0;
    lastTimeRef.current = performance.now();
  };

  const spawnItem = (canvasWidth: number) => {
    const isObstacle = Math.random() < 0.2; // 20%の確率でお邪魔アイテム
    const radius = 20 + Math.random() * 10; // 20~30のサイズ
    const color = isObstacle ? OBSTACLE_COLOR : NORMAL_COLORS[Math.floor(Math.random() * NORMAL_COLORS.length)];
    const speed = 2 + Math.random() * 3 + (score / 100); // スコアに応じて少しずつ速くなる
    
    itemsRef.current.push({
      id: itemIdCounter.current++,
      x: radius + Math.random() * (canvasWidth - radius * 2),
      y: -radius,
      type: isObstacle ? 'obstacle' : 'normal',
      color,
      speed,
      radius,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1
    });
  };

  const update = useCallback((deltaTime: number, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (gameState !== 'playing') return;

    // 画面クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // アイテム生成
    spawnTimerRef.current += deltaTime;
    const spawnInterval = Math.max(500, 1500 - score * 5); // だんだん生成間隔を短くする
    if (spawnTimerRef.current > spawnInterval) {
      spawnItem(canvas.width);
      spawnTimerRef.current = 0;
    }

    const pX = playerRef.current.x;
    const pY = playerRef.current.y;
    const pW = PLAYER_WIDTH;
    const pH = PLAYER_HEIGHT;

    // アイテムの更新と描画
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      item.y += item.speed * (deltaTime / 16); // フレームレート非依存
      item.rotation += item.rotationSpeed;

      // 描画
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      ctx.fillStyle = item.color;
      
      if (item.type === 'normal') {
        // 三角形を描画
        ctx.beginPath();
        ctx.moveTo(0, -item.radius);
        ctx.lineTo(item.radius * 0.866, item.radius * 0.5); // 0.866 = sqrt(3)/2
        ctx.lineTo(-item.radius * 0.866, item.radius * 0.5);
        ctx.closePath();
        ctx.fill();
      } else {
        // お邪魔アイテム（トゲトゲの形などを想定、とりあえずギザギザの星型）
        ctx.beginPath();
        const spikes = 6;
        for (let j = 0; j < spikes * 2; j++) {
          const r = j % 2 === 0 ? item.radius : item.radius / 2;
          const angle = (Math.PI / spikes) * j;
          if (j === 0) ctx.moveTo(r * Math.cos(angle), r * Math.sin(angle));
          else ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 当たり判定 (シンプルな矩形/円ハイブリッド判定)
      // プレイヤーは横長の楕円（笹の葉）とみなす
      const dx = item.x - pX;
      const dy = item.y - pY;
      
      // 当たり判定の緩さを調整。笹の葉の横幅半分、縦幅半分に収まっていればヒット
      if (Math.abs(dx) < pW / 2 && Math.abs(dy) < pH / 2 + item.radius * 0.8) {
        if (item.type === 'obstacle') {
          setGameState('gameover');
          return; // ゲームオーバーになったらループ中断
        } else {
          setScore(s => s + 10);
          itemsRef.current.splice(i, 1);
          continue;
        }
      }

      // 画面外に落ちた場合
      if (item.y > canvas.height + item.radius) {
        if (item.type === 'normal') {
          // 通常アイテムを落としたらゲームオーバー
          setGameState('gameover');
          return;
        } else {
          // お邪魔アイテムは落ちてもOK
          itemsRef.current.splice(i, 1);
        }
      }
    }

    // プレイヤー（笹の葉）の描画
    ctx.save();
    ctx.translate(pX, pY);
    ctx.fillStyle = '#2e7d32'; // 笹の色
    ctx.beginPath();
    // 笹の葉っぽい形（2つの2次ベジェ曲線で描く）
    ctx.moveTo(-pW / 2, 0);
    ctx.quadraticCurveTo(0, -pH, pW / 2, 0);
    ctx.quadraticCurveTo(0, pH, -pW / 2, 0);
    ctx.fill();
    
    // 葉脈を描く
    ctx.strokeStyle = '#1b5e20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-pW / 2, 0);
    ctx.lineTo(pW / 2, 0);
    ctx.stroke();
    
    ctx.restore();

  }, [gameState, score]);

  const loop = useCallback((time: number) => {
    if (gameState !== 'playing') {
      frameRef.current = requestAnimationFrame(loop);
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        update(deltaTime, ctx, canvas);
      }
    }

    frameRef.current = requestAnimationFrame(loop);
  }, [gameState, update]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // 画面サイズに合わせる
      const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        playerRef.current.y = window.innerHeight - 100;
        
        // Resize時に再描画が必要であれば行う
        if (gameState !== 'playing') {
          const ctx = canvas.getContext('2d');
          if (ctx) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      };
      
      window.addEventListener('resize', resize);
      resize();

      return () => window.removeEventListener('resize', resize);
    }
  }, [gameState]);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [loop]);

  // タッチ/マウス操作イベント
  const handleMove = (clientX: number) => {
    if (gameState === 'playing') {
      playerRef.current.x = clientX;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX);
  };

  return (
    <div className="game-wrapper" 
      onTouchMove={onTouchMove} 
      onMouseMove={onMouseMove}
    >
      <div className="score-display">Score: {score}</div>
      <canvas ref={canvasRef} className="game-canvas" />

      {gameState === 'start' && (
        <div className="overlay">
          <h1>笹の葉キャッチ</h1>
          <p>スワイプで操作！三角形をキャッチしよう</p>
          <p style={{fontSize: '14px', marginBottom: '30px'}}>※黒いトゲトゲや、取り逃しはゲームオーバー！</p>
          <button onClick={startGame}>スタート</button>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="overlay">
          <h1>Game Over</h1>
          <p>Score: {score}</p>
          <button onClick={startGame}>もう一度プレイ</button>
        </div>
      )}
    </div>
  );
};

export default Game;
