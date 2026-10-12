import { useEffect, useState } from 'react'
import { Activity as ActivityIcon, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'

export default function Activity() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let ignore = false
    async function load() {
      setLoading(true)
      let q = supabase
        .from('audit_logs')
        .select('id,user_id,action,entity,entity_id,details,created_at')
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (query) {
        q = q.or(`action.ilike.%${query}%,entity.ilike.%${query}%,entity_id.ilike.%${query}%`)
      }
      const { data, count, error } = await q
      if (ignore) return
      if (error) {
        setRows([])
        setTotal(0)
      } else {
        setRows(data || [])
        setTotal(count || 0)
      }
      setLoading(false)
    }
    load()
    return () => { ignore = true }
  }, [page, pageSize, query])

  return (
    <div>
      <PageHeader title="Activity" description="Recent actions and audit trail" />

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Search action, entity, or entity ID"
              aria-label="Search activity"
            />
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Entity</th>
                <th>Entity ID</th>
                <th>User</th>
                <th className="num">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (<tr><td colSpan={5}><div className="skeleton" style={{height:16,width:'80%'}} /><div className="skeleton" style={{height:16,width:'70%',marginTop:8}} /><div className="skeleton" style={{height:16,width:'60%',marginTop:8}} /></td></tr>) : rows.length === 0 ? (
                <tr><td colSpan={5}>
                  <EmptyState icon={ActivityIcon} title="No activity">No audit events match your filters.</EmptyState>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.action}</td>
                  <td>{r.entity || '-'}</td>
                  <td>{r.entity_id || '-'}</td>
                  <td>{r.user_id ? r.user_id.slice(0, 8) + '…' : '-'}</td>
                  <td className="num">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </div>
  )
}
