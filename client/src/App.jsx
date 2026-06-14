import React, { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'unreachable' }))
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>CourseForge</h1>
      <p>API status: {health ? health.status : 'checking...'}</p>
    </div>
  )
}
