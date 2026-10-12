import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Inbox as InboxIcon, Megaphone, AlarmClock, FileText, BarChart3,
  Users, Database, Cable, Settings2, PanelLeftClose, PanelLeft, Menu, Plus, Bell,
  Sun, Moon, LogOut, Mail, PlusCircle, Upload, FilePlus2, ChevronDown, CheckSquare,
  List, Activity as ActivityIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import GlobalSearch from './GlobalSearch'
import NotificationCenter from './NotificationCenter'
import Dropdown from './Dropdown'

const NAV = [
  { label: 'Workspace', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/inbox', label: 'Inbox', icon: InboxIcon, badge: 'unread' },
  ] },
  { label: 'Outreach', items: [
    { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
    { to: '/follow-ups', label: 'Follow-ups', icon: AlarmClock },
    { to: '/templates', label: 'Templates', icon: FileText },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/sent-emails', label: 'Sent Emails', icon: Mail },
    { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  ] },
  { label: 'Contacts', items: [
    { to: '/contacts', label: 'Contacts', icon: Users },
    { to: '/leads', label: 'Lead database', icon: Database },
    { to: '/contact-lists', label: 'Contact Lists', icon: List },
  ] },
  { label: 'Settings', items: [
    { to: '/accounts', label: 'Accounts', icon: Cable },
    { to: '/settings', label: 'Settings', icon: Settings2 },
    { to: '/activity', label: 'Activity', icon: ActivityIcon },
  ] },
]

const TITLES = [
  ['/campaigns/', 'Campaign'],
  ['/', 'Overview'],
  ['/inbox', 'Inbox'],
  ['/campaigns', 'Campaigns'],
  ['/follow-ups', 'Follow-ups'],
  ['/templates', 'Templates'],
  ['/analytics', 'Analytics'],
  ['/sent-emails', 'Sent Emails'],
  ['/tasks', 'Tasks'],
  ['/contacts', 'Contacts'],
  ['/leads', 'Lead database'],
  ['/contact-lists', 'Contact Lists'],
  ['/accounts', 'Connected accounts'],
  ['/settings', 'Settings'],
  ['/activity', 'Activity'],
]

function initials(email = '') {
  const name = email.split('@')[0] || '?'
  return name.slice(0, 1).toUpperCase()
}

export default function Layout({ session }) {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('maildesk.sidebar') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [notifUnread, setNotifUnread] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)

  const email = session?.user?.email || ''
  const titleMatch = TITLES.find(([p]) => (p === '/' ? location.pathname === '/' : (p.endsWith('/') ? location.pathname.startsWith(p) : location.pathname === p)))
  const title = titleMatch ? titleMatch[1] : 'MailDesk'

  useEffect(() => {
    localStorage.setItem('maildesk.sidebar', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    let alive = true
    async function poll() {
      const { data } = await supabase.from('v_threads').select('unread').limit(500)
      if (alive && data) setUnread(data.reduce((sum, t) => sum + (t.unread || 0), 0))
    }
    poll()
    const id = setInterval(poll, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    let alive = true
    async function poll() {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
      if (alive) setNotifUnread(count || 0)
    }
    poll()
    const id = setInterval(poll, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>

      {mobileOpen ? <div className="scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}

      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' open' : ''}`}>
        <div className="sidebar-head">
          <NavLink to="/" className="brand" aria-label="MailDesk home">
            <span className="brand-mark" aria-hidden="true">M</span>
            <span className="brand-name">
              <strong>MailDesk</strong>
              <small>outreach console</small>
            </span>
          </NavLink>
          <button
            className="sidebar-collapse"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column' }}>
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((l) => {
                const Icon = l.icon
                const badge = l.badge === 'unread' ? unread : 0
                return (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                    data-tip={collapsed ? l.label : undefined}
                    title={!collapsed ? undefined : undefined}
                  >
                    <Icon className="nav-icon" aria-hidden="true" />
                    <span className="nav-label">{l.label}</span>
                    {badge > 0 ? <span className="nav-badge" aria-label={`${badge} unread`}>{badge > 99 ? '99+' : badge}</span> : null}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="nav-spacer" />

        <div className="sidebar-foot">
          <Dropdown
            align="left"
            trigger={(open) => (
              <button className="account-chip" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
                <span className="avatar" aria-hidden="true">{initials(email)}</span>
                <span className="account-meta">
                  <span className="account-name">{email.split('@')[0]}</span>
                  <span className="account-sub">{email}</span>
                </span>
                <ChevronDown size={15} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--text-subtle)' }} />
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="menu-item" style={{ cursor: 'default' }}>
                  <Mail size={16} aria-hidden="true" />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
                </div>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { toggleTheme(); close() }}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                </button>
                <button className="menu-item danger" onClick={() => supabase.auth.signOut()}>
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </>
            )}
          </Dropdown>
        </div>
      </aside>

      <div className="shell">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="topbar-title">
            <span>{title}</span>
          </div>
          <div className="topbar-spacer" />
          <GlobalSearch />
          <Dropdown
            align="right"
            menuLabel="Quick actions"
            trigger={(open, toggle) => (
              <button className="btn primary hide-sm" onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
                <Plus size={16} aria-hidden="true" /> New
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="menu-label">Quick actions</div>
                <button className="menu-item" onClick={() => { navigate('/contacts?add=1'); close() }}>
                  <PlusCircle size={16} aria-hidden="true" /> Add contact
                </button>
                <button className="menu-item" onClick={() => { navigate('/contacts?import=1'); close() }}>
                  <Upload size={16} aria-hidden="true" /> Import CSV
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { navigate('/campaigns?new=1'); close() }}>
                  <Megaphone size={16} aria-hidden="true" /> New campaign
                </button>
                <button className="menu-item" onClick={() => { navigate('/templates?new=1'); close() }}>
                  <FilePlus2 size={16} aria-hidden="true" /> New template
                </button>
              </>
            )}
          </Dropdown>
          <button className="icon-btn" onClick={() => setShowNotifs(true)} aria-label={`Notifications${notifUnread ? `, ${notifUnread} unread` : ''}`} data-tip="Notifications" data-tip-pos="bottom">
            <Bell size={18} aria-hidden="true" />
            {notifUnread > 0 ? <span className="dot" aria-hidden="true">{notifUnread > 9 ? '9+' : notifUnread}</span> : null}
          </button>
          <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} data-tip={theme === 'dark' ? 'Light theme' : 'Dark theme'} data-tip-pos="bottom">
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
        </header>

        <main className="main" id="main">
          <Suspense fallback={<div className="loader" style={{ margin: '64px auto' }}>Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {showNotifs ? (
        <NotificationCenter onClose={() => setShowNotifs(false)} onRead={() => setNotifUnread(0)} />
      ) : null}
    </div>
  )
}
