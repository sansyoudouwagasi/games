import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Game.css';

type GameState = 'start' | 'playing' | 'gameover';

interface FallingItem {
  id: number;
  x: number;
  baseX: number;
  y: number;
  type: 'normal' | 'obstacle';
  color: string;
  speed: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  swayOffset: number;
}

interface CatchEffect {
  offsetX: number;
  offsetY: number;
  time: number;
  duration: number;
  color: string;
}

const NORMAL_COLORS = ['#7b3c3c', '#4caf50', '#ff9800']; // 小豆色, 緑色, オレンジ色
const OBSTACLE_COLOR = '#111111'; // お邪魔アイテム（黒系）
const PLAYER_WIDTH = 100;
const PLAYER_HEIGHT = 120;

// 画像アセットのロードと透過処理
const playerImg = new Image();
playerImg.src = '/wagashi_ojisan.png';
let processedImg: HTMLCanvasElement | HTMLImageElement = playerImg;

playerImg.onload = () => {
  const offscreen = document.createElement('canvas');
  offscreen.width = playerImg.width;
  offscreen.height = playerImg.height;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return;
  
  ctx.drawImage(playerImg, 0, 0);
  const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // 白（および白に近い色）を透明にする
    if (r > 240 && g > 240 && b > 240) {
      data[i + 3] = 0; // Alphaを0に
    }
  }
  ctx.putImageData(imageData, 0, 0);
  processedImg = offscreen;
};

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('start');
  const [score, setScore] = useState(0);

  const playerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight - 150 });
  const itemsRef = useRef<FallingItem[]>([]);
  const effectsRef = useRef<CatchEffect[]>([]); // エフェクト用キュー
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const itemIdCounter = useRef<number>(0);

  const startGame = () => {
    setGameState('playing');
    setScore(0);
    itemsRef.current = [];
    effectsRef.current = [];
    playerRef.current.x = window.innerWidth / 2;
    playerRef.current.y = window.innerHeight - 150;
    itemIdCounter.current = 0;
    lastTimeRef.current = performance.now();
  };

  const spawnItem = (canvasWidth: number) => {
    const isObstacle = Math.random() < 0.2; // 20%の確率でお邪魔アイテム
    let radius = 20 + Math.random() * 10; // 基本サイズ20~30
    if (!isObstacle) {
      radius *= 2; // 三色のオブジェクトは2倍の大きさにする
    }
    const color = isObstacle ? OBSTACLE_COLOR : NORMAL_COLORS[Math.floor(Math.random() * NORMAL_COLORS.length)];
    const speed = 2 + Math.random() * 3 + (score / 100); // スコアに応じて少しずつ速くなる
    const startX = radius + Math.random() * (canvasWidth - radius * 2);
    
    itemsRef.current.push({
      id: itemIdCounter.current++,
      x: startX,
      baseX: startX,
      y: -radius,
      type: isObstacle ? 'obstacle' : 'normal',
      color,
      speed,
      radius,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      swayOffset: Math.random() * Math.PI * 2
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
    const currentTimeSec = performance.now() / 1000;
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      item.y += item.speed * (deltaTime / 16); // フレームレート非依存
      
      if (item.type === 'normal') {
        // ゆらゆら動く処理（振幅40px、周期にオフセット）
        item.x = item.baseX + Math.sin(currentTimeSec * 2.5 + item.swayOffset) * 50;
      }

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
      const dx = item.x - pX;
      const dy = item.y - pY;
      
      // 当たり判定の緩さを調整。キャラクターの横幅半分、縦幅半分に収まっていればヒット
      if (Math.abs(dx) < pW / 2.5 && Math.abs(dy) < pH / 2 + item.radius * 0.8) {
        if (item.type === 'obstacle') {
          setGameState('gameover');
          return; // ゲームオーバーになったらループ中断
        } else {
          setScore(s => s + 10);
          
          // キャッチエフェクトを追加
          effectsRef.current.push({
            offsetX: dx,
            offsetY: dy,
            time: 0,
            duration: 1350, // 350ms(包む) + 1000ms(表示)
            color: item.color
          });

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

    // プレイヤー（おじさん）の描画
    ctx.save();
    ctx.translate(pX, pY);
    if (playerImg.complete) {
      // 透過処理済みの画像（またはCanvas）を描画
      ctx.drawImage(processedImg, -pW / 2, -pH / 2, pW, pH);
    } else {
      ctx.fillStyle = '#2e7d32'; // プレースホルダー色
      ctx.fillRect(-pW / 2, -pH / 2, pW, pH);
    }
    ctx.restore();

    // キャッチエフェクト（笹で包むアニメーション等）の描画
    for (let i = effectsRef.current.length - 1; i >= 0; i--) {
      const effect = effectsRef.current[i];
      effect.time += deltaTime;
      if (effect.time > effect.duration) {
        effectsRef.current.splice(i, 1);
        continue;
      }
      
      const WRAP_TIME = 350; // 包むまでの時間
      
      if (effect.time < WRAP_TIME) {
        // --- 1. 包み込むアニメーション ---
        const progress = effect.time / WRAP_TIME; // 0 to 1
        const effX = pX + effect.offsetX;
        const effY = pY + effect.offsetY;
        
        ctx.save();
        ctx.translate(effX, effY);
        
        // キャッチされた三角形が縮みながら消える
        ctx.save();
        const scale = 1 - progress; // 1から0へ縮小
        ctx.scale(scale, scale);
        ctx.fillStyle = effect.color;
        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.lineTo(30 * 0.866, 30 * 0.5);
        ctx.lineTo(-30 * 0.866, 30 * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // 左右から笹の葉が合わさって包み込む（大きめ）
        ctx.fillStyle = '#2e7d32'; // 笹の緑
        ctx.strokeStyle = '#1b5e20';
        ctx.lineWidth = 2;
        
        ctx.save();
        const leftAngle = -(Math.PI / 4) * (1 - progress) + (Math.PI / 10) * progress; 
        ctx.rotate(leftAngle);
        ctx.beginPath();
        ctx.ellipse(-30 + progress * 25, 0, 40, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        const rightAngle = (Math.PI / 4) * (1 - progress) - (Math.PI / 10) * progress;
        ctx.rotate(rightAngle);
        ctx.beginPath();
        ctx.ellipse(30 - progress * 25, 0, 40, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        
        ctx.restore();
      } else {
        // --- 2. 頭の上に完成した笹の三角形と文字を表示 ---
        const showTime = effect.time - WRAP_TIME;
        const showDuration = effect.duration - WRAP_TIME;
        // 最後200msでフェードアウト
        const alpha = showTime > showDuration - 200 ? (showDuration - showTime) / 200 : 1;
        
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        
        const headX = pX;
        const headY = pY - pH / 2 - 40; // 頭の少し上
        ctx.translate(headX, headY);
        
        // 笹の三角形（ちまき風）
        ctx.fillStyle = '#2e7d32';
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(25 * 0.866, 25 * 0.5);
        ctx.lineTo(-25 * 0.866, 25 * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1b5e20';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 文字の決定
        let text = "";
        if (effect.color === '#7b3c3c') text = "小豆";
        else if (effect.color === '#4caf50') text = "抹茶";
        else if (effect.color === '#ff9800') text = "甘夏";
        
        if (text) {
          ctx.fillStyle = effect.color; 
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.strokeStyle = 'white'; // 白い縁取りで見やすく
          ctx.lineWidth = 4;
          ctx.strokeText(text, 0, -35); 
          ctx.fillText(text, 0, -35);
        }
        
        ctx.restore();
      }
    }

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
        playerRef.current.y = window.innerHeight - 150;
        
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
