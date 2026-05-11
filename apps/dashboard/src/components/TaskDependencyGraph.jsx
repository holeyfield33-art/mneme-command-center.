import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Constants ──────────────────────────────────────────────────────────────

const NODE_W = 160
const NODE_H = 64
const NODE_RX = 10
const H_GAP = 52        // gap between nodes
const V_GAP = 40        // gap between rows if wrapped
const ROW_MAX = 4       // nodes per row before wrapping
const GATE_R = 12       // approval gate diamond half-width
const PAD = 24          // canvas padding

const STATUS_COLOR = {
  queued: { fill: '#fff8e1', stroke: '#d9822b', text: '#7a4a00' },
  planning: { fill: '#e3f6fc', stroke: '#1f7a8c', text: '#0b4a5a' },
  waiting_for_plan_approval: { fill: '#fff0f0', stroke: '#c44236', text: '#7a1a10' },
  waiting_for_diff_review: { fill: '#fff0f0', stroke: '#c44236', text: '#7a1a10' },
  waiting_for_manual_execution: { fill: '#fff0f0', stroke: '#c44236', text: '#7a1a10' },
  plan_approved: { fill: '#edfbf4', stroke: '#2f9e6f', text: '#0e5535' },
  plan_rejected: { fill: '#fce8e8', stroke: '#c44236', text: '#7a1a10' },
  approved_for_execution: { fill: '#edfbf4', stroke: '#2f9e6f', text: '#0e5535' },
  queued_for_execution: { fill: '#fff8e1', stroke: '#d9822b', text: '#7a4a00' },
  executing: { fill: '#e3f6fc', stroke: '#1f7a8c', text: '#0b4a5a' },
  completed: { fill: '#edfbf4', stroke: '#155c37', text: '#0a3d25' },
  failed: { fill: '#fce8e8', stroke: '#8b1a10', text: '#5c0e08' },
  diff_review_approved: { fill: '#edfbf4', stroke: '#2f9e6f', text: '#0e5535' },
}

const APPROVAL_STATUSES = new Set([
  'waiting_for_plan_approval',
  'waiting_for_diff_review',
  'waiting_for_manual_execution',
])

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function statusLabel(status) {
  return (status || 'unknown').replace(/_/g, ' ')
}

// ─── Layout computation ──────────────────────────────────────────────────────

function layoutNodes(tasks) {
  // Sort by created_at ascending
  const sorted = [...tasks].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return ta - tb
  })

  const nodes = []
  let col = 0
  let row = 0

  sorted.forEach((task, i) => {
    const hasGate = APPROVAL_STATUSES.has(task.status)
    const x = PAD + col * (NODE_W + H_GAP)
    const y = PAD + row * (NODE_H + V_GAP + (hasGate ? GATE_R * 2 + 8 : 0))

    nodes.push({ task, x, y, hasGate, index: i })

    col += 1
    if (col >= ROW_MAX) {
      col = 0
      row += 1
    }
  })

  return nodes
}

// ─── Connector SVG paths ─────────────────────────────────────────────────────

function Connectors({ nodes }) {
  const paths = []

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]

    const sameRow = Math.abs(a.y - b.y) < 10

    if (sameRow) {
      // Straight arrow right
      const x1 = a.x + NODE_W
      const y1 = a.y + NODE_H / 2
      const x2 = b.x
      const y2 = b.y + NODE_H / 2
      const mx = (x1 + x2) / 2
      paths.push(
        <g key={`conn-${i}`}>
          <path
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="#b0c4d4"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        </g>
      )
    } else {
      // Row-wrap: go down then across
      const x1 = a.x + NODE_W / 2
      const y1 = a.y + NODE_H
      const x2 = b.x + NODE_W / 2
      const y2 = b.y
      const my = (y1 + y2) / 2
      paths.push(
        <g key={`conn-${i}`}>
          <path
            d={`M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`}
            fill="none"
            stroke="#b0c4d4"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        </g>
      )
    }
  }

  return <>{paths}</>
}

// ─── Single task node ─────────────────────────────────────────────────────────

