export function TableSkeleton({ rows = 6, cols = 4 }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c}><span className="skeleton" style={{ width: `${40 + ((r + c) % 5) * 12}%` }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BlockSkeleton({ lines = 3 }) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} className="skeleton" style={{ width: `${90 - i * 15}%`, height: 14 }} />
      ))}
    </div>
  )
}
