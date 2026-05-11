import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Global styles
const globalStyle = document.createElement('style')
globalStyle.textContent = `
  :root {
    --mneme-bg: #eef2f6;
    --mneme-surface: #ffffff;
    --mneme-ink: #1f2d3d;
    --mneme-muted: #5d6b79;
    --mneme-border: #d5dde6;
    --mneme-brand: #2c3e50;
    --mneme-brand-soft: #e6eef7;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Avenir Next', 'Segoe UI', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-color: var(--mneme-bg);
    color: var(--mneme-ink);
  }
  
  button {
    font-family: inherit;
  }
  
  input, textarea, select {
    font-family: inherit;
  }

  .mneme-surface {
    background: var(--mneme-surface);
    border: 1px solid var(--mneme-border);
    border-radius: 10px;
    box-shadow: 0 1px 3px rgba(24, 38, 59, 0.08);
  }

  .mneme-enter {
    animation: mnemeFadeRise 220ms ease-out;
  }

  .mneme-empty {
    border: 1px dashed #b4c0cc;
    border-radius: 10px;
    padding: 1.1rem;
    background: #f7fafc;
    color: var(--mneme-muted);
  }

  .mneme-alert {
    border-radius: 8px;
    padding: 0.8rem;
    border: 1px solid transparent;
    margin-bottom: 0.9rem;
  }

  .mneme-alert.error {
    background: #ffe9e8;
    border-color: #f0b3b0;
    color: #9e2222;
  }

  .mneme-alert.info {
    background: #e9f3ff;
    border-color: #b8d6f7;
    color: #1f4f82;
  }

  .mneme-skeleton {
    position: relative;
    overflow: hidden;
    background: #e9eef3;
    border-radius: 8px;
  }

  .mneme-skeleton::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, rgba(233, 238, 243, 0), rgba(255, 255, 255, 0.65), rgba(233, 238, 243, 0));
    animation: mnemeShimmer 1.4s infinite;
  }

  @keyframes mnemeFadeRise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes mnemeShimmer {
    100% {
      transform: translateX(100%);
    }
  }
`
document.head.appendChild(globalStyle)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
