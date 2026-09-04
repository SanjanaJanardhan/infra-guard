import { useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import sampleTf from './sample.tf?raw'
import sampleDockerfile from './sample.Dockerfile?raw'
import { applyHighlight, highlightField } from './lineHighlight'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

// Stable reference: CodeMirror reconfigures (and can drop external value
// syncs) if the extensions array identity changes on every render.
const EDITOR_EXTENSIONS = [highlightField]

const SCAN_TYPES = {
  terraform: {
    label: 'Terraform',
    defaultFilename: 'main.tf',
    sample: sampleTf,
    sampleFilename: 'insecure_example.tf',
    endpoint: '/api/scan',
    placeholder: 'Paste your Terraform (.tf) code here…',
    emptyMessage: 'Paste Terraform and hit Scan to see structured findings here.',
  },
  dockerfile: {
    label: 'Dockerfile',
    defaultFilename: 'Dockerfile',
    sample: sampleDockerfile,
    sampleFilename: 'Dockerfile',
    endpoint: '/api/scan-dockerfile',
    placeholder: 'Paste your Dockerfile here…',
    emptyMessage: 'Paste a Dockerfile and hit Scan to see structured findings here.',
  },
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info']
const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
}

function SeverityBadge({ severity }) {
  const level = SEVERITY_LABEL[severity] ? severity : 'info'
  return <span className={`severity-badge severity-${level}`}>{SEVERITY_LABEL[level]}</span>
}

function Finding({ finding, active, onSelect }) {
  return (
    <li className={`finding${active ? ' active' : ''}`}>
      <button className="finding-header" onClick={onSelect}>
        <SeverityBadge severity={finding.severity} />
        <span className="finding-check-id">{finding.check_id}</span>
        <span className="finding-title">{finding.title}</span>
        <span className="finding-resource">{finding.resource}</span>
        <span className="finding-lines">
          {finding.start_line}–{finding.end_line}
        </span>
      </button>
    </li>
  )
}

function App() {
  const [scanType, setScanType] = useState('terraform')
  const [code, setCode] = useState('')
  const [filename, setFilename] = useState(SCAN_TYPES.terraform.defaultFilename)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(null)

  const viewRef = useRef(null)
  const config = SCAN_TYPES[scanType]

  function clearSelection() {
    setSelectedIndex(null)
    applyHighlight(viewRef.current, null)
  }

  function selectFinding(index, finding) {
    if (selectedIndex === index) {
      clearSelection()
      return
    }
    setSelectedIndex(index)
    applyHighlight(viewRef.current, { start: finding.start_line, end: finding.end_line })
  }

  function switchType(type) {
    if (type === scanType) return
    setScanType(type)
    setCode('')
    setFilename(SCAN_TYPES[type].defaultFilename)
    setResult(null)
    setError(null)
    clearSelection()
  }

  async function handleScan() {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    clearSelection()
    try {
      const res = await fetch(`${API_URL}${config.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_content: code, filename }),
      })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Something went wrong while scanning.')
    } finally {
      setLoading(false)
    }
  }

  function loadSample() {
    setCode(config.sample)
    setFilename(config.sampleFilename)
    setResult(null)
    setError(null)
    clearSelection()
  }

  function handleCodeChange(value) {
    setCode(value)
    // Editing the file invalidates any highlighted range's line numbers.
    if (selectedIndex !== null) clearSelection()
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">infra-guard</span>
          <span className="brand-tagline">Terraform &amp; Dockerfile security scanner, powered by Checkov</span>
        </div>
        <a
          className="github-link"
          href="https://github.com/SanjanaJanardhan/infra-guard"
          target="_blank"
          rel="noreferrer"
        >
          View on GitHub
        </a>
      </header>

      <main className="layout">
        <section className="panel editor-panel">
          <div className="panel-header">
            <div className="header-left">
              <div className="mode-toggle">
                {Object.entries(SCAN_TYPES).map(([type, cfg]) => (
                  <button
                    key={type}
                    className={type === scanType ? 'active' : ''}
                    onClick={() => switchType(type)}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
              <span className="filename">{filename}</span>
            </div>
            <div className="panel-actions">
              <button className="btn-ghost" onClick={loadSample}>
                Load sample
              </button>
              <button className="btn-primary" onClick={handleScan} disabled={loading || !code.trim()}>
                {loading ? 'Scanning…' : 'Scan'}
              </button>
            </div>
          </div>
          <CodeMirror
            className="editor"
            value={code}
            onChange={handleCodeChange}
            placeholder={config.placeholder}
            theme="dark"
            height="100%"
            extensions={EDITOR_EXTENSIONS}
            onCreateEditor={(view) => {
              viewRef.current = view
            }}
          />
        </section>

        <section className="panel results-panel">
          <div className="panel-header">
            <span>Findings</span>
          </div>
          <div className="results-body">
            {!result && !error && !loading && <p className="placeholder">{config.emptyMessage}</p>}
            {loading && <p className="placeholder">Running Checkov…</p>}
            {error && (
              <div className="error-banner">
                <span>{error}</span>
                <button className="error-dismiss" onClick={() => setError(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}
            {result && (
              <>
                <div className="summary">
                  <div className="summary-stat stat-passed">
                    <span className="stat-number">{result.summary.passed}</span>
                    <span className="stat-label">passed</span>
                  </div>
                  <div className="summary-stat stat-failed">
                    <span className="stat-number">{result.summary.failed}</span>
                    <span className="stat-label">failed</span>
                  </div>
                  <div className="summary-stat stat-total">
                    <span className="stat-number">{result.summary.total_checks}</span>
                    <span className="stat-label">total checks</span>
                  </div>
                </div>
                {result.findings.length === 0 ? (
                  <div className="clean-state">
                    <span className="clean-check">✓</span>
                    <p>No issues found. Clean scan.</p>
                  </div>
                ) : (
                  <ul className="findings-list">
                    {[...result.findings]
                      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
                      .map((f, i) => (
                        <Finding
                          key={`${f.check_id}-${i}`}
                          finding={f}
                          active={selectedIndex === i}
                          onSelect={() => selectFinding(i, f)}
                        />
                      ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
