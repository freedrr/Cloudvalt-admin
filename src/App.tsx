import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User as FirebaseUser } from 'firebase/auth';
import {
  Activity, AlertCircle, ArrowDownToLine, ChevronRight, CreditCard,
  Database, Download, FileText, Folder, HardDrive, LayoutDashboard, LoaderCircle,
  LogOut, MessageSquare, RefreshCw, Search, ShieldCheck, Star, Users, X,
} from 'lucide-react';
import { auth, googleProvider } from './lib/firebase';

type AdminUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  plan: string;
  planId: string;
  usedBytes: number;
  maxBytes: number;
  fileCount: number;
  updatedAt: string | null;
  planStatus: string;
  whopMembershipStatus: string;
  whopCancelAtPeriodEnd: boolean | null;
  whopCurrentPeriodEnd: string | null;
};

type AdminFeedback = {
  id: string;
  userId: string;
  userEmail?: string;
  rating: number;
  message: string;
  createdAt: string | null;
};

type AdminFile = {
  id: string;
  name?: string;
  type?: string;
  size?: number;
  isDeleted?: boolean;
  uploadedAt?: string | null;
};

type DashboardData = {
  users: AdminUser[];
  metrics: {
    totalUsers: number;
    paidUsers: number;
    freeUsers: number;
    estimatedMonthlyRevenue: number;
    totalStorageBytes: number;
  };
  truncated: boolean;
};

type UserDetails = {
  user: AdminUser;
  files: AdminFile[];
  folders: Array<{ id: string; name?: string; size?: number; isDeleted?: boolean }>;
  feedback: AdminFeedback[];
};

type Page = 'overview' | 'users' | 'feedback';

