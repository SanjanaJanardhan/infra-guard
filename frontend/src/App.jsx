import { useState } from 'react'
import sampleTf from './sample.tf?raw'
import sampleDockerfile from './sample.Dockerfile?raw'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

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

function Finding({ finding }) {
  const [open, setOpen] = useState(false)

  return (
    <li className="finding">
      <button className="finding-header" onClick={() => setOpen((o) => !o)}>
        <span className="finding-check-id">{finding.check_id}</span>
        <span className="finding-title">{finding.title}</span>
        <span className="finding-resource">{finding.resource}</span>
        <span className="finding-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="finding-body">
          <div className="finding-meta">
            lines {finding.start_line}–{finding.end_line}
          </div>
          <pre className="code-snippet">
            <code>{finding.code_snippet}</code>
          </pre>
        </div>
      )}
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

  const config = SCAN_TYPES[scanType]

  function switchType(type) {
    if (type === scanType) return
    setScanType(type)
    setCode('')
    setFilename(SCAN_TYPES[type].defaultFilename)
    setResult(null)
    setError(null)
  }

  async function handleScan() {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
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
          <textarea
            className="editor"
            spellCheck="false"
            placeholder={config.placeholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </section>

        <section className="panel results-panel">
          <div className="panel-header">
            <span>Findings</span>
          </div>
          <div className="results-body">
            {!result && !error && !loading && <p className="placeholder">{config.emptyMessage}</p>}
            {loading && <p className="placeholder">Running Checkov…</p>}
            {error && <p className="error-msg">{error}</p>}
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
                  <p className="placeholder">No failed checks. Clean scan.</p>
                ) : (
                  <ul className="findings-list">
                    {result.findings.map((f, i) => (
                      <Finding key={`${f.check_id}-${i}`} finding={f} />
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
