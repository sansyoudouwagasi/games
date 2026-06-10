import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Game.css';

type GameState = 'start' | 'howToPlay' | 'playing' | 'gameover';

interface FallingItem {
  id: number;
  x: number;
  baseX: number;
  y: number;
  type: 'normal' | 'obstacle' | 'help';
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
const processImageTransparent = (img: HTMLImageElement): Promise<HTMLCanvasElement | HTMLImageElement> => {
  return new Promise((resolve) => {
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = img.width;
      offscreen.height = img.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) { resolve(img); return; }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(offscreen);
    };
    img.onerror = () => resolve(img);
  });
};

const playerImg = new Image();
playerImg.src = '/mario_ojisan.png';
let processedImg: HTMLCanvasElement | HTMLImageElement = playerImg;
processImageTransparent(playerImg).then(c => processedImg = c);

const playerCatchImg = new Image();
playerCatchImg.src = '/mario_ojisan_catch.png';
let processedCatchImg: HTMLCanvasElement | HTMLImageElement = playerCatchImg;
processImageTransparent(playerCatchImg).then(c => processedCatchImg = c);

const yunomiImg = new Image();
yunomiImg.src = '/yunomi.png';
let processedYunomiImg: HTMLCanvasElement | HTMLImageElement = yunomiImg;
processImageTransparent(yunomiImg).then(c => processedYunomiImg = c);

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('start');

  const gameStateRef = useRef<GameState>('start');
  const scoreRef = useRef<number>(0);

  const playerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight - 150 });
  const itemsRef = useRef<FallingItem[]>([]);
  const effectsRef = useRef<CatchEffect[]>([]); // エフェクト用キュー
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const itemIdCounter = useRef<number>(0);
  const catchPoseTimerRef = useRef<number>(0);
  const slowDownTimerRef = useRef<number>(0);
  
  // Audio Context
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgmOscillatorsRef = useRef<OscillatorNode[]>([]);
  const bgmGainRef = useRef<GainNode | null>(null);

  // Audio Context の初期化 (ユーザーアクション時に呼ぶ)
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playCatchSound = (type: 'normal' | 'help') => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'normal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.2);
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  };

  const startSlowMotionMusic = () => {
    if (!audioCtxRef.current) return;
    stopSlowMotionMusic(); // 既に鳴っていれば止める
    
    const ctx = audioCtxRef.current;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.2; // 全体の音量
    masterGain.connect(ctx.destination);
    bgmGainRef.current = masterGain;

    // Fmaj7 のような和音でリラックスした空間を演出
    const frequencies = [349.23, 440.00, 523.25, 659.25]; // F, A, C, E
    const oscs: OscillatorNode[] = [];
    
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq + (i * 0.5); 
      
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.5 + (i * 0.1); // ゆっくりとした揺らぎ
      
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 10; 
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      
      osc.connect(masterGain);
      osc.start();
      lfo.start();
      
      oscs.push(osc, lfo);
    });
    
    bgmOscillatorsRef.current = oscs;
  };

  const stopSlowMotionMusic = () => {
    if (bgmGainRef.current && audioCtxRef.current) {
      bgmGainRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 1.0);
    }
    setTimeout(() => {
      bgmOscillatorsRef.current.forEach(osc => {
        try { osc.stop(); } catch(e) {}
      });
      bgmOscillatorsRef.current = [];
      if (bgmGainRef.current) {
        bgmGainRef.current.disconnect();
        bgmGainRef.current = null;
      }
    }, 1100);
  };

  const changeGameState = (state: GameState) => {
    gameStateRef.current = state;
    setGameState(state);
  };

  const startGame = () => {
    initAudio();
    stopSlowMotionMusic();
    changeGameState('playing');
    scoreRef.current = 0;
    const scoreBoard = document.getElementById('score-board');
    if (scoreBoard) scoreBoard.innerText = 'Score: 0';

    itemsRef.current = [];
    effectsRef.current = [];
    playerRef.current.x = window.innerWidth / 2;
    playerRef.current.y = window.innerHeight - 150;
    itemIdCounter.current = 0;
    slowDownTimerRef.current = 0;
    lastTimeRef.current = performance.now();
  };

  const spawnItem = (canvasWidth: number) => {
    // 速度が上がってきたらお助けアイテムが出やすくなる。最大5%
    const currentScore = scoreRef.current;
    const helpChance = Math.min(0.05, currentScore / 5000); 
    const r = Math.random();
    
    const isSlow = slowDownTimerRef.current > 0;
    let type: 'normal' | 'obstacle' | 'help' = 'normal';
    if (r < helpChance) {
      type = 'help';
    } else if (!isSlow && r < helpChance + 0.2) {
      type = 'obstacle';
    }
    
    let radius = 20 + Math.random() * 10; // 基本サイズ20~30
    if (type === 'normal') radius *= 2; // 三色のオブジェクトは2倍の大きさにする
    if (type === 'help') radius *= 1.5; // 湯飲みは少し大きめ
    
    const color = type === 'obstacle' ? OBSTACLE_COLOR : (type === 'help' ? '#8bc34a' : NORMAL_COLORS[Math.floor(Math.random() * NORMAL_COLORS.length)]);
    const speed = 2 + Math.random() * 3 + (currentScore / 100); // スコアに応じて少しずつ速くなる
    const startX = radius + Math.random() * (canvasWidth - radius * 2);
    
    itemsRef.current.push({
      id: itemIdCounter.current++,
      x: startX,
      baseX: startX,
      y: -radius,
      type: type,
      color,
      speed,
      radius,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      swayOffset: Math.random() * Math.PI * 2
    });
  };

  const update = useCallback((deltaTime: number, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (gameStateRef.current !== 'playing') return;

    // 画面クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // アイテム生成
    spawnTimerRef.current += deltaTime;
    const spawnInterval = Math.max(500, 1500 - scoreRef.current * 5); // だんだん生成間隔を短くする
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
    
    // スローダウンタイマーの更新
    if (slowDownTimerRef.current > 0) {
      slowDownTimerRef.current -= deltaTime;
      if (slowDownTimerRef.current <= 0) {
        stopSlowMotionMusic();
      }
    }
    const isSlow = slowDownTimerRef.current > 0;
    const speedMultiplier = isSlow ? 0.4 : 1.0;

    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      item.y += (item.speed * speedMultiplier) * (deltaTime / 16); // フレームレート非依存
      
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
      } else if (item.type === 'obstacle') {
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
      } else if (item.type === 'help') {
        // 湯飲み茶碗を描画
        if (yunomiImg.complete) {
          ctx.drawImage(processedYunomiImg, -item.radius, -item.radius, item.radius * 2, item.radius * 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 当たり判定 (シンプルな矩形/円ハイブリッド判定)
      const dx = item.x - pX;
      const dy = item.y - pY;
      
      // 当たり判定の緩さを調整。キャラクターの横幅半分、縦幅半分に収まっていればヒット
      if (Math.abs(dx) < pW / 2.5 && Math.abs(dy) < pH / 2 + item.radius * 0.8) {
        if (item.type === 'obstacle') {
          stopSlowMotionMusic();
          changeGameState('gameover');
          return; // ゲームオーバーになったらループ中断
        } else if (item.type === 'help') {
          playCatchSound('help');
          startSlowMotionMusic();
          scoreRef.current += 50; // 湯飲みのボーナススコア
          const scoreBoard = document.getElementById('score-board');
          if (scoreBoard) scoreBoard.innerText = `Score: ${scoreRef.current}`;

          slowDownTimerRef.current = 10000; // 10秒間スローダウン
          catchPoseTimerRef.current = 500;
          itemsRef.current.splice(i, 1);
          continue;
        } else {
          playCatchSound('normal');
          scoreRef.current += 10;
          const scoreBoard = document.getElementById('score-board');
          if (scoreBoard) scoreBoard.innerText = `Score: ${scoreRef.current}`;
          
          // キャッチポーズのタイマーをセット
          catchPoseTimerRef.current = 500;
          
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
          stopSlowMotionMusic();
          changeGameState('gameover');
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
    
    // キャッチポーズのタイマー更新
    if (catchPoseTimerRef.current > 0) {
      catchPoseTimerRef.current -= deltaTime;
    }

    if (catchPoseTimerRef.current > 0) {
      if (playerCatchImg.complete) {
        ctx.drawImage(processedCatchImg, -pW / 2, -pH / 2, pW, pH);
      } else {
        ctx.fillStyle = '#ffeb3b'; // プレースホルダー色
        ctx.fillRect(-pW / 2, -pH / 2, pW, pH);
      }
    } else {
      if (playerImg.complete) {
        // 透過処理済みの画像（またはCanvas）を描画
        ctx.drawImage(processedImg, -pW / 2, -pH / 2, pW, pH);
      } else {
        ctx.fillStyle = '#2e7d32'; // プレースホルダー色
        ctx.fillRect(-pW / 2, -pH / 2, pW, pH);
      }
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

    // スローモーション効果のバー描画
    if (slowDownTimerRef.current > 0) {
      const barWidth = 300;
      const barHeight = 20;
      const progress = Math.max(0, slowDownTimerRef.current / 10000);
      const currentWidth = barWidth * progress;
      const barX = canvas.width / 2 - barWidth / 2;
      const barY = 60; // スコアの下あたり

      // 背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      // バー（緑色）
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(barX, barY, currentWidth, barHeight);

      // テキスト
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Slow Motion!', canvas.width / 2, barY + barHeight / 2);
    }

  }, []);

  const loop = useCallback((time: number) => {
    if (gameStateRef.current !== 'playing') {
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
        if (gameStateRef.current !== 'playing') {
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
  }, []);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [loop]);

  // タッチ/マウス操作イベント
  const handleMove = (clientX: number) => {
    if (gameStateRef.current === 'playing') {
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
      <div id="score-board" className="score-display">Score: {scoreRef.current}</div>
      <canvas ref={canvasRef} className="game-canvas" />

      {gameState === 'start' && (
        <div className="overlay">
          <h1>博多水無月ゲーム</h1>
          <p>スワイプで操作！博多水無月をキャッチしよう</p>
          <button onClick={startGame}>スタート</button>
          <button onClick={() => changeGameState('howToPlay')} style={{ marginTop: '15px', backgroundColor: '#2196f3' }}>遊び方</button>
        </div>
      )}

      {gameState === 'howToPlay' && (
        <div className="overlay" style={{ padding: '20px' }}>
          <div style={{ 
            maxWidth: '400px', 
            maxHeight: '85vh', 
            overflowY: 'auto', 
            backgroundColor: 'rgba(0,0,0,0.8)', 
            padding: '20px', 
            borderRadius: '12px',
            textAlign: 'left'
          }}>
            <h2 style={{ textAlign: 'center', marginBottom: '20px', fontSize: '28px' }}>遊び方</h2>
            <ul style={{ lineHeight: '1.8', fontSize: '16px', paddingLeft: '20px', margin: 0 }}>
              <li style={{ marginBottom: '10px' }}><strong>博多水無月（三角形）</strong><br/>キャッチするとスコア+10。小豆、抹茶、甘夏が落ちてきます。</li>
              <li style={{ marginBottom: '10px' }}><strong>お邪魔アイテム（黒い星）</strong><br/>キャッチしてしまうとゲームオーバー！</li>
              <li style={{ marginBottom: '10px' }}><strong>お茶（湯飲み茶碗）</strong><br/>お助けアイテム。ボーナス50点と、<strong>10秒間スローモーションになり、お邪魔アイテムが落ちてこなくなります！</strong></li>
              <li><strong>取り逃がし</strong><br/>博多水無月を画面外に落とすとゲームオーバーです（お邪魔は落としてOK）。</li>
            </ul>
            <div style={{ textAlign: 'center', marginTop: '20px', paddingBottom: '10px' }}>
              <button onClick={() => changeGameState('start')} style={{ backgroundColor: '#ff9800' }}>タイトルへ戻る</button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="overlay">
          <h1>Game Over</h1>
          <p>Score: {scoreRef.current}</p>
          <button onClick={startGame}>もう一度プレイ</button>
        </div>
      )}
    </div>
  );
};

export default Game;