function TaskNode({ node, onNavigate, hovered, onHover }) {
  const { task, x, y, hasGate } = node
  const colors = STATUS_COLOR[task.status] || { fill: '#f5f5f5', stroke: '#999', text: '#333' }
  const isHovered = hovered === task.id

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={() => onNavigate(`/task/${task.id}`)}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Shadow */}
      {isHovered && (
        <rect
          x={x - 3}
          y={y - 3}
          width={NODE_W + 6}
          height={NODE_H + 6}
          rx={NODE_RX + 3}
          fill="rgba(0,0,0,0.08)"
        />
      )}

      {/* Main box */}
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={NODE_RX}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={isHovered ? 2.5 : 1.5}
      />

      {/* Objective text */}
      <text
        x={x + NODE_W / 2}
        y={y + 22}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={colors.text}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {truncate(task.objective, 22)}
      </text>

      {/* Status label */}
      <text
        x={x + NODE_W / 2}
        y={y + 40}
        textAnchor="middle"
        fontSize={9}
        fontWeight={500}
        fill={colors.stroke}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {statusLabel(task.status)}
      </text>

      {/* Risk pill */}
      {task.risk_level && (
        <text
          x={x + NODE_W - 8}
          y={y + 56}
          textAnchor="end"
          fontSize={8}
          fill={task.risk_level === 'high' ? '#c44236' : task.risk_level === 'low' ? '#2f9e6f' : '#b86c22'}
          fontWeight={700}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {task.risk_level?.toUpperCase()}
        </text>
      )}

      {/* Approval gate diamond below node */}
      {hasGate && (
        <g transform={`translate(${x + NODE_W / 2}, ${y + NODE_H + GATE_R + 6})`}>
          <polygon
            points={`0,${-GATE_R} ${GATE_R},0 0,${GATE_R} ${-GATE_R},0`}
            fill="#fff0f0"
            stroke="#c44236"
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={4}
            textAnchor="middle"
            fontSize={8}
            fill="#c44236"
            fontWeight={700}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            GATE
          </text>
          {/* line from node to gate */}
          <line
            x1={0}
            y1={-GATE_R - 6}
            x2={0}
            y2={-GATE_R}
            stroke="#c44236"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        </g>
      )}
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskDependencyGraph({ tasks }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(null)
  const containerRef = useRef(null)

  const nodes = useMemo(() => layoutNodes(tasks), [tasks])

  const svgWidth = useMemo(() => {
    if (!nodes.length) return 300
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W))
    return maxX + PAD
  }, [nodes])

  const svgHeight = useMemo(() => {
    if (!nodes.length) return 120
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H + (n.hasGate ? GATE_R * 2 + 10 : 0)))
    return maxY + PAD
  }, [nodes])

  if (!tasks || tasks.length === 0) return null

  return (
    <div
      className="mneme-surface mneme-enter"
      style={{ padding: '0.9rem 1rem', marginBottom: '1.5rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Task Pipeline</h3>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            backgroundColor: '#1f7a8c22',
            color: '#1f7a8c',
            borderRadius: '999px',
            padding: '0.15rem 0.5rem',
          }}
        >
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} · click to open
        </span>
      </div>

      <div
        ref={containerRef}
        style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          <defs>
            <marker
              id="arrow"
              markerWidth={8}
              markerHeight={8}
              refX={6}
              refY={3}
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="#b0c4d4" />
            </marker>
          </defs>

          <Connectors nodes={nodes} />

          {nodes.map((node) => (
            <TaskNode
              key={node.task.id}
              node={node}
              onNavigate={navigate}
              hovered={hovered}
              onHover={setHovered}
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginTop: '0.65rem',
          paddingTop: '0.55rem',
          borderTop: '1px solid #e4ecf3',
        }}
      >
        {[
          { label: 'Awaiting', color: '#c44236' },
          { label: 'Active', color: '#1f7a8c' },
          { label: 'Done', color: '#2f9e6f' },
          { label: 'Queued', color: '#d9822b' },
          { label: 'Failed', color: '#8b1a10' },
          { label: '◆ Gate', color: '#c44236', diamond: true },
        ].map((item) => (
          <span
            key={item.label}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', color: '#526170' }}
          >
            {item.diamond ? (
              <svg width={12} height={12}>
                <polygon points="6,0 12,6 6,12 0,6" fill="#fff0f0" stroke="#c44236" strokeWidth={1.5} />
              </svg>
            ) : (
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: item.color,
                  display: 'inline-block',
                  opacity: 0.85,
                }}
              />
            )}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
