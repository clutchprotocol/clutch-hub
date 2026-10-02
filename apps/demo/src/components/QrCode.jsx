import { useMemo } from 'react';
import qrcode from '../vendor/qrcode.js';
import { qrPath } from '../utils/qr';

// Modules of white around the code. The QR standard asks for 4; scanners struggle with less.
const QUIET_ZONE = 4;

/**
 * A QR code, drawn as one SVG path. `value` is encoded as text; `label` is the accessible name.
 *
 * It renders nothing when the generator throws (for example when the text is too long for any QR size),
 * so a failure here never blanks the panel around it: the same value is always shown as text beside the
 * code. The generator writes one byte per character, which is right for an address (ASCII); for other
 * text, set `qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']` first. The dark colour is
 * `currentColor` and the quiet zone is left transparent, so the parent decides the colours; scanners
 * need the zone white, so the parent (`.qr-tile`) sets a white background.
 */
const QrCode = ({ value, label }) => {
  const shape = useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(String(value));
      qr.make();
      const size = qr.getModuleCount();
      return { size, d: qrPath(size, (row, col) => qr.isDark(row, col), QUIET_ZONE) };
    } catch {
      return null;
    }
  }, [value]);

  if (!shape) return null;
  const box = shape.size + 2 * QUIET_ZONE;
  return (
    <svg className="qr-code" viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path d={shape.d} fill="currentColor" />
    </svg>
  );
};

export default QrCode;
