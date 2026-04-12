import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [uiParams, setUiParams] = useState({ poreSize: 20, porosity: 50, gradient: 0 });
  const [activeParams, setActiveParams] = useState({ poreSize: 20, porosity: 50, gradient: 0 });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState('準備中');
  
  const [metrics, setMetrics] = useState({ caScore: 0, flushEff: 0, accumulated: 0 });
  const [zoneStats, setZoneStats] = useState([0, 0, 0, 0, 0, 0, 0]);

  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const poresRef = useRef([]); 
  const particlesRef = useRef([]); 
  const cycleFrameRef = useRef(0);

  const togglePlay = () => {
    if (!isPlaying) {
      setActiveParams({ ...uiParams });
      particlesRef.current = [];
      setMetrics({ caScore: 0, flushEff: 100, accumulated: 0 });
      setZoneStats([0, 0, 0, 0, 0, 0, 0]);
      cycleFrameRef.current = 0;
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;
    const zoneWidth = width / 7;
    const newPores = [];
    const newZoneRadii = [];

    for (let i = 0; i < 7; i++) {
      const radius = Math.max(3, activeParams.poreSize + (i - 3) * (activeParams.gradient * 3));
      newZoneRadii.push(radius);

      const zoneArea = zoneWidth * height;
      const targetVoidArea = zoneArea * (activeParams.porosity / 100);
      const singlePoreArea = Math.PI * radius * radius;
      const basePoreCount = Math.floor(targetVoidArea / singlePoreArea);

      const visualRadius = radius / 3; 
      const visualPoreCount = Math.min(1000, basePoreCount * 3); 

      for (let j = 0; j < visualPoreCount; j++) {
        newPores.push({
          x: (i * zoneWidth) + Math.random() * zoneWidth,
          y: Math.random() * height,
          r: visualRadius * (0.8 + Math.random() * 0.4)
        });
      }
    }
    poresRef.current = { pores: newPores, zoneRadii: newZoneRadii };

    const r0 = newZoneRadii[0];
    const ca = Math.max(0.1, (50 / r0) * (1 - activeParams.porosity/200));
    setMetrics(prev => ({ ...prev, caScore: ca.toFixed(2) }));

  }, [activeParams]);

  useEffect(() => {
    if (!isPlaying) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const zoneWidth = width / 7;

    const render = () => {
      ctx.fillStyle = '#222222';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#add8e6';
      poresRef.current.pores.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      cycleFrameRef.current = (cycleFrameRef.current + 1) % 250;
      const isPhase1 = cycleFrameRef.current < 50;
      
      if (cycleFrameRef.current === 0) setPhase('晶圓接觸階段 (捕捉中)');
      if (cycleFrameRef.current === 50) setPhase('內部高壓沖水 (清洗中)');

      if (isPhase1 && cycleFrameRef.current % 3 === 0) {
        const caMultiplier = parseFloat(metrics.caScore);
        const spawnCount = 1 + Math.floor(caMultiplier * 2); 
        
        for(let k=0; k<spawnCount; k++) {
          particlesRef.current.push({
            x: 0,
            y: Math.random() * height,
            vx: 1.5 + Math.random(),
            isStuck: false,
            zone: 0
          });
        }
      }

      let currentStuck = 0;
      let newZoneStats = [0,0,0,0,0,0,0];

      // 微粒狀態更新與物理邏輯
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        let p = particlesRef.current[i];
        const currentZoneIndex = Math.min(6, Math.max(0, Math.floor(p.x / zoneWidth)));
        p.zone = currentZoneIndex;
        const currentZoneRadius = poresRef.current.zoneRadii[currentZoneIndex];

        if (isPhase1) {
          // --- 階段一：捕捉與擠壓 ---
          if (!p.isStuck) {
            // 有機率卡死
            if (currentZoneRadius < 25 && Math.random() < (25 - currentZoneRadius) / 100) {
               p.isStuck = true;
            }
            // 沒卡死則繼續向右進入深層
            if (!p.isStuck) {
              p.x += p.vx;
              p.x += (currentZoneRadius / 20);
            }
          }
        } else {
          // --- 階段二：水流沖刷 ---
          // 【全新機制】脫附效應：如果已經卡死了，持續的水流有機率把它沖開
          if (p.isStuck) {
            // 孔徑越大，水流量越大，沖開機率越高。這是每幀的機率，所以設很小以產生漸進感
            const dislodgeProb = (currentZoneRadius / 25) * 0.015; 
            if (Math.random() < dislodgeProb) {
              p.isStuck = false; // 成功脫附！
            }
          }

          // 沒有卡死（或剛好被沖開）的微粒，向左快速排出
          if (!p.isStuck) {
            p.x -= (2.5 + currentZoneRadius / 15);
          }
        }

        // 移除被成功沖洗出左邊界（離開泡棉）的微粒
        if (p.x < 0 && !isPhase1) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        // 繪製紅點
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // 統計目前仍在卡死狀態的數量
        if (p.isStuck) {
          currentStuck++;
          newZoneStats[p.zone]++;
        }
      }

      if (cycleFrameRef.current % 10 === 0) {
         setMetrics(prev => ({
           ...prev,
           accumulated: currentStuck,
           flushEff: Math.max(0, 100 - (currentStuck / Math.max(1, particlesRef.current.length)) * 100).toFixed(1)
         }));
         setZoneStats(newZoneStats);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, metrics.caScore]);

  return (
    <div className="app-container">
      <header className="top-bar">
        <h2>PVA 泡沫微粒累積模擬器 v2</h2>
        <div className="metrics-group">
          <div className="metric">
            <span>晶圓清洗能力</span>
            <strong style={{color: '#1a73e8'}}>{metrics.caScore}</strong>
          </div>
          <div className="metric">
            <span>整體沖刷效率</span>
            <strong style={{color: metrics.flushEff > 50 ? '#34a853' : '#ea4335'}}>{metrics.flushEff}%</strong>
          </div>
          <div className="metric">
            <span>累積殘留微粒</span>
            <strong style={{color: '#ea4335'}}>{metrics.accumulated}</strong>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="canvas-wrapper">
          <div className="zone-labels">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="zone-label">區 {i}</div>
            ))}
          </div>
          <canvas ref={canvasRef} width={700} height={300} className="sim-canvas"></canvas>
          <div className={`status-banner ${phase.includes('捕捉') ? 'capture' : 'flush'}`}>
            {isPlaying ? phase : '已停止 - 調整參數後按開始'}
          </div>
        </div>

        <div className="control-panel">
          <button className={`play-btn ${isPlaying ? 'stop' : 'start'}`} onClick={togglePlay}>
            {isPlaying ? '⏹ 停止並調整參數' : '▶ 開始模擬'}
          </button>

          <div className="sliders">
             <div className="slider-row">
               <label>平均孔徑大小: <strong>{uiParams.poreSize}</strong></label>
               <input type="range" min="10" max="25" value={uiParams.poreSize} 
                 onChange={e => setUiParams({...uiParams, poreSize: Number(e.target.value)})} 
                 disabled={isPlaying} />
             </div>
             <div className="slider-row">
               <label>孔隙率 (%): <strong>{uiParams.porosity}</strong></label>
               <input type="range" min="20" max="80" value={uiParams.porosity} 
                 onChange={e => setUiParams({...uiParams, porosity: Number(e.target.value)})} 
                 disabled={isPlaying} />
             </div>
             <div className="slider-row">
               <label>孔隙梯度 (左至右): <strong>{uiParams.gradient > 0 ? `+${uiParams.gradient}` : uiParams.gradient}</strong></label>
               <input type="range" min="-4" max="4" step="1" value={uiParams.gradient} 
                 onChange={e => setUiParams({...uiParams, gradient: Number(e.target.value)})} 
                 disabled={isPlaying} />
               <small style={{display:'block', marginTop:'5px', color:'#666'}}>
                 (+4: 外小內大, -4: 外大內小, 0: 均勻)
               </small>
             </div>
          </div>
        </div>
      </div>

      <div className="histogram-panel">
        <h3>各區域微粒累積直方圖</h3>
        <div className="bars-container">
          {zoneStats.map((count, idx) => {
            const barHeight = Math.min(100, (count / 200) * 100); 
            return (
              <div key={idx} className="bar-wrapper">
                <div className="bar-value">{count}</div>
                <div className="bar-bg">
                  <div className="bar-fill" style={{height: `${barHeight}%`}}></div>
                </div>
                <div className="bar-label">區 {idx + 1}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;