import { useEffect, useState } from 'react'
import { List, Search, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'

export default function ContactLists() {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  async function load() {
    setLoading(true)
    let q = supabase
      .from('contact_lists')
      .select('id,name,description,created_at')
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (query) q = q.ilike('name', `%${query}%`)
    const { data, count, error } = await q
    if (error) {
      setRows([])
      setTotal(0)
      toast('Failed to load contact lists', 'error')
    } else {
      setRows(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [page, pageSize, query])

  async function createList(e) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return toast('Name required', 'error')
    const { error } = await supabase.from('contact_lists').insert({ name, description: form.description.trim() || null })
    if (error) return toast('Failed to create list', 'error')
    toast('List created', 'success')
    setAddOpen(false)
    setForm({ name: '', description: '' })
    setPage(1)
    load()
  }

  return (
    <div>
      <PageHeader title="Contact Lists" description="Organize contacts into targeted lists">
        <button className="primary" onClick={() => setAddOpen(true)}><Plus size={16} /> New list</button>
      </PageHeader>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Search lists"
              aria-label="Search contact lists"
            />
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th className="num">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (<tr><td colSpan={3}><div className="skeleton" style={{height:16,width:'80%'}}/><div className="skeleton" style={{height:16,width:'70%',marginTop:8}}/></td></tr>) : rows.length === 0 ? (
                <tr><td colSpan={3}>
                  <EmptyState icon={List} title="No lists">Create your first contact list.</EmptyState>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.description || '-'}</td>
                  <td className="num">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
      </div>

      {addOpen && (
        <Modal title="New contact list" onClose={() => setAddOpen(false)} footer={
          <>
            <button onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="primary" onClick={createList}>Create</button>
          </>
        }>
          <form onSubmit={createList}>
            <div className="field">
              <label htmlFor="list-name">Name</label>
              <input id="list-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label htmlFor="list-desc">Description</label>
              <input id="list-desc" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
