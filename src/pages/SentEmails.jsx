import { useEffect, useState } from 'react'
import { Mail, Search, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import { BlockSkeleton } from '../components/Skeleton'

const STATUSES = ['', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'unsubscribed']

export default function SentEmails() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [campaign, setCampaign] = useState('')

  useEffect(() => {
    let ignore = false
    async function load() {
      setLoading(true)
      let q = supabase
        .from('sends')
        .select('id,campaign_id,email,status,sent_at,opened_at,clicked_at,replied_at,bounced_at,error,message_id,created_at,campaigns(id,name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (query) {
        q = q.or(`email.ilike.%${query}%,message_id.ilike.%${query}%`)
      }
      if (status) {
        q = q.eq('status', status)
      }
      if (campaign) {
        q = q.eq('campaign_id', campaign)
      }

      const [{ data, count, error }] = await Promise.all([
        q,
        supabase.from('campaigns').select('id,name').order('name').limit(200),
      ])
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
  }, [page, pageSize, query, status, campaign])

  const [campaigns, setCampaigns] = useState([])
  useEffect(() => {
    supabase.from('campaigns').select('id,name').order('name').then(({ data }) => setCampaigns(data || []))
  }, [])

  return (
    <div>
      <PageHeader title="Sent Emails" description="Outbound messages and delivery lifecycle" />

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Search by email or message ID"
              aria-label="Search sent emails"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
          <select value={campaign} onChange={(e) => { setCampaign(e.target.value); setPage(1) }} aria-label="Filter by campaign">
            <option value="">All campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Campaign</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Opened</th>
                <th>Replied</th>
                <th>Bounced</th>
                <th className="num">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (<tr><td colSpan={8}><div className="skeleton" style={{height:16,width:'80%'}} /><div className="skeleton" style={{height:16,width:'70%',marginTop:8}} /><div className="skeleton" style={{height:16,width:'60%',marginTop:8}} /></td></tr>) : rows.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon={Mail} title="No sent emails">No sends match your filters yet.</EmptyState>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td>{r.campaigns?.name || r.campaign_id}</td>
                  <td>{r.status}</td>
                  <td>{r.sent_at ? new Date(r.sent_at).toLocaleString() : '-'}</td>
                  <td>{r.opened_at ? new Date(r.opened_at).toLocaleString() : '-'}</td>
                  <td>{r.replied_at ? new Date(r.replied_at).toLocaleString() : '-'}</td>
                  <td>{r.bounced_at ? new Date(r.bounced_at).toLocaleString() : '-'}</td>
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
