import { useEffect, useState } from 'react'
import { CheckSquare, Search, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { normalizeEmail } from '../lib/contactImport'

const STATUSES = ['', 'pending', 'in_progress', 'completed', 'cancelled']

export default function Tasks() {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ title: '', due_at: '', contact_email: '', notes: '' })

  async function load() {
    setLoading(true)
    let q = supabase
      .from('tasks')
      .select('id,title,status,contact_id,contact_email,due_at,priority,created_at,leads(id,email,contact_name)')
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (query) q = q.or(`title.ilike.%${query}%,contact_email.ilike.%${query}%`)
    if (status) q = q.eq('status', status)
    const { data, count, error } = await q
    if (error) {
      setRows([])
      setTotal(0)
      toast('Failed to load tasks', 'error')
    } else {
      setRows(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [page, pageSize, query, status])

  async function createTask(e) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) return toast('Title required', 'error')
    let contact_id = null
    let contact_email = form.contact_email.trim() || null
    if (contact_email) {
      const ne = normalizeEmail(contact_email)
      contact_email = ne
      const { data: lead } = await supabase.from('leads').select('id').eq('email', contact_email).maybeSingle()
      if (lead) contact_id = lead.id
    }
    const { error } = await supabase.from('tasks').insert({
      title,
      due_at: form.due_at || null,
      contact_id,
      contact_email,
      notes: form.notes.trim() || null,
      status: 'pending',
      priority: 0,
    })
    if (error) return toast('Failed to create task', 'error')
    toast('Task created', 'success')
    setAddOpen(false)
    setForm({ title: '', due_at: '', contact_email: '', notes: '' })
    setPage(1)
    load()
  }

  return (
    <div>
      <PageHeader title="Tasks" description="Track manual follow-ups and to-dos">
        <button className="primary" onClick={() => setAddOpen(true)}><Plus size={16} /> New task</button>
      </PageHeader>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Search tasks"
              aria-label="Search tasks"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Due</th>
                <th className="num">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (<tr><td colSpan={5}><div className="skeleton" style={{height:16,width:'80%'}}/><div className="skeleton" style={{height:16,width:'70%',marginTop:8}}/></td></tr>) : rows.length === 0 ? (
                <tr><td colSpan={5}>
                  <EmptyState icon={CheckSquare} title="No tasks">Create your first task.</EmptyState>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>{r.status}</td>
                  <td>{r.leads?.contact_name || r.contact_email || (r.contact_id ? `#${r.contact_id}` : '-')}</td>
                  <td>{r.due_at ? new Date(r.due_at).toLocaleString() : '-'}</td>
                  <td className="num">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
      </div>

      {addOpen && (
        <Modal title="New task" onClose={() => setAddOpen(false)} footer={
          <>
            <button onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="primary" onClick={createTask}>Create</button>
          </>
        }>
          <form onSubmit={createTask}>
            <div className="field">
              <label htmlFor="task-title">Title</label>
              <input id="task-title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="field">
              <label htmlFor="task-due">Due at</label>
              <input id="task-due" type="datetime-local" value={form.due_at} onChange={(e) => setForm(f => ({ ...f, due_at: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="task-contact">Contact email (optional)</label>
              <input id="task-contact" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="task-notes">Notes</label>
              <textarea id="task-notes" rows="3" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
