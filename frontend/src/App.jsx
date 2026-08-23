import { useState } from 'react'
import sampleTf from './sample.tf?raw'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

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
  const [code, setCode] = useState('')
  const [filename, setFilename] = useState('main.tf')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleScan() {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_URL}/api/scan`, {
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
    setCode(sampleTf)
    setFilename('insecure_example.tf')
    setResult(null)
    setError(null)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">infra-guard</span>
          <span className="brand-tagline">Terraform security scanner, powered by Checkov</span>
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
            <span>{filename}</span>
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
            placeholder="Paste your Terraform (.tf) code here…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </section>

        <section className="panel results-panel">
          <div className="panel-header">
            <span>Findings</span>
          </div>
          <div className="results-body">
            {!result && !error && !loading && (
              <p className="placeholder">Paste Terraform and hit Scan to see structured findings here.</p>
            )}
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
