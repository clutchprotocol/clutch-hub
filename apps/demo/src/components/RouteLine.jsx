import { Polyline } from 'react-leaflet';

// A route as a road draws it: a dark casing with a yellow dashed centre line on top. `pending` is the
// grey version, for a request no driver has taken and for a cancelled trip.
// The colours are asphalt, lane and paper from index.css, written as hex because Leaflet draws them
// as SVG attributes. The line is straight between the two points: the app has no road routing.
const RouteLine = ({ positions, pending = false }) => (
  <>
    <Polyline
      positions={positions}
      color={pending ? '#5b6460' : '#14181c'}
      weight={pending ? 5 : 7}
      opacity={1}
      lineCap="round"
    />
    <Polyline
      positions={positions}
      color={pending ? '#fdfdf8' : '#e8b923'}
      weight={pending ? 2 : 3.5}
      opacity={1}
      dashArray={pending ? '8 8' : '10 9'}
      lineCap="butt"
    />
  </>
);

export default RouteLine;
