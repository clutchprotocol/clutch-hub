import React, { useRef, useState } from 'react';

const SNAPS = ['peek', 'half', 'full'];
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

const visibleFor = (s) => {
  const vh = window.innerHeight;
  if (s === 'peek') return 200;
  if (s === 'half') return Math.round(vh * 0.55);
  return Math.round(vh * 0.88);
};

/**
 * Mobile (<1024px): bottom sheet with drag handle and three snap points.
 * Desktop (>=1024px): static floating left panel (CSS only; drag disabled).
 * Controlled: parent owns `snap`.
 */
const BottomSheet = ({ snap = 'half', onSnapChange, header, ariaLabel = 'Ride panel', children }) => {
  const dragState = useRef(null);
  const movedRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(null); // translateY px while dragging

  const handlePointerDown = (e) => {
    if (isDesktop()) return;
    movedRef.current = false;
    dragState.current = { startY: e.clientY, startVisible: visibleFor(snap) };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragState.current) return;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dy) > 6) movedRef.current = true;
    const maxVisible = visibleFor('full');
    const visible = Math.min(maxVisible, Math.max(120, dragState.current.startVisible - dy));
    setDragOffset(maxVisible - visible);
  };

  const handlePointerUp = () => {
    if (!dragState.current) return;
    const maxVisible = visibleFor('full');
    const visible = dragOffset == null ? visibleFor(snap) : maxVisible - dragOffset;
    let best = SNAPS[0];
    let bestDist = Infinity;
    for (const s of SNAPS) {
      const d = Math.abs(visibleFor(s) - visible);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    dragState.current = null;
    setDragOffset(null);
    if (best !== snap) onSnapChange?.(best);
  };

  // Keyboard/click affordance: cycle snap points. Skipped after a real drag.
  const cycleSnap = () => {
    if (movedRef.current) return;
    const idx = SNAPS.indexOf(snap);
    onSnapChange?.(SNAPS[(idx + 1) % SNAPS.length]);
  };

  return (
    <section
      className={`bottom-sheet bottom-sheet--${snap}${dragOffset != null ? ' bottom-sheet--dragging' : ''}`}
      style={dragOffset != null ? { transform: `translateY(${dragOffset}px)` } : undefined}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="bottom-sheet-handle"
        aria-label="Resize panel"
        onClick={cycleSnap}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="bottom-sheet-handle-bar" aria-hidden />
      </button>
      {header && <div className="bottom-sheet-header">{header}</div>}
      <div className="bottom-sheet-body">{children}</div>
    </section>
  );
};

export default BottomSheet;
