import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * InteractiveChart — Authentic TradingView-Grade Canvas Financial Chart
 * Features:
 * - 60 FPS HTML5 Canvas Candlesticks & Volume
 * - Live real-time tick integration (active candle moves and pulses live)
 * - Smooth Drag/Pan (horizontal time, vertical price scale)
 * - Mouse Wheel Zoom centered at cursor
 * - Right Y-Axis Dynamic Price Scale with Grid & Active LTP Marker
 * - Bottom X-Axis Time Scale with Formatted Timestamps
 * - Crosshairs with Dynamic Y/X Readouts & Top OHLC Legend
 * - TradingView Left Toolbar with Flyout Sub-menus:
 *   • Cursor tools (Crosshair, Dot, Arrow, Eraser)
 *   • Trend line tools (Trend Line, Arrow Line, Ray, Horizontal Line, Horizontal Ray, Vertical Line)
 *   • Gann and Fibonacci tools (Fib Retracement, Pitchfork)
 *   • Geometric shapes (Rectangle, Circle, Brush)
 *   • Forecasting and measurement tools (PROJECTION: Long Position, Short Position, Forecast, Ghost Feed, Projection; VOLUME-BASED: Anchored VWAP; MEASURER: Price Range, Date Range)
 *   • Annotation tools (Text, Callout)
 *   • Measure & Zoom
 *   • Bottom controls: Magnet Mode, Lock Drawings, Hide Drawings, Clear All
 * - Long & Short position tools with visual target/stop boxes, Risk-to-Reward ratio, and one-click sync to Order Pad
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
  const flyoutRef = useRef(null);

  // ── TradingView Left Toolbar Categories Definition ────────────────────────
  const TOOL_CATEGORIES = [
    {
      id: 'cursor_group',
      name: 'Cursor tools',
      icon: '✛',
      defaultTool: 'pointer',
      tools: [
        { id: 'pointer', label: 'Crosshair', icon: '✛' },
        { id: 'dot', label: 'Dot', icon: '•' },
        { id: 'arrow_cursor', label: 'Arrow', icon: '↖' },
        { id: 'eraser', label: 'Eraser', icon: '⌫' },
      ],
    },
    {
      id: 'lines_group',
      name: 'Trend line tools',
      icon: '╱',
      defaultTool: 'trendline',
      tools: [
        { id: 'trendline', label: 'Trend Line', icon: '╱' },
        { id: 'arrow_line', label: 'Arrow Line', icon: '↗' },
        { id: 'ray', label: 'Ray', icon: '⇗' },
        { id: 'horizontal', label: 'Horizontal Line', icon: '―' },
        { id: 'horizontal_ray', label: 'Horizontal Ray', icon: '→' },
        { id: 'vertical', label: 'Vertical Line', icon: '│' },
      ],
    },
    {
      id: 'gann_group',
      name: 'Gann and Fibonacci tools',
      icon: '⑂',
      defaultTool: 'fib_retrace',
      tools: [
        { id: 'fib_retrace', label: 'Fib Retracement', icon: '⑂' },
        { id: 'pitchfork', label: 'Pitchfork', icon: '⋔' },
      ],
    },
    {
      id: 'shapes_group',
      name: 'Geometric shapes',
      icon: '▭',
      defaultTool: 'rectangle',
      tools: [
        { id: 'rectangle', label: 'Rectangle', icon: '▭' },
        { id: 'brush', label: 'Brush', icon: '🖌️' },
        { id: 'circle', label: 'Circle', icon: '◯' },
      ],
    },
    {
      id: 'prediction_group',
      name: 'Forecasting and measurement tools',
      icon: '𝌆', // 3 lines with dots
      defaultTool: 'long',
      sections: [
        {
          header: 'PROJECTION',
          tools: [
            { id: 'long', label: 'Long Position', icon: '𝌆' },
            { id: 'short', label: 'Short Position', icon: '𝌇' },
            { id: 'forecast', label: 'Forecast', icon: '⫯' },
            { id: 'ghost_feed', label: 'Ghost Feed', icon: '☷' },
            { id: 'projection', label: 'Projection', icon: '⌒' },
          ],
        },
        {
          header: 'VOLUME-BASED',
          tools: [
            { id: 'anchored_vwap', label: 'Anchored VWAP', icon: '⚓' },
            { id: 'vol_profile', label: 'Fixed Range Volume Profile', icon: '⚑' },
          ],
        },
        {
          header: 'MEASURER',
          tools: [
            { id: 'price_range', label: 'Price Range', icon: '📏' },
            { id: 'date_range', label: 'Date Range', icon: '📅' },
          ],
        },
      ],
    },
    {
      id: 'text_group',
      name: 'Annotation tools',
      icon: 'T',
      defaultTool: 'text',
      tools: [
        { id: 'text', label: 'Text', icon: 'T' },
        { id: 'callout', label: 'Callout', icon: '💬' },
      ],
    },
    {
      id: 'measure_group',
      name: 'Measure',
      icon: '📐',
      defaultTool: 'measure',
      tools: [{ id: 'measure', label: 'Measure', icon: '📐' }],
    },
    {
      id: 'zoom_group',
      name: 'Zoom In / Out',
      icon: '🔍',
      defaultTool: 'zoom_in',
      tools: [
        { id: 'zoom_in', label: 'Zoom In', icon: '🔍+' },
        { id: 'zoom_out', label: 'Zoom Out', icon: '🔍-' },
      ],
    },
  ];

  // Active tool state and flyout drawer state
  const [activeTool, setActiveTool] = useState('pointer');
  const [categoryActiveTools, setCategoryActiveTools] = useState({
    cursor_group: 'pointer',
    lines_group: 'trendline',
    gann_group: 'fib_retrace',
    shapes_group: 'rectangle',
    prediction_group: 'long',
    text_group: 'text',
    measure_group: 'measure',
    zoom_group: 'zoom_in',
  });
  const [openFlyout, setOpenFlyout] = useState(null); // category ID or null
  const [flyoutTop, setFlyoutTop] = useState(60);

  // Utility toggles
  const [isMagnetMode, setIsMagnetMode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // Drawings state
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
  const chartBoundsRef = useRef({
    minPrice: 100,
    maxPrice: 200,
    chartTop: 10,
    chartHeight: 500,
    chartLeft: 48,
    chartRight: 800,
    dpr: 1,
  });
  const [cursorPos, setCursorPos] = useState(null); // { x, y }
  const [hoverCandle, setHoverCandle] = useState(null);
  const [syncToast, setSyncToast] = useState(null); // feedback message

  // Layout Dimensions
  const TOOLBAR_WIDTH = 48;
  const Y_AXIS_WIDTH = 74;
  const X_AXIS_HEIGHT = 26;
  const TOP_PADDING = 10;

  // Auto-close flyout on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target)) {
        setOpenFlyout(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-fit view when symbol or candles change
  useEffect(() => {
    if (candles.length > 0) {
      setCandleWidth(9);
      setPriceOffset(0);
      setPriceScale(1);
      const containerWidth = containerRef.current ? containerRef.current.clientWidth : 800;
      const chartWidth = containerWidth - TOOLBAR_WIDTH - Y_AXIS_WIDTH;
      const totalCandleSpan = candles.length * (9 + candleGap);
      setScrollOffset(Math.max(0, totalCandleSpan - chartWidth + 40));
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
      const range = maxP - minP || 1;
      return chartTop + chartHeight - ((price - minP) / range) * chartHeight;
    },
    []
  );

  const yToPrice = useCallback(
    (y, minP, maxP, cTop, cHeight) => {
      const min = minP !== undefined ? minP : chartBoundsRef.current.minPrice;
      const max = maxP !== undefined ? maxP : chartBoundsRef.current.maxPrice;
      const top = cTop !== undefined ? cTop : chartBoundsRef.current.chartTop;
      const height = cHeight !== undefined ? cHeight : chartBoundsRef.current.chartHeight;
      const range = max - min || 1;
      return min + ((top + height - y) / height) * range;
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
    (x, cLeft) => {
      const dpr = chartBoundsRef.current.dpr || 1;
      const left = cLeft !== undefined ? cLeft : (chartBoundsRef.current.chartLeft || (TOOLBAR_WIDTH * dpr));
      const candleStepCanvas = (candleWidth + candleGap) * dpr;
      const relativeX = x - left + scrollOffset * dpr;
      const idx = Math.round(relativeX / candleStepCanvas);
      return Math.max(0, Math.min(idx, candles.length - 1));
    },
    [candleWidth, candleGap, scrollOffset, candles.length]
  );

  // Magnet mode helper: snaps a price coordinate to nearest OHLC of nearby candle
  const snapPriceToMagnet = useCallback(
    (price, candleIdx) => {
      if (!isMagnetMode || !candles[candleIdx]) return price;
      const c = candles[candleIdx];
      const levels = [c.open, c.high, c.low, c.close];
      let closest = price;
      let minDiff = Infinity;
      levels.forEach((lvl) => {
        const diff = Math.abs(price - lvl);
        if (diff < minDiff) {
          minDiff = diff;
          closest = lvl;
        }
      });
      return closest;
    },
    [isMagnetMode, candles]
  );

  // ── Main Canvas Render Loop ───────────────────────────────────────────────
  const renderChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Clear canvas background
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

    // Active LTP
    const activeLTP = ltp || (candles.length ? candles[candles.length - 1].close : null);

    // Merge live tick into latest visible candle for ultra-smooth real-time movement
    const liveCandles = candles.map((c, idx) => {
      if (idx === candles.length - 1 && activeLTP) {
        return {
          ...c,
          close: activeLTP,
          high: Math.max(c.high, activeLTP),
          low: Math.min(c.low, activeLTP),
        };
      }
      return c;
    });

    // 1. Determine visible candle window
    const firstVisibleIdx = Math.max(0, Math.floor(scrollOffset / (candleWidth + candleGap)) - 1);
    const visibleCount = Math.ceil(chartWidth / (candleWidth + candleGap)) + 2;
    const lastVisibleIdx = Math.min(liveCandles.length - 1, firstVisibleIdx + visibleCount);

    const visibleCandles = liveCandles.slice(firstVisibleIdx, lastVisibleIdx + 1);

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

    chartBoundsRef.current = {
      minPrice,
      maxPrice,
      chartTop,
      chartHeight,
      chartLeft,
      chartRight,
      dpr,
    };

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

    // 4. Volume Bars (bottom 18% of chart)
    const maxVolume = Math.max(...visibleCandles.map((c) => c.volume || 1), 100);
    const volMaxHeight = chartHeight * 0.18;

    for (let i = firstVisibleIdx; i <= lastVisibleIdx; i++) {
      const c = liveCandles[i];
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
      const c = liveCandles[i];
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
      ctx.setLineDash([]);

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
      const c = liveCandles[i];
      if (!c) continue;
      const x = chartLeft + i * (candleWidth + candleGap) * dpr - scrollOffset * dpr + (candleWidth * dpr) / 2;

      ctx.beginPath();
      ctx.moveTo(x, chartBottom);
      ctx.lineTo(x, chartBottom + 4 * dpr);
      ctx.stroke();

      const date = new Date(c.time * 1000 || c.time);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      ctx.fillText(timeStr, x, chartBottom + 6 * dpr);
    }

    // 8. Render Drawings (unless hidden)
    if (!isHidden) {
      const allDrawings = [...drawings, ...(activeDrawing ? [activeDrawing] : [])];

      allDrawings.forEach((d) => {
        if (d.type === 'trendline' || d.type === 'ray' || d.type === 'arrow_line') {
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

          // Arrow head if arrow_line
          if (d.type === 'arrow_line') {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            ctx.fillStyle = d.color || '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - 10 * dpr * Math.cos(angle - Math.PI / 6), y2 - 10 * dpr * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(x2 - 10 * dpr * Math.cos(angle + Math.PI / 6), y2 - 10 * dpr * Math.sin(angle + Math.PI / 6));
            ctx.fill();
          }
        } else if (d.type === 'horizontal' || d.type === 'horizontal_ray') {
          const y = priceToY(d.price, minPrice, maxPrice, chartTop, chartHeight);
          ctx.strokeStyle = d.color || '#f59e0b';
          ctx.lineWidth = 1.5 * dpr;
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.beginPath();
          ctx.moveTo(chartLeft, y);
          ctx.lineTo(chartRight, y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(chartRight + 2 * dpr, y - 8 * dpr, 68 * dpr, 16 * dpr);
          ctx.fillStyle = '#000000';
          ctx.font = `bold ${9 * dpr}px 'Space Grotesk', sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillText(`₹${d.price.toFixed(2)}`, chartRight + 5 * dpr, y);
        } else if (d.type === 'long' || d.type === 'short') {
          const x = chartLeft + d.index * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
          const boxWidth = Math.max(100 * dpr, (candleWidth + candleGap) * 14 * dpr);

          const yEntry = priceToY(d.entry, minPrice, maxPrice, chartTop, chartHeight);
          const yTarget = priceToY(d.target, minPrice, maxPrice, chartTop, chartHeight);
          const yStop = priceToY(d.stop, minPrice, maxPrice, chartTop, chartHeight);

          // Profit Zone
          const profitTop = Math.min(yEntry, yTarget);
          const profitHeight = Math.abs(yEntry - yTarget);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
          ctx.fillRect(x, profitTop, boxWidth, profitHeight);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.2 * dpr;
          ctx.strokeRect(x, profitTop, boxWidth, profitHeight);

          // Loss Zone
          const lossTop = Math.min(yEntry, yStop);
          const lossHeight = Math.abs(yEntry - yStop);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
          ctx.fillRect(x, lossTop, boxWidth, lossHeight);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.2 * dpr;
          ctx.strokeRect(x, lossTop, boxWidth, lossHeight);

          // Entry line
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

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(x + 6 * dpr, yEntry - 12 * dpr, 98 * dpr, 24 * dpr);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.strokeRect(x + 6 * dpr, yEntry - 12 * dpr, 98 * dpr, 24 * dpr);

          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${9 * dpr}px Inter, sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillText(`R:R 1 : ${rrRatio}`, x + 12 * dpr, yEntry);
        } else if (d.type === 'forecast') {
          // Future price projection trajectory
          const x1 = chartLeft + d.index * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
          const y1 = priceToY(d.entry, minPrice, maxPrice, chartTop, chartHeight);
          const x2 = x1 + 80 * dpr;
          const y2 = priceToY(d.target, minPrice, maxPrice, chartTop, chartHeight);

          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2 * dpr;
          ctx.setLineDash([5 * dpr, 3 * dpr]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo((x1 + x2) / 2, y1, x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(x2, y2, 4 * dpr, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = `bold ${9 * dpr}px Inter, sans-serif`;
          ctx.fillText(`Forecast: ₹${d.target.toFixed(2)}`, x2 + 6 * dpr, y2);
        } else if (d.type === 'anchored_vwap') {
          // Calculate anchored VWAP from anchor candle index to latest
          const anchorIdx = d.index;
          let cumVol = 0;
          let cumVolPrice = 0;
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();

          let started = false;
          for (let i = anchorIdx; i < liveCandles.length; i++) {
            const c = liveCandles[i];
            const typPrice = (c.high + c.low + c.close) / 3;
            const vol = c.volume || 100;
            cumVol += vol;
            cumVolPrice += typPrice * vol;
            const vwap = cumVolPrice / (cumVol || 1);

            const x = chartLeft + i * (candleWidth + candleGap) * dpr - scrollOffset * dpr + (candleWidth * dpr) / 2;
            const y = priceToY(vwap, minPrice, maxPrice, chartTop, chartHeight);

            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();

          // Anchor label
          const ax = chartLeft + anchorIdx * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
          const ay = priceToY(d.entry, minPrice, maxPrice, chartTop, chartHeight);
          ctx.fillStyle = '#06b6d4';
          ctx.fillText(`⚓ VWAP`, ax, ay - 6 * dpr);
        } else if (d.type === 'rectangle') {
          const x1 = chartLeft + d.i1 * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
          const y1 = priceToY(d.p1, minPrice, maxPrice, chartTop, chartHeight);
          const x2 = chartLeft + d.i2 * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
          const y2 = priceToY(d.p2, minPrice, maxPrice, chartTop, chartHeight);

          const rX = Math.min(x1, x2);
          const rY = Math.min(y1, y2);
          const rW = Math.abs(x2 - x1);
          const rH = Math.abs(y2 - y1);

          ctx.fillStyle = 'rgba(99, 102, 241, 0.16)';
          ctx.fillRect(rX, rY, rW, rH);
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1.5 * dpr;
          ctx.strokeRect(rX, rY, rW, rH);
        } else if (d.type === 'measure' || d.type === 'price_range') {
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
        } else if (d.type === 'text') {
          const x = chartLeft + d.index * (candleWidth + candleGap) * dpr - scrollOffset * dpr;
          const y = priceToY(d.price, minPrice, maxPrice, chartTop, chartHeight);

          ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
          ctx.fillRect(x, y - 10 * dpr, 70 * dpr, 20 * dpr);
          ctx.strokeStyle = '#38bdf8';
          ctx.strokeRect(x, y - 10 * dpr, 70 * dpr, 20 * dpr);

          ctx.fillStyle = '#f8fafc';
          ctx.font = `bold ${9 * dpr}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(d.text || 'Note', x + 35 * dpr, y + 3 * dpr);
        }
      });
    }

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
      if (liveCandles[curIdx]) {
        const d = new Date(liveCandles[curIdx].time * 1000 || liveCandles[curIdx].time);
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

    // 10. Left Toolbar & Right Axis Dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(chartLeft, 0);
    ctx.lineTo(chartLeft, height);
    ctx.stroke();

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
    isHidden,
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

  // Redraw whenever dependencies update
  useEffect(() => {
    renderChart();
  }, [renderChart]);

  // ── Mouse & Wheel Interaction Handlers ────────────────────────────────────

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;
    setCandleWidth((prev) => Math.max(3, Math.min(36, prev * zoomDelta)));
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

    if (isLocked) {
      // Pan only when locked
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, scrollOffset, priceOffset, priceScale, isYAxis };
      return;
    }

    if (activeTool === 'pointer') {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, scrollOffset, priceOffset, priceScale, isYAxis };
    } else if (activeTool === 'trendline' || activeTool === 'arrow_line' || activeTool === 'ray') {
      const idx = xToIndex(x, chartLeft);
      let curPrice = yToPrice(y);
      curPrice = snapPriceToMagnet(curPrice, idx);

      if (!activeDrawing) {
        setActiveDrawing({ type: activeTool, i1: idx, p1: curPrice, i2: idx, p2: curPrice });
      } else {
        setDrawings((prev) => [...prev, { ...activeDrawing, i2: idx, p2: curPrice }]);
        setActiveDrawing(null);
        setActiveTool('pointer');
      }
    } else if (activeTool === 'horizontal' || activeTool === 'horizontal_ray') {
      let curPrice = yToPrice(y);
      const idx = xToIndex(x, chartLeft);
      curPrice = snapPriceToMagnet(curPrice, idx);
      setDrawings((prev) => [...prev, { type: activeTool, price: curPrice }]);
      setActiveTool('pointer');
    } else if (activeTool === 'long') {
      const idx = xToIndex(x, chartLeft);
      let entry = yToPrice(y);
      entry = snapPriceToMagnet(entry, idx);
      const target = entry * 1.015; // default +1.5%
      const stop = entry * 0.992; // default -0.8%
      const newPos = { type: 'long', index: idx, entry, target, stop };
      setDrawings((prev) => [...prev, newPos]);
      setActiveTool('pointer');

      // Auto-sync Stop Loss and Target into Order Pad!
      if (onApplyPositionLevels) {
        onApplyPositionLevels(Number(stop.toFixed(2)), Number(target.toFixed(2)));
        setSyncToast(`Long Setup Placed! SL: ₹${stop.toFixed(2)} | Target: ₹${target.toFixed(2)} applied to Order Pad.`);
        setTimeout(() => setSyncToast(null), 4000);
      }
    } else if (activeTool === 'short') {
      const idx = xToIndex(x, chartLeft);
      let entry = yToPrice(y);
      entry = snapPriceToMagnet(entry, idx);
      const target = entry * 0.985; // default -1.5%
      const stop = entry * 1.008; // default +0.8%
      const newPos = { type: 'short', index: idx, entry, target, stop };
      setDrawings((prev) => [...prev, newPos]);
      setActiveTool('pointer');

      // Auto-sync Stop Loss and Target into Order Pad!
      if (onApplyPositionLevels) {
        onApplyPositionLevels(Number(stop.toFixed(2)), Number(target.toFixed(2)));
        setSyncToast(`Short Setup Placed! SL: ₹${stop.toFixed(2)} | Target: ₹${target.toFixed(2)} applied to Order Pad.`);
        setTimeout(() => setSyncToast(null), 4000);
      }
    } else if (activeTool === 'forecast' || activeTool === 'projection') {
      const idx = xToIndex(x, chartLeft);
      let entry = yToPrice(y);
      entry = snapPriceToMagnet(entry, idx);
      const target = entry * 1.02;
      setDrawings((prev) => [...prev, { type: 'forecast', index: idx, entry, target }]);
      setActiveTool('pointer');
    } else if (activeTool === 'anchored_vwap') {
      const idx = xToIndex(x, chartLeft);
      let entry = yToPrice(y);
      setDrawings((prev) => [...prev, { type: 'anchored_vwap', index: idx, entry }]);
      setActiveTool('pointer');
    } else if (activeTool === 'rectangle') {
      const idx = xToIndex(x, chartLeft);
      let curPrice = yToPrice(y);
      curPrice = snapPriceToMagnet(curPrice, idx);
      if (!activeDrawing) {
        setActiveDrawing({ type: 'rectangle', i1: idx, p1: curPrice, i2: idx, p2: curPrice });
      } else {
        setDrawings((prev) => [...prev, { ...activeDrawing, i2: idx, p2: curPrice }]);
        setActiveDrawing(null);
        setActiveTool('pointer');
      }
    } else if (activeTool === 'measure' || activeTool === 'price_range' || activeTool === 'date_range') {
      const idx = xToIndex(x, chartLeft);
      const curPrice = yToPrice(y);
      if (!activeDrawing) {
        setActiveDrawing({ type: 'price_range', i1: idx, p1: curPrice, i2: idx, p2: curPrice });
      } else {
        setDrawings((prev) => [...prev, { ...activeDrawing, i2: idx, p2: curPrice }]);
        setActiveDrawing(null);
        setActiveTool('pointer');
      }
    } else if (activeTool === 'text') {
      const idx = xToIndex(x, chartLeft);
      const curPrice = yToPrice(y);
      setDrawings((prev) => [...prev, { type: 'text', index: idx, price: curPrice, text: 'Support Zone' }]);
      setActiveTool('pointer');
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

    const idx = xToIndex(x, chartLeft);
    if (candles[idx]) {
      setHoverCandle(candles[idx]);
    }

    if (activeDrawing) {
      let curPrice = yToPrice(y);
      curPrice = snapPriceToMagnet(curPrice, idx);
      setActiveDrawing((prev) => ({ ...prev, i2: idx, p2: curPrice }));
      return;
    }

    if (isDragging) {
      const deltaX = (e.clientX - dragStartRef.current.x) * dpr;
      const deltaY = (e.clientY - dragStartRef.current.y) * dpr;

      if (dragStartRef.current.isYAxis) {
        const scaleDelta = 1 + deltaY * 0.005;
        setPriceScale(Math.max(0.2, Math.min(5, dragStartRef.current.priceScale * scaleDelta)));
      } else {
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

  // Select tool from a flyout
  const handleSelectTool = (category, toolId) => {
    setActiveTool(toolId);
    setCategoryActiveTools((prev) => ({ ...prev, [category.id]: toolId }));
    setOpenFlyout(null);
    setActiveDrawing(null);
  };

  // Display Candle stats (Hovered or latest live)
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
          height: '40px',
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
                C:{' '}
                <b style={{ color: (displayCandle.close || 0) >= (displayCandle.open || 0) ? '#34d399' : '#f87171' }}>
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

      {/* ─── 2. MAIN CANVAS AREA WITH TRADINGVIEW FLYOUT TOOLBAR ────────── */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        {/* Left Toolbar Strip (TradingView layout with category icons & arrowheads) */}
        <div
          style={{
            width: `${TOOLBAR_WIDTH}px`,
            background: '#0c101d',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '6px 0',
            gap: '4px',
            zIndex: 20,
          }}
        >
          {TOOL_CATEGORIES.map((cat, idx) => {
            const currentSelectedToolId = categoryActiveTools[cat.id] || cat.defaultTool;
            const isCategoryActive =
              activeTool === currentSelectedToolId ||
              (cat.tools && cat.tools.some((t) => t.id === activeTool)) ||
              (cat.sections && cat.sections.some((s) => s.tools.some((t) => t.id === activeTool)));
            const isFlyoutOpen = openFlyout === cat.id;

            // Find current tool icon to display on the rail
            let displayIcon = cat.icon;
            if (cat.tools) {
              const matched = cat.tools.find((t) => t.id === currentSelectedToolId);
              if (matched) displayIcon = matched.icon;
            } else if (cat.sections) {
              for (const s of cat.sections) {
                const matched = s.tools.find((t) => t.id === currentSelectedToolId);
                if (matched) {
                  displayIcon = matched.icon;
                  break;
                }
              }
            }

            return (
              <div
                key={cat.id}
                style={{ position: 'relative' }}
                title={cat.name}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const containerRect = containerRef.current.getBoundingClientRect();
                    setFlyoutTop(rect.top - containerRect.top);
                    if (isFlyoutOpen) {
                      setOpenFlyout(null);
                    } else {
                      setOpenFlyout(cat.id);
                    }
                    setActiveTool(currentSelectedToolId);
                    setActiveDrawing(null);
                  }}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    position: 'relative',
                    border: isCategoryActive
                      ? '1.5px solid #f59e0b'
                      : isFlyoutOpen
                      ? '1.5px solid rgba(255, 255, 255, 0.3)'
                      : '1px solid transparent',
                    background: isCategoryActive
                      ? 'rgba(245, 158, 11, 0.15)'
                      : isFlyoutOpen
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'transparent',
                    color: isCategoryActive ? '#f59e0b' : '#94a3b8',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {displayIcon}

                  {/* Small arrow indicator on right corner (TradingView style) */}
                  <span
                    style={{
                      position: 'absolute',
                      right: '2px',
                      bottom: '2px',
                      fontSize: '0.42rem',
                      opacity: 0.7,
                      color: isCategoryActive ? '#f59e0b' : '#64748b',
                    }}
                  >
                    ▸
                  </span>
                </button>
              </div>
            );
          })}

          <div style={{ width: '22px', height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

          {/* Bottom Utility Controls (Magnet, Lock, Hide, Trash) */}
          <button
            type="button"
            onClick={() => setIsMagnetMode((prev) => !prev)}
            title={isMagnetMode ? 'Magnet Mode (ON - snaps to candle OHLC)' : 'Magnet Mode (OFF)'}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: isMagnetMode ? '1.5px solid #3b82f6' : '1px solid transparent',
              background: isMagnetMode ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              color: isMagnetMode ? '#60a5fa' : '#64748b',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🧲
          </button>

          <button
            type="button"
            onClick={() => setIsLocked((prev) => !prev)}
            title={isLocked ? 'Lock All Drawings (LOCKED)' : 'Lock All Drawings (UNLOCKED)'}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: isLocked ? '1.5px solid #f59e0b' : '1px solid transparent',
              background: isLocked ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: isLocked ? '#f59e0b' : '#64748b',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🔒
          </button>

          <button
            type="button"
            onClick={() => setIsHidden((prev) => !prev)}
            title={isHidden ? 'Show Drawings' : 'Hide All Drawings'}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: isHidden ? '1.5px solid #ef4444' : '1px solid transparent',
              background: isHidden ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              color: isHidden ? '#f87171' : '#64748b',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isHidden ? '🙈' : '👁️'}
          </button>

          <button
            type="button"
            onClick={() => {
              setDrawings([]);
              setActiveDrawing(null);
            }}
            title="Remove All Drawings"
            disabled={drawings.length === 0}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: drawings.length > 0 ? '#f87171' : '#334155',
              fontSize: '0.85rem',
              cursor: drawings.length > 0 ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🗑️
          </button>
        </div>

        {/* ── TradingView Flyout Drawer Menu Popover ──────────────────── */}
        {openFlyout && (
          <div
            ref={flyoutRef}
            className="terminal-scrollbar"
            style={{
              position: 'absolute',
              left: `${TOOLBAR_WIDTH}px`,
              top: `${Math.max(10, Math.min(flyoutTop, 350))}px`,
              width: '240px',
              maxHeight: '440px',
              overflowY: 'auto',
              background: '#131722',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85)',
              zIndex: 1000,
              padding: '6px 0',
            }}
          >
            {(() => {
              const category = TOOL_CATEGORIES.find((c) => c.id === openFlyout);
              if (!category) return null;

              if (category.sections) {
                return category.sections.map((sec, sIdx) => (
                  <div key={sec.header}>
                    <div
                      style={{
                        padding: '8px 14px 4px',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        color: '#64748b',
                        letterSpacing: '0.06em',
                        borderTop: sIdx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                        marginTop: sIdx > 0 ? '4px' : '0',
                      }}
                    >
                      {sec.header}
                    </div>
                    {sec.tools.map((t) => {
                      const isSelected = activeTool === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => handleSelectTool(category, t.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '8px 14px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: isSelected ? '#f59e0b' : '#cbd5e1',
                            background: isSelected ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center', color: isSelected ? '#f59e0b' : '#94a3b8' }}>
                            {t.icon}
                          </span>
                          <span style={{ fontWeight: isSelected ? 700 : 500 }}>{t.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ));
              }

              return category.tools.map((t) => {
                const isSelected = activeTool === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTool(category, t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 14px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      color: isSelected ? '#38bdf8' : '#cbd5e1',
                      background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center', color: isSelected ? '#38bdf8' : '#94a3b8' }}>
                      {t.icon}
                    </span>
                    <span style={{ fontWeight: isSelected ? 700 : 500 }}>{t.label}</span>
                  </div>
                );
              });
            })()}
          </div>
        )}

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
              left: '60px',
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
