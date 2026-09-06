import React from 'react';
import ReactDOM from 'react-dom/client';
import gsap from 'gsap';
import App from './App';
import './styles.css';
import { SpeedInsights } from "@vercel/speed-insights/next"

// GSAP defaults to lagSmoothing(500, 33): any frame longer than 500ms is
// treated as 33ms, which quietly converts wall-clock choreography into
// frame-counted choreography. On a slow GPU or during a loading hitch that
// leaves the camera crawling — a 2s walk to the apse can take 40s. These
// timelines are all camera moves, where honouring real elapsed time (and
// arriving late rather than never) is the correct trade.
gsap.ticker.lagSmoothing(0);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <SpeedInsights />
  </React.StrictMode>,
);