const numberFormat = new Intl.NumberFormat('en-US');
const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const CLOUDVALT_LOGO = '/assets/aistudio/Screenshot_2026-11-11_201404_272a1524.png';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function exportUsersCsv(users: AdminUser[]) {
  const columns: Array<[string, (user: AdminUser) => string | number]> = [
    ['User ID', (user) => user.id],
    ['Name', (user) => user.name],
    ['Email', (user) => user.email],
    ['Plan', (user) => user.plan],
    ['Plan assignment', (user) => user.planStatus],
    ['Whop membership status', (user) => user.whopMembershipStatus || 'Not linked'],
    ['Cancels at period end', (user) => user.whopCancelAtPeriodEnd === null ? '' : user.whopCancelAtPeriodEnd ? 'Yes' : 'No'],
    ['Current period end', (user) => user.whopCurrentPeriodEnd || ''],
    ['Storage used (bytes)', (user) => user.usedBytes],
    ['Storage limit (bytes)', (user) => user.maxBytes],
    ['File count', (user) => user.fileCount],
    ['Last updated', (user) => user.updatedAt || ''],
  ];
  const escapeCell = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [columns.map(([label]) => escapeCell(label)).join(','), ...users.map((user) => columns.map(([, read]) => escapeCell(read(user))).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cloudvalt-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function initials(user: AdminUser) {
  const source = user.name || user.email || 'CV';
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

function subscriptionLabel(user: AdminUser) {
  if (!user.whopMembershipStatus) return user.planStatus;
  const status = user.whopMembershipStatus.replace(/_/g, ' ');
  if (!user.whopCurrentPeriodEnd) return status;
  return `${status} · ${user.whopCancelAtPeriodEnd ? 'ends' : 'period ends'} ${formatDate(user.whopCurrentPeriodEnd)}`;
}

function UserAvatar({ user, large = false }: { user: AdminUser; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [user.avatarUrl]);
  const sizeClass = large ? 'large-avatar' : '';
  if (!user.avatarUrl || imageFailed) return <div className={`avatar ${sizeClass}`}>{initials(user)}</div>;
  return <div className={`avatar ${sizeClass}`}><img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /></div>;
}

async function apiRequest<T>(path: string, firebaseUser: FirebaseUser): Promise<T> {
  const token = await firebaseUser.getIdToken();
  const response = await fetch(path, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Could not load this information.');
  return body as T;
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<Page>('overview');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [search, setSearch] = useState('');
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setFirebaseUser(user);
    setAuthReady(true);
    setDashboard(null);
    setFeedback([]);
    setError('');
  }), []);

  const loadDashboard = useCallback(async (user = firebaseUser) => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<DashboardData>('/api/admin/overview', user);
      setDashboard(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  const loadFeedback = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ feedback: AdminFeedback[] }>('/api/admin/feedback', firebaseUser);
      setFeedback(result.feedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load feedback.');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser && !dashboard) void loadDashboard(firebaseUser);
  }, [firebaseUser, dashboard, loadDashboard]);

  useEffect(() => {
    if (page === 'feedback' && firebaseUser && feedback.length === 0) void loadFeedback();
  }, [page, firebaseUser, feedback.length, loadFeedback]);

  const visibleUsers = useMemo(() => {
    const rows = dashboard?.users || [];
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((user) => [user.name, user.email, user.id, user.plan].some((value) => value.toLowerCase().includes(query)));
  }, [dashboard, search]);

  const openUser = async (uid: string) => {
    if (!firebaseUser) return;
    setDetailLoading(true);
    setDetails(null);
    setError('');
    try {
      const result = await apiRequest<UserDetails>(`/api/admin/users/${encodeURIComponent(uid)}`, firebaseUser);
      setDetails(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this user.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) return <div className="screen-center"><LoaderCircle className="spin" size={24} /><span>Starting Cloudvalt Admin…</span></div>;

  if (!firebaseUser) return (
    <main className="login-screen">
      <div className="login-glow" />
      <section className="login-card">
        <div className="brand-mark"><img src={CLOUDVALT_LOGO} alt="Cloudvalt logo" /></div>
        <p className="eyebrow">CONTROL CENTER</p>
        <h1>Cloudvalt Admin</h1>
        <p className="login-copy">Sign in with your administrator account to manage user records and feedback.</p>
        {error && <div className="alert error-alert"><AlertCircle size={17} />{error}</div>}
        <button className="primary-button login-button" onClick={handleLogin} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
          Continue with Google
        </button>
        <p className="login-footnote">Access is limited to authorized administrator accounts.</p>
      </section>
    </main>
  );

  const metrics = dashboard?.metrics;
  const navItems: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ];

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small"><img src={CLOUDVALT_LOGO} alt="Cloudvalt logo" /></div>
          <div><strong>Cloudvalt</strong><span>ADMIN CONSOLE</span></div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setError(''); }}>
              <Icon size={18} /><span>{label}</span>
              {id === 'feedback' && feedback.length > 0 && <span className="nav-count">{feedback.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note"><ShieldCheck size={16} /><span>Secure admin session</span></div>
          <div className="profile-row">
            <div className="avatar small-avatar">{(firebaseUser.displayName || firebaseUser.email || 'A').slice(0, 1).toUpperCase()}</div>
            <div className="profile-text"><strong>{firebaseUser.displayName || 'Administrator'}</strong><span>{firebaseUser.email}</span></div>
            <button className="icon-button logout-button" title="Sign out" onClick={() => signOut(auth)}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>Cloudvalt</span><ChevronRight size={15} /><strong>{navItems.find((item) => item.id === page)?.label}</strong></div>
          <div className="top-actions">
            <span className="live-pill"><i />Live data</span>
            <button className="icon-button refresh-button" title="Refresh data" disabled={loading} onClick={() => page === 'feedback' ? void loadFeedback() : void loadDashboard()}>
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CLOUDVALT OPERATIONS</p>
              <h1>{page === 'overview' ? 'Overview' : page === 'users' ? 'User directory' : 'Customer feedback'}</h1>
              <p className="subtitle">{page === 'feedback' ? 'Read ratings and messages submitted by Cloudvalt users.' : 'Monitor accounts, storage usage, and plan distribution.'}</p>
            </div>
            <button className="secondary-button" disabled={loading} onClick={() => page === 'feedback' ? void loadFeedback() : void loadDashboard()}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {error && <div className="alert error-alert page-alert"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}

          {page !== 'feedback' && (
            <>
              <section className="metric-grid">
                <MetricCard icon={Users} label="Total users" value={numberFormat.format(metrics?.totalUsers || 0)} detail="Cloudvalt accounts" tone="blue" />
                <MetricCard icon={CreditCard} label="Paid plan accounts" value={numberFormat.format(metrics?.paidUsers || 0)} detail={`${numberFormat.format(metrics?.freeUsers || 0)} free accounts`} tone="green" />
                <MetricCard icon={HardDrive} label="Storage used" value={formatBytes(metrics?.totalStorageBytes || 0)} detail="Across all user accounts" tone="violet" />
                <MetricCard icon={Activity} label="Plan value estimate" value={moneyFormat.format(metrics?.estimatedMonthlyRevenue || 0)} detail="Based on assigned plans; not payment reconciliation" tone="amber" />
              </section>

              <section className="panel users-panel">
                <div className="panel-heading">
                  <div><h2>{page === 'overview' ? 'Recently updated accounts' : 'All accounts'}</h2><p>Search and open a user record to inspect files and folders.</p></div>
                  <div className="users-toolbar">
                    <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" /></div>
                    {page === 'users' && <button className="secondary-button export-button" title="Export the matching accounts as CSV" disabled={!visibleUsers.length} onClick={() => exportUsersCsv(visibleUsers)}><Download size={16} /> Export CSV</button>}
                  </div>
                </div>
                {dashboard?.truncated && <div className="alert notice-alert"><AlertCircle size={16} />Showing the first 1,000 accounts.</div>}
                <UserTable users={page === 'overview' ? visibleUsers.slice(0, 8) : visibleUsers} openUser={openUser} />
                {page === 'overview' && visibleUsers.length > 8 && <button className="view-all" onClick={() => setPage('users')}>View all {numberFormat.format(visibleUsers.length)} users <ChevronRight size={16} /></button>}
              </section>
            </>
          )}

          {page === 'feedback' && (
            <section className="panel feedback-panel">
              <div className="panel-heading"><div><h2>Ratings and messages</h2><p>{numberFormat.format(feedback.length)} messages loaded</p></div><div className="feedback-summary"><Star size={17} fill="currentColor" /><span>{feedback.length ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : '—'}</span><small>average rating</small></div></div>
              {loading && feedback.length === 0 ? <LoadingRows /> : feedback.length === 0 ? <EmptyState title="No feedback yet" text="New ratings and messages from users will show up here." /> : (
                <div className="feedback-list">
                  {feedback.map((item) => <FeedbackCard key={item.id} feedback={item} onOpen={() => void openUser(item.userId)} />)}
                </div>
              )}
            </section>
          )}
          <footer className="page-footer"><span>Cloudvalt Admin</span><span>Private account data · Authorized access only</span></footer>
        </div>
      </main>

      {(detailLoading || details) && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}>
          <section className="detail-drawer" aria-label="User details">
            <div className="drawer-header"><div><p className="eyebrow">ACCOUNT RECORD</p><h2>{detailLoading ? 'Loading user…' : details?.user.name || details?.user.email || 'User details'}</h2></div><button className="icon-button" onClick={() => { setDetails(null); setDetailLoading(false); }}><X size={19} /></button></div>
            {detailLoading ? <div className="drawer-loading"><LoaderCircle className="spin" size={22} /></div> : details && <UserDetail details={details} />}
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Users; label: string; value: string; detail: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>;
}

function UserTable({ users, openUser }: { users: AdminUser[]; openUser: (uid: string) => void }) {
  if (!users.length) return <EmptyState title="No matching accounts" text="Try a different name, email, plan, or account ID." />;
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>ACCOUNT</th><th>PLAN</th><th>STORAGE</th><th>FILES</th><th>SUBSCRIPTION</th><th>UPDATED</th><th /></tr></thead><tbody>
    {users.map((user) => <tr key={user.id} onClick={() => openUser(user.id)}>
      <td><div className="account-cell"><UserAvatar user={user} /><div className="account-name"><strong>{user.name || 'Unnamed user'}</strong><span>{user.email || user.id}</span></div></div></td>
      <td><span className={`plan-chip ${user.planId === '100mb' ? 'free' : 'paid'}`}>{user.plan}</span></td>
      <td><div className="storage-cell"><span>{formatBytes(user.usedBytes)} <i>/ {formatBytes(user.maxBytes)}</i></span><div className="storage-track"><b style={{ width: `${Math.min(100, (user.usedBytes / Math.max(1, user.maxBytes)) * 100)}%` }} /></div></div></td>
      <td>{numberFormat.format(user.fileCount)}</td><td title={user.whopMembershipStatus ? `Whop membership${user.whopCancelAtPeriodEnd ? ' scheduled to end' : ''}` : 'No Whop status received'}><span className={`status-dot ${user.planId === '100mb' || /^(ended|canceled|cancelled|expired)$/.test(user.whopMembershipStatus) ? 'free-status' : 'paid-status'}`} />{subscriptionLabel(user)}</td><td>{formatDate(user.updatedAt)}</td><td><ChevronRight size={16} className="row-chevron" /></td>
    </tr>)}
  </tbody></table></div>;
}

function FeedbackCard({ feedback, onOpen }: { feedback: AdminFeedback; onOpen: () => void }) {
  return <article className="feedback-card"><div className="feedback-card-top"><div><strong>{feedback.userEmail || 'Cloudvalt user'}</strong><button className="subtle-link" onClick={onOpen}>Open account <ChevronRight size={13} /></button></div><span className="feedback-date">{formatDate(feedback.createdAt)}</span></div><div className="stars">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={15} fill={star <= feedback.rating ? 'currentColor' : 'none'} />)}<span>{feedback.rating}/5</span></div><p>{feedback.message}</p></article>;
}

function UserDetail({ details }: { details: UserDetails }) {
  const { user, files, folders, feedback } = details;
  const activeFiles = files.filter((file) => !file.isDeleted);
  const categories = activeFiles.reduce<Record<string, number>>((count, file) => {
    const type = file.type || 'other';
    count[type] = (count[type] || 0) + 1;
    return count;
  }, {});
  return <div className="drawer-content">
    <div className="detail-identity"><UserAvatar user={user} large /><div><strong>{user.name || 'Unnamed user'}</strong><span>{user.email}</span><code>{user.id}</code></div></div>
    <div className="detail-stat-grid"><div><span>Plan</span><strong>{user.plan}</strong></div><div><span>Storage</span><strong>{formatBytes(user.usedBytes)} / {formatBytes(user.maxBytes)}</strong></div><div><span>Files</span><strong>{numberFormat.format(activeFiles.length)}</strong></div><div><span>Folders</span><strong>{numberFormat.format(folders.filter((folder) => !folder.isDeleted).length)}</strong></div></div>
    <section className="drawer-section"><h3><CreditCard size={16} /> Subscription</h3><div className="subscription-facts"><div><span>Whop status</span><strong>{user.whopMembershipStatus || 'Not linked'}</strong></div><div><span>Cancellation</span><strong>{user.whopCancelAtPeriodEnd === null ? 'Not available' : user.whopCancelAtPeriodEnd ? 'Ends this period' : 'Not scheduled'}</strong></div><div><span>Current period ends</span><strong>{formatDate(user.whopCurrentPeriodEnd)}</strong></div></div><p className="muted">Dates appear when Whop sends them in a membership event.</p></section>
    <section className="drawer-section"><h3><FileText size={16} /> File types</h3>{Object.keys(categories).length ? <div className="category-list">{Object.entries(categories).map(([type, count]) => <span key={type}>{type}<b>{count}</b></span>)}</div> : <p className="muted">No active file records.</p>}</section>
    <section className="drawer-section"><h3><Folder size={16} /> Folders</h3>{folders.length ? <div className="record-list">{folders.slice(0, 12).map((folder) => <div key={folder.id}><span><Folder size={15} />{folder.name || 'Unnamed folder'}{folder.isDeleted && <em>Trash</em>}</span><b>{formatBytes(Number(folder.size || 0))}</b></div>)}</div> : <p className="muted">No folders.</p>}</section>
    <section className="drawer-section"><h3><MessageSquare size={16} /> Feedback</h3>{feedback.length ? feedback.slice(0, 5).map((item) => <div className="detail-feedback" key={item.id}><div className="stars">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={13} fill={star <= item.rating ? 'currentColor' : 'none'} />)}<span>{formatDate(item.createdAt)}</span></div><p>{item.message}</p></div>) : <p className="muted">No feedback from this account.</p>}</section>
    <p className="drawer-data-note"><Database size={14} /> Lists show up to 200 files and folders.</p>
  </div>;
}

function LoadingRows() {
  return <div className="loading-state"><LoaderCircle size={21} className="spin" /><span>Loading records…</span></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><div><ArrowDownToLine size={19} /></div><strong>{title}</strong><span>{text}</span></div>;
}

export default App;
