import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, isConfigured } from './lib/supabase'
import { ThemeProvider } from './lib/theme'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Login from './components/Login'

const Overview = lazy(() => import('./pages/Overview'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const CampaignDetail = lazy(() => import('./pages/CampaignDetail'))
const Leads = lazy(() => import('./pages/Leads'))
const Inbox = lazy(() => import('./pages/Inbox'))
const Contacts = lazy(() => import('./pages/Contacts'))
const FollowUps = lazy(() => import('./pages/FollowUps'))
const Templates = lazy(() => import('./pages/Templates'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Settings = lazy(() => import('./pages/Settings'))
const SentEmails = lazy(() => import('./pages/SentEmails'))
const Activity = lazy(() => import('./pages/Activity'))
const ContactLists = lazy(() => import('./pages/ContactLists'))
const Tasks = lazy(() => import('./pages/Tasks'))

function SetupNeeded() {
  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 560 }}>
        <h1>Supabase not configured</h1>
        <p className="muted">
          Create <code>.env</code> in the <code>dashboard/</code> folder:
        </p>
        <pre style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 10, overflow: 'auto' }}>
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ey...`}
        </pre>
        <p className="muted">
          Then run the schema in <code>supabase/schema.sql</code> and restart the dev server.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  let body
  if (!isConfigured) body = <SetupNeeded />
  else if (loading) body = <div className="center-screen"><div className="loader">Loading…</div></div>
  else if (!session) body = <Login />
  else {
    body = (
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="center-screen"><div className="loader">Loading…</div></div>}>
            <Routes>
              <Route element={<Layout session={session} />}>
                <Route index element={<Overview />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="contacts" element={<Contacts />} />
                <Route path="campaigns" element={<Campaigns />} />
                <Route path="campaigns/:id" element={<CampaignDetail />} />
                <Route path="follow-ups" element={<FollowUps />} />
                <Route path="templates" element={<Templates />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="leads" element={<Leads />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="settings" element={<Settings />} />
                <Route path="sent-emails" element={<SentEmails />} />
                <Route path="activity" element={<Activity />} />
                <Route path="contact-lists" element={<ContactLists />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    )
  }

  return <ThemeProvider>{body}</ThemeProvider>
}
