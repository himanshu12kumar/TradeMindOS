import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * InteractiveChart — High-Performance TradingView-Grade Canvas Financial Chart
 * Supports:
 * - 60 FPS Canvas Candlesticks & Volume
 * - Smooth Drag/Pan (horizontal time, vertical price)
 * - Mouse Wheel Zoom centered at cursor
 * - Right Y-Axis Dynamic Price Scale with Grid & Active LTP Marker
 * - Bottom X-Axis Time Scale
 * - Crosshairs with dynamic Y/X pills & Top OHLC Legend
 * - Trading Tools: Cursor/Pan, Trendline, Horizontal Ray, Long Position (R:R), Short Position (R:R), Measure, Clear, Undo, Reset
 * - One-click "Sync to Order Pad" for Long/Short target & stop-loss
 */
export default function InteractiveChart({
  symbol = 'NIFTY 50',
  timeframe = '5m',
  setTimeframe,
  candles = [],
  ltp,
  change = 0,
  changePercent = 0,
  isLoading = false,
  onApplyPositionLevels,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Drawing tools state: 'pointer' | 'trendline' | 'horizontal' | 'long' | 'short' | 'measure'
  const [activeTool, setActiveTool] = useState('pointer');
  const [drawings, setDrawings] = useState([]);
  const [activeDrawing, setActiveDrawing] = useState(null); // in-progress drawing

  // Chart view transform state
  const [candleWidth, setCandleWidth] = useState(9); // pixels per candle body
  const candleGap = 3; // pixels between candles
  const [scrollOffset, setScrollOffset] = useState(0); // horizontal pan in px
  const [priceOffset, setPriceOffset] = useState(0); // vertical pan in px
  const [priceScale, setPriceScale] = useState(1); // vertical zoom factor

  // Interaction tracking
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, scrollOffset: 0, priceOffset: 0, isYAxis: false });
  const [cursorPos, setCursorPos] = useState(null); // { x, y }
  const [hoverCandle, setHoverCandle] = useState(null);
  const [syncToast, setSyncToast] = useState(null); // "{message}"

  // Canvas Layout Dimensions
  const TOOLBAR_WIDTH = 42;
  const Y_AXIS_WIDTH = 74;
  const X_AXIS_HEIGHT = 26;
  const TOP_PADDING = 12;

  // Auto-fit view when symbol or candles change
  useEffect(() => {
    if (candles.length > 0) {
      setCandleWidth(9);
      setPriceOffset(0);
      setPriceScale(1);
      // Align view to show the most recent candles on the right
      const containerWidth = containerRef.current ? containerRef.current.clientWidth : 800;
      const chartWidth = containerWidth - TOOLBAR_WIDTH - Y_AXIS_WIDTH;
      const totalCandleSpan = candles.length * (9 + candleGap);
      const rightPadding = 40; // blank space to right of latest candle
      setScrollOffset(Math.max(0, totalCandleSpan - chartWidth + rightPadding));
    }
  }, [symbol, timeframe, candles.length]);

  // Reset view helper
  const handleResetView = () => {
    if (!candles.length) return;
    setCandleWidth(9);
    setPriceOffset(0);
    setPriceScale(1);
    const containerWidth = containerRef.current ? containerRef.current.clientWidth : 800;
    const chartWidth = containerWidth - TOOLBAR_WIDTH - Y_AXIS_WIDTH;
    const totalCandleSpan = candles.length * (9 + candleGap);
    setScrollOffset(Math.max(0, totalCandleSpan - chartWidth + 40));
  };

  // Convert Price <-> Y Coordinate
  const priceToY = useCallback(
    (price, minP, maxP, chartTop, chartHeight) => {
      const range = (maxP - minP) || 1;
      return chartTop + chartHeight - ((price - minP) / range) * chartHeight;
    },
    []
  );

  const yToPrice = useCallback(
    (y, minP, maxP, chartTop, chartHeight) => {
      const range = (maxP - minP) || 1;
      return minP + ((chartTop + chartHeight - y) / chartHeight) * range;
    },
    []
  );

  // Convert Candle Index <-> X Coordinate
  const indexToX = useCallback(
    (index, chartLeft) => {
      return chartLeft + index * (candleWidth + candleGap) - scrollOffset;
    },
    [candleWidth, candleGap, scrollOffset]
  );

  const xToIndex = useCallback(
    (x, chartLeft) => {
      const relativeX = x - chartLeft + scrollOffset;
      const idx = Math.round(relativeX / (candleWidth + candleGap));
      return Math.max(0, Math.min(idx, candles.length - 1));
    },
    [candleWidth, candleGap, scrollOffset, candles.length]
  );

  // ── Main Canvas Render Function ───────────────────────────────────────────
  const renderChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Clear background
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, width, height);

    const chartLeft = TOOLBAR_WIDTH * dpr;
    const chartRight = width - Y_AXIS_WIDTH * dpr;
    const chartTop = TOP_PADDING * dpr;
    const chartBottom = height - X_AXIS_HEIGHT * dpr;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    if (chartWidth <= 0 || chartHeight <= 0 || !candles.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = `${13 * dpr}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(isLoading ? 'Loading Market Data...' : 'No Chart Data Available', width / 2, height / 2);
      return;
    }

    // 1. Determine visible candle window
    const firstVisibleIdx = Math.max(0, Math.floor(scrollOffset / (candleWidth + candleGap)) - 1);
    const visibleCount = Math.ceil(chartWidth / (candleWidth + candleGap)) + 2;
    const lastVisibleIdx = Math.min(candles.length - 1, firstVisibleIdx + visibleCount);

    const visibleCandles = candles.slice(firstVisibleIdx, lastVisibleIdx + 1);

    // 2. Calculate min and max price with padding & vertical scale
    let rawMinPrice = visibleCandles.length ? Math.min(...visibleCandles.map((c) => c.low)) : 100;
    let rawMaxPrice = visibleCandles.length ? Math.max(...visibleCandles.map((c) => c.high)) : 200;
    if (rawMinPrice === rawMaxPrice) {
      rawMinPrice -= 1;
      rawMaxPrice += 1;
    }

    const priceSpan = (rawMaxPrice - rawMinPrice) * priceScale;
    const midPrice = (rawMaxPrice + rawMinPrice) / 2 + (priceOffset / chartHeight) * priceSpan;
    const minPrice = midPrice - priceSpan * 0.55;
    const maxPrice = midPrice + priceSpan * 0.55;

    // 3. Grid Lines & Right Price Scale
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillStyle = '#64748b';
    ctx.font = `${10 * dpr}px 'Space Grotesk', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const priceStep = (maxPrice - minPrice) / 7;
    for (let i = 0; i <= 7; i++) {
      const p = minPrice + i * priceStep;
      const y = priceToY(p, minPrice, maxPrice, chartTop, chartHeight);

      // Horizontal grid line
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();

      // Right Y-axis tick label
      ctx.fillText(`₹${p.toFixed(2)}`, chartRight + 6 * dpr, y);
    }

    // 4. Volume Bars (bottom 20% of chart)
    const maxVolume = Math.max(...visibleCandles.map((c) => c.volume || 1), 100);
    const volMaxHeight = chartHeight * 0.18;

    for (let i = firstVisibleIdx; i <= lastVisibleIdx; i++) {
      const c = candles[i];
      if (!c) continue;
      const x = chartLeft + i * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
      const vHeight = ((c.volume || 0) / maxVolume) * volMaxHeight;
      const vTop = chartBottom - vHeight;
      const isBull = c.close >= c.open;

      ctx.fillStyle = isBull ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)';
      ctx.fillRect(x, vTop, candleWidth * dpr, vHeight);
    }

    // 5. Candlesticks (Wicks & Bodies)
    for (let i = firstVisibleIdx; i <= lastVisibleIdx; i++) {
      const c = candles[i];
      if (!c) continue;
      const x = chartLeft + i * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
      const isBull = c.close >= c.open;
      const color = isBull ? '#10b981' : '#ef4444';

      const yHigh = priceToY(c.high, minPrice, maxPrice, chartTop, chartHeight);
      const yLow = priceToY(c.low, minPrice, maxPrice, chartTop, chartHeight);
      const yOpen = priceToY(c.open, minPrice, maxPrice, chartTop, chartHeight);
      const yClose = priceToY(c.close, minPrice, maxPrice, chartTop, chartHeight);

      // Draw wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + (candleWidth * dpr) / 2, yHigh);
      ctx.lineTo(x + (candleWidth * dpr) / 2, yLow);
      ctx.stroke();

      // Draw body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(Math.abs(yOpen - yClose), 1.5 * dpr);

      ctx.fillStyle = color;
      ctx.fillRect(x, bodyTop, candleWidth * dpr, bodyHeight);
    }

    // 6. Active Live Price (LTP) Marker Line
    const activeLTP = ltp || (candles.length ? candles[candles.length - 1].close : null);
    if (activeLTP) {
      const ltpY = priceToY(activeLTP, minPrice, maxPrice, chartTop, chartHeight);
      const isUp = change >= 0;
      const ltpColor = isUp ? '#10b981' : '#ef4444';

      // Dashed horizontal ray
      ctx.strokeStyle = ltpColor;
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(chartLeft, ltpY);
      ctx.lineTo(chartRight, ltpY);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      // LTP badge on right Y-axis
      ctx.fillStyle = ltpColor;
      const badgeH = 18 * dpr;
      const badgeW = Y_AXIS_WIDTH * dpr - 4 * dpr;
      ctx.fillRect(chartRight + 2 * dpr, ltpY - badgeH / 2, badgeW, badgeH);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${10 * dpr}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`₹${activeLTP.toFixed(2)}`, chartRight + 6 * dpr, ltpY);
    }

    // 7. Time Axis (Bottom) Grid & Labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    const timeInterval = Math.max(5, Math.floor(visibleCount / 6));
    ctx.fillStyle = '#64748b';
    ctx.font = `${9 * dpr}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = firstVisibleIdx; i <= lastVisibleIdx; i += timeInterval) {
      const c = candles[i];
      if (!c) continue;
      const x = chartLeft + i * (candleWidth + candleGap) * dpr - scrollOffset * dpr + (candleWidth * dpr) / 2;

      // Vertical tick mark
      ctx.beginPath();
      ctx.moveTo(x, chartBottom);
      ctx.lineTo(x, chartBottom + 4 * dpr);
      ctx.stroke();

      // Timestamp formatting
      const date = new Date(c.time * 1000 || c.time);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      ctx.fillText(timeStr, x, chartBottom + 6 * dpr);
    }

    // 8. Render Saved Drawings
    const allDrawings = [...drawings, ...(activeDrawing ? [activeDrawing] : [])];

    allDrawings.forEach((d) => {
      if (d.type === 'trendline') {
        const x1 = chartLeft + d.i1 * (candleWidth + candleGap) * dpr - scrollOffset * dpr + (candleWidth * dpr) / 2;
        const y1 = priceToY(d.p1, minPrice, maxPrice, chartTop, chartHeight);
        const x2 = chartLeft + d.i2 * (candleWidth + candleGap) * dpr - scrollOffset * dpr + (candleWidth * dpr) / 2;
        const y2 = priceToY(d.p2, minPrice, maxPrice, chartTop, chartHeight);

        ctx.strokeStyle = d.color || '#38bdf8';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // End anchor dots
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x1, y1, 3.5 * dpr, 0, Math.PI * 2);
        ctx.arc(x2, y2, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'horizontal') {
        const y = priceToY(d.price, minPrice, maxPrice, chartTop, chartHeight);
        ctx.strokeStyle = d.color || '#f59e0b';
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tag label
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(chartRight + 2 * dpr, y - 8 * dpr, 68 * dpr, 16 * dpr);
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${9 * dpr}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(`₹${d.price.toFixed(2)}`, chartRight + 5 * dpr, y);
      } else if (d.type === 'long' || d.type === 'short') {
        const x = chartLeft + d.index * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
        const boxWidth = Math.max(90 * dpr, (candleWidth + candleGap) * 12 * dpr);

        const yEntry = priceToY(d.entry, minPrice, maxPrice, chartTop, chartHeight);
        const yTarget = priceToY(d.target, minPrice, maxPrice, chartTop, chartHeight);
        const yStop = priceToY(d.stop, minPrice, maxPrice, chartTop, chartHeight);

        // Profit Green Zone
        const profitTop = Math.min(yEntry, yTarget);
        const profitHeight = Math.abs(yEntry - yTarget);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fillRect(x, profitTop, boxWidth, profitHeight);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.2 * dpr;
        ctx.strokeRect(x, profitTop, boxWidth, profitHeight);

        // Loss Red Zone
        const lossTop = Math.min(yEntry, yStop);
        const lossHeight = Math.abs(yEntry - yStop);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.fillRect(x, lossTop, boxWidth, lossHeight);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.2 * dpr;
        ctx.strokeRect(x, lossTop, boxWidth, lossHeight);

        // Entry middle line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, yEntry);
        ctx.lineTo(x + boxWidth, yEntry);
        ctx.stroke();

        // Risk to Reward Badge
        const targetDiff = Math.abs(d.target - d.entry);
        const stopDiff = Math.abs(d.entry - d.stop) || 0.01;
        const rrRatio = (targetDiff / stopDiff).toFixed(2);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(x + 6 * dpr, yEntry - 12 * dpr, 92 * dpr, 24 * dpr);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.strokeRect(x + 6 * dpr, yEntry - 12 * dpr, 92 * dpr, 24 * dpr);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${9 * dpr}px Inter, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(`R:R 1 : ${rrRatio}`, x + 12 * dpr, yEntry);
      } else if (d.type === 'measure') {
        const x1 = chartLeft + d.i1 * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
        const y1 = priceToY(d.p1, minPrice, maxPrice, chartTop, chartHeight);
        const x2 = chartLeft + d.i2 * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
        const y2 = priceToY(d.p2, minPrice, maxPrice, chartTop, chartHeight);

        const mLeft = Math.min(x1, x2);
        const mTop = Math.min(y1, y2);
        const mW = Math.abs(x2 - x1);
        const mH = Math.abs(y2 - y1);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.fillRect(mLeft, mTop, mW, mH);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.strokeRect(mLeft, mTop, mW, mH);
        ctx.setLineDash([]);

        const priceDelta = d.p2 - d.p1;
        const pctDelta = ((priceDelta / (d.p1 || 1)) * 100).toFixed(2);
        const bars = Math.abs(d.i2 - d.i1);

        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${9 * dpr}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`Δ₹${priceDelta.toFixed(2)} (${pctDelta}%) • ${bars} bars`, mLeft + mW / 2, mTop - 6 * dpr);
      }
    });

    // 9. Interactive Crosshair & Cursor Readout
    if (cursorPos && cursorPos.x >= chartLeft && cursorPos.x <= chartRight && cursorPos.y >= chartTop && cursorPos.y <= chartBottom) {
      const cx = cursorPos.x;
      const cy = cursorPos.y;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);

      // Vertical crosshair
      ctx.beginPath();
      ctx.moveTo(cx, chartTop);
      ctx.lineTo(cx, chartBottom);
      ctx.stroke();

      // Horizontal crosshair
      ctx.beginPath();
      ctx.moveTo(chartLeft, cy);
      ctx.lineTo(chartRight, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floating Price Pill on Right Y-Axis
      const curPrice = yToPrice(cy, minPrice, maxPrice, chartTop, chartHeight);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(chartRight + 2 * dpr, cy - 8 * dpr, 68 * dpr, 16 * dpr);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${9 * dpr}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`₹${curPrice.toFixed(2)}`, chartRight + 5 * dpr, cy);

      // Floating Time Pill on Bottom X-Axis
      const curIdx = xToIndex(cx, chartLeft);
      if (candles[curIdx]) {
        const d = new Date(candles[curIdx].time * 1000 || candles[curIdx].time);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cx - 36 * dpr, chartBottom + 2 * dpr, 72 * dpr, 16 * dpr);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(cx - 36 * dpr, chartBottom + 2 * dpr, 72 * dpr, 16 * dpr);
        ctx.fillStyle = '#93c5fd';
        ctx.font = `bold ${9 * dpr}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, cx, chartBottom + 13 * dpr);
      }
    }

    // 10. Left Toolbar Divider Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(chartLeft, 0);
    ctx.lineTo(chartLeft, height);
    ctx.stroke();

    // Right Axis Divider Line
    ctx.beginPath();
    ctx.moveTo(chartRight, 0);
    ctx.lineTo(chartRight, height);
    ctx.stroke();
  }, [
    candles,
    candleWidth,
    candleGap,
    scrollOffset,
    priceOffset,
    priceScale,
    drawings,
    activeDrawing,
    cursorPos,
    isLoading,
    ltp,
    change,
    priceToY,
    yToPrice,
    xToIndex,
  ]);

  // Sync canvas dimensions with container & DPR
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      renderChart();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderChart]);

  // Request redraw whenever dependencies update
  useEffect(() => {
    renderChart();
  }, [renderChart]);

  // ── Mouse & Wheel Interaction Handlers ────────────────────────────────────

  const handleWheel = (e) => {
    e.preventDefault();
    const dpr = window.devicePixelRatio || 1;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Zoom in or out centered at cursor position
    const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;
    setCandleWidth((prev) => {
      const next = Math.max(3, Math.min(36, prev * zoomDelta));
      return next;
    });
  };

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;

    const chartLeft = TOOLBAR_WIDTH * dpr;
    const chartRight = canvas.width - Y_AXIS_WIDTH * dpr;
    const isYAxis = x > chartRight;

    if (activeTool === 'pointer') {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollOffset,
        priceOffset,
        priceScale,
        isYAxis,
      };
    } else if (activeTool === 'trendline') {
      const idx = xToIndex(x, chartLeft);
      const curPrice = yToPrice(y, 100, 200, TOP_PADDING * dpr, canvas.height - (TOP_PADDING + X_AXIS_HEIGHT) * dpr);
      if (!activeDrawing) {
        setActiveDrawing({ type: 'trendline', i1: idx, p1: curPrice, i2: idx, p2: curPrice });
      } else {
        setDrawings((prev) => [...prev, { ...activeDrawing, i2: idx, p2: curPrice }]);
        setActiveDrawing(null);
        setActiveTool('pointer');
      }
    } else if (activeTool === 'horizontal') {
      const curPrice = yToPrice(y, 100, 200, TOP_PADDING * dpr, canvas.height - (TOP_PADDING + X_AXIS_HEIGHT) * dpr);
      setDrawings((prev) => [...prev, { type: 'horizontal', price: curPrice }]);
      setActiveTool('pointer');
    } else if (activeTool === 'long') {
      const idx = xToIndex(x, chartLeft);
      const entry = yToPrice(y, 100, 200, TOP_PADDING * dpr, canvas.height - (TOP_PADDING + X_AXIS_HEIGHT) * dpr);
      const target = entry * 1.015; // default +1.5%
      const stop = entry * 0.992; // default -0.8%
      const newPos = { type: 'long', index: idx, entry, target, stop };
      setDrawings((prev) => [...prev, newPos]);
      setActiveTool('pointer');

      // Sync to Order Pad
      if (onApplyPositionLevels) {
        onApplyPositionLevels(Number(stop.toFixed(2)), Number(target.toFixed(2)));
        setSyncToast(`Long Setup Placed! SL: ₹${stop.toFixed(2)} | Target: ₹${target.toFixed(2)} applied to Order Pad.`);
        setTimeout(() => setSyncToast(null), 4000);
      }
    } else if (activeTool === 'short') {
      const idx = xToIndex(x, chartLeft);
      const entry = yToPrice(y, 100, 200, TOP_PADDING * dpr, canvas.height - (TOP_PADDING + X_AXIS_HEIGHT) * dpr);
      const target = entry * 0.985; // default -1.5%
      const stop = entry * 1.008; // default +0.8%
      const newPos = { type: 'short', index: idx, entry, target, stop };
      setDrawings((prev) => [...prev, newPos]);
      setActiveTool('pointer');

      // Sync to Order Pad
      if (onApplyPositionLevels) {
        onApplyPositionLevels(Number(stop.toFixed(2)), Number(target.toFixed(2)));
        setSyncToast(`Short Setup Placed! SL: ₹${stop.toFixed(2)} | Target: ₹${target.toFixed(2)} applied to Order Pad.`);
        setTimeout(() => setSyncToast(null), 4000);
      }
    } else if (activeTool === 'measure') {
      const idx = xToIndex(x, chartLeft);
      const curPrice = yToPrice(y, 100, 200, TOP_PADDING * dpr, canvas.height - (TOP_PADDING + X_AXIS_HEIGHT) * dpr);
      if (!activeDrawing) {
        setActiveDrawing({ type: 'measure', i1: idx, p1: curPrice, i2: idx, p2: curPrice });
      } else {
        setDrawings((prev) => [...prev, { ...activeDrawing, i2: idx, p2: curPrice }]);
        setActiveDrawing(null);
        setActiveTool('pointer');
      }
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    const chartLeft = TOOLBAR_WIDTH * dpr;

    setCursorPos({ x, y });

    // Update hovered candle info for top legend
    const idx = xToIndex(x, chartLeft);
    if (candles[idx]) {
      setHoverCandle(candles[idx]);
    }

    // Handle Active Drawing Drag-preview
    if (activeDrawing) {
      const curPrice = yToPrice(y, 100, 200, TOP_PADDING * dpr, canvas.height - (TOP_PADDING + X_AXIS_HEIGHT) * dpr);
      setActiveDrawing((prev) => ({ ...prev, i2: idx, p2: curPrice }));
      return;
    }

    // Handle Drag Pan
    if (isDragging) {
      const deltaX = (e.clientX - dragStartRef.current.x) * dpr;
      const deltaY = (e.clientY - dragStartRef.current.y) * dpr;

      if (dragStartRef.current.isYAxis) {
        // Dragging right price axis vertically scales the price range
        const scaleDelta = 1 + deltaY * 0.005;
        setPriceScale(Math.max(0.2, Math.min(5, dragStartRef.current.priceScale * scaleDelta)));
      } else {
        // Panning chart horizontally and vertically
        setScrollOffset(dragStartRef.current.scrollOffset - deltaX);
        setPriceOffset(dragStartRef.current.priceOffset - deltaY);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setCursorPos(null);
    setHoverCandle(null);
  };

  // Drawing Management Actions
  const handleUndo = () => {
    setDrawings((prev) => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setDrawings([]);
    setActiveDrawing(null);
  };

  // Display Candle stats (Hovered or latest)
  const displayCandle = hoverCandle || (candles.length ? candles[candles.length - 1] : null);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: '#070b14',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* ─── 1. TOP HEADER & OHLC LEGEND BAR ──────────────────────────── */}
      <div
        style={{
          height: '42px',
          background: 'rgba(11, 17, 33, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '0.78rem',
          zIndex: 10,
        }}
      >
        {/* Left: Active Symbol & OHLC readout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#f8fafc', letterSpacing: '-0.01em' }}>
              {symbol}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
              }}
            >
              {timeframe}
            </span>
          </div>

          {displayCandle && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem' }} className="hide-on-mobile">
              <span style={{ color: '#64748b' }}>
                O: <b style={{ color: '#cbd5e1' }}>₹{displayCandle.open?.toFixed(2)}</b>
              </span>
              <span style={{ color: '#64748b' }}>
                H: <b style={{ color: '#34d399' }}>₹{displayCandle.high?.toFixed(2)}</b>
              </span>
              <span style={{ color: '#64748b' }}>
                L: <b style={{ color: '#f87171' }}>₹{displayCandle.low?.toFixed(2)}</b>
              </span>
              <span style={{ color: '#64748b' }}>
                C: <b style={{ color: displayCandle.close >= displayCandle.open ? '#34d399' : '#f87171' }}>
                  ₹{displayCandle.close?.toFixed(2)}
                </b>
              </span>
              {displayCandle.volume && (
                <span style={{ color: '#64748b' }}>
                  Vol: <b style={{ color: '#94a3b8' }}>{displayCandle.volume.toLocaleString()}</b>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Timeframes & Reset View Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Timeframe selector */}
          <div
            style={{
              display: 'flex',
              gap: '2px',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '2px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {['1m', '5m', '15m', '1h', '1D'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe && setTimeframe(tf)}
                style={{
                  padding: '3px 7px',
                  borderRadius: '4px',
                  border: 'none',
                  background: timeframe === tf ? '#2563eb' : 'transparent',
                  color: timeframe === tf ? '#ffffff' : '#94a3b8',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Reset View Button */}
          <button
            onClick={handleResetView}
            title="Auto-fit and center recent candles"
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>🎯</span> Fit
          </button>
        </div>
      </div>

      {/* ─── 2. MAIN CANVAS AREA WITH LEFT TOOLBAR ──────────────────────── */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        {/* Left Drawing Tools Vertical Strip */}
        <div
          style={{
            width: `${TOOLBAR_WIDTH}px`,
            background: 'rgba(9, 14, 26, 0.95)',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 0',
            gap: '6px',
            zIndex: 10,
          }}
        >
          {[
            { id: 'pointer', icon: '✋', label: 'Pan / Cursor' },
            { id: 'trendline', icon: '📈', label: 'Trendline' },
            { id: 'horizontal', icon: '➖', label: 'Horizontal Ray' },
            { id: 'long', icon: '🟢', label: 'Long Position (R:R)' },
            { id: 'short', icon: '🔴', label: 'Short Position (R:R)' },
            { id: 'measure', icon: '📏', label: 'Measure (Price & %)' },
          ].map((tool) => (
            <button
              key={tool.id}
              onClick={() => {
                setActiveTool(tool.id);
                setActiveDrawing(null);
              }}
              title={tool.label}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                border: activeTool === tool.id ? '1px solid #3b82f6' : '1px solid transparent',
                background: activeTool === tool.id ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                color: activeTool === tool.id ? '#ffffff' : '#94a3b8',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              {tool.icon}
            </button>
          ))}

          <div style={{ width: '20px', height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

          {/* Undo Action */}
          <button
            onClick={handleUndo}
            title="Undo last drawing"
            disabled={drawings.length === 0}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: drawings.length > 0 ? '#94a3b8' : '#334155',
              fontSize: '0.82rem',
              cursor: drawings.length > 0 ? 'pointer' : 'default',
            }}
          >
            ↩️
          </button>

          {/* Clear All Action */}
          <button
            onClick={handleClearAll}
            title="Clear all drawings"
            disabled={drawings.length === 0}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: drawings.length > 0 ? '#f87171' : '#334155',
              fontSize: '0.82rem',
              cursor: drawings.length > 0 ? 'pointer' : 'default',
            }}
          >
            🗑️
          </button>
        </div>

        {/* The HTML5 Interactive Canvas */}
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{
            flex: 1,
            height: '100%',
            cursor:
              activeTool === 'pointer'
                ? isDragging
                  ? 'grabbing'
                  : 'crosshair'
                : 'crosshair',
          }}
        />

        {/* Sync Toast Notification */}
        {syncToast && (
          <div
            style={{
              position: 'absolute',
              bottom: '36px',
              left: '56px',
              background: 'rgba(16, 185, 129, 0.95)',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚡</span> {syncToast}
          </div>
        )}
      </div>
    </div>
  );
}
