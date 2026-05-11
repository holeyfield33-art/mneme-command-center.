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
      :root {
        --mneme-bg: #eef2f6;
        --mneme-surface: #ffffff;
        --mneme-ink: #1f2d3d;
        --mneme-muted: #5d6b79;
        --mneme-border: #d5dde6;
        --mneme-brand: #2c3e50;
        --mneme-brand-soft: #e6eef7;
        --mneme-accent: #3b82f6;
        --mneme-accent-soft: #dbeafe;
        --mneme-success: #16a34a;
        --mneme-warning: #d97706;
        --mneme-danger: #dc2626;
        --mneme-radius: 10px;
        --mneme-shadow: 0 1px 3px rgba(24,38,59,0.08), 0 1px 2px rgba(24,38,59,0.06);
        --mneme-shadow-md: 0 4px 6px rgba(24,38,59,0.10), 0 2px 4px rgba(24,38,59,0.06);
        --mneme-transition: 160ms ease;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --mneme-bg: #0f1117;
          --mneme-surface: #1a1d27;
          --mneme-ink: #e2e8f0;
          --mneme-muted: #8892a4;
          --mneme-border: #2d3348;
          --mneme-brand: #6c8ebf;
          --mneme-brand-soft: #1e2a3b;
          --mneme-accent: #60a5fa;
          --mneme-accent-soft: #1e3a5f;
          --mneme-success: #4ade80;
          --mneme-warning: #fbbf24;
          --mneme-danger: #f87171;
          --mneme-shadow: 0 1px 3px rgba(0,0,0,0.4);
          --mneme-shadow-md: 0 4px 6px rgba(0,0,0,0.5);
        }
      }
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

    .mneme-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: filter 160ms ease, transform 160ms ease;
      white-space: nowrap;
    }
    .mneme-btn:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
    .mneme-btn:active:not(:disabled) { filter: brightness(0.95); transform: none; }
    .mneme-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .mneme-btn-primary { background: var(--mneme-accent); color: #fff; }
    .mneme-btn-ghost { background: transparent; border: 1px solid var(--mneme-border); color: var(--mneme-ink); }
    .mneme-btn-danger { background: var(--mneme-danger); color: #fff; }

    a { color: var(--mneme-accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--mneme-accent);
      box-shadow: 0 0 0 3px var(--mneme-accent-soft);
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
