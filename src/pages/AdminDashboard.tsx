import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck, RefreshCw, Eye, CheckCircle, XCircle, Clock,
  Building2, Users, LayoutDashboard, LogOut, Trash2, Pencil,
  UserPlus, Search, ChevronDown,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface PharmacyApplication {
  id: string;
  pharmacy_name: string;
  address: string;
  phone: string;
  email: string;
  license_number: string;
  license_expiry_date: string;
  issuing_authority: string;
  pharmacist_name: string;
  pharmacist_email: string;
  pharmacist_phone: string;
  opening_time: string;
  closing_time: string;
  accepts_medical_aid: boolean;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  pharmacy_id: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'patient' | 'pharmacist' | 'admin';
  created_at: string;
}

// ── Status config ─────────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending:  { label: 'Pending',  icon: Clock,       className: 'bg-warning/10 text-warning border-warning/20'             },
  approved: { label: 'Approved', icon: CheckCircle, className: 'bg-success/10 text-success border-success/20'             },
  rejected: { label: 'Rejected', icon: XCircle,     className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const roleColors: Record<string, string> = {
  admin:       'bg-primary/10 text-primary border-primary/20',
  pharmacist:  'bg-blue-500/10 text-blue-600 border-blue-500/20',
  patient:     'bg-muted text-muted-foreground border-border',
};

type Tab = 'overview' | 'applications' | 'users';

// ── Component ─────────────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin]         = useState(false);
  const [activeTab, setActiveTab]     = useState<Tab>('overview');

  // Applications state
  const [applications, setApplications] = useState<PharmacyApplication[]>([]);
  const [appLoading, setAppLoading]     = useState(false);
  const [appFilter, setAppFilter]       = useState('all');
  const [selectedApp, setSelectedApp]   = useState<PharmacyApplication | null>(null);
  const [adminNotes, setAdminNotes]     = useState('');
  const [processing, setProcessing]     = useState(false);

  // Users state
  const [users, setUsers]               = useState<UserRow[]>([]);
  const [userLoading, setUserLoading]   = useState(false);
  const [userSearch, setUserSearch]     = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userDialog, setUserDialog]     = useState<'edit' | 'delete' | 'create' | null>(null);
  const [userForm, setUserForm]         = useState({ full_name: '', phone: '', role: 'patient' as UserRow['role'] });
  const [newUserForm, setNewUserForm]   = useState({ email: '', full_name: '', phone: '', role: 'patient' as UserRow['role'] });
  const [userProcessing, setUserProcessing] = useState(false);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // ── Role check ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data, error } = await (supabase as any).rpc('has_admin_role', {
        _user_id: user.id,
        _role_name: 'admin',
      });
      if (error || data !== true) {
        toast.error('Access denied. Admin role required.');
        navigate('/');
        return;
      }
      setIsAdmin(true);
    };
    check();
  }, [user, navigate]);

  // ── Fetch applications ────────────────────────────────────────────────────────
  const fetchApplications = async () => {
    setAppLoading(true);
    const { data, error } = await supabase
      .from('pharmacy_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load applications: ' + error.message);
    else setApplications((data ?? []) as PharmacyApplication[]);
    setAppLoading(false);
  };

  // ── Fetch users ───────────────────────────────────────────────────────────────
  // Calls the admin-list-users edge function which uses the service role
  // to access auth.users directly — no RPC migration needed.
  // Falls back to profiles table so users without completed signup still show.
  const fetchUsers = async () => {
    setUserLoading(true);

    // Fetch profiles + roles in parallel from the client
    const [profilesRes, rolesRes] = await Promise.all([
      (supabase as any).from('profiles').select('user_id, full_name, phone, created_at'),
      (supabase as any).from('user_roles').select('user_id, role'),
    ]);

    if (profilesRes.error) {
      toast.error('Failed to load users: ' + profilesRes.error.message);
      setUserLoading(false);
      return;
    }

    // Fetch auth user list (emails) via edge function
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('admin-list-users');

    const roleMap: Record<string, string> = {};
    (rolesRes.data ?? []).forEach((r: any) => { roleMap[r.user_id] = r.role; });

    const emailMap: Record<string, string> = {};
    if (!edgeError && edgeData?.users) {
      edgeData.users.forEach((u: any) => { emailMap[u.id] = u.email; });
    }

    // Build from profiles — every confirmed user has a profile row
    const fromProfiles: UserRow[] = (profilesRes.data ?? []).map((p: any) => ({
      id:         p.user_id,
      email:      emailMap[p.user_id] ?? '—',
      full_name:  p.full_name,
      phone:      p.phone,
      role:       (roleMap[p.user_id] ?? 'patient') as UserRow['role'],
      created_at: p.created_at,
    }));

    // Also include auth users that have no profile yet (invited but not signed up)
    if (!edgeError && edgeData?.users) {
      const profileIds = new Set(fromProfiles.map((u) => u.id));
      const pending: UserRow[] = edgeData.users
        .filter((u: any) => !profileIds.has(u.id))
        .map((u: any) => ({
          id:         u.id,
          email:      u.email ?? '—',
          full_name:  u.user_metadata?.full_name ?? null,
          phone:      u.user_metadata?.phone ?? null,
          role:       (roleMap[u.id] ?? 'patient') as UserRow['role'],
          created_at: u.created_at,
        }));
      setUsers([...fromProfiles, ...pending]);
    } else {
      setUsers(fromProfiles);
    }

    setUserLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchApplications();
    fetchUsers();
  }, [isAdmin]);

  // ── Application actions ────────────────────────────────────────────────────────
  const handleAppAction = async (id: string, action: 'approved' | 'rejected') => {
    setProcessing(true);

    if (action === 'approved') {
      // Edge function handles: create auth user → profile → role → pharmacy record → mark approved
      const { data, error } = await supabase.functions.invoke('approve-pharmacy', {
        body: { application_id: id, admin_notes: adminNotes },
      });

      if (error) {
        const msg = (data as any)?.error ?? error.message;
        toast.error('Approval failed: ' + msg);
        setProcessing(false);
        return;
      }

      // Stamp reviewed_by (edge function sets status/pharmacy_id)
      await (supabase
        .from('pharmacy_applications')
        .update({ reviewed_by: user?.id } as any)
        .eq('id', id) as any);

      toast.success('Pharmacy approved! Pharmacist invite sent.');

    } else {
      // Rejection is a simple status update — no edge function needed
      const { error } = await (supabase
        .from('pharmacy_applications')
        .update({
          status:      'rejected',
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        } as any)
        .eq('id', id) as any);

      if (error) {
        toast.error('Rejection failed: ' + error.message);
        setProcessing(false);
        return;
      }

      toast.success('Application rejected.');
    }

    await fetchApplications();
    setSelectedApp(null);
    setAdminNotes('');
    setProcessing(false);
  };

  // ── User CRUD ──────────────────────────────────────────────────────────────────

  // UPDATE: edit profile fields + role
  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setUserProcessing(true);

    // Update profile
    const { error: pErr } = await (supabase as any)
      .from('profiles')
      .update({ full_name: userForm.full_name, phone: userForm.phone })
      .eq('user_id', selectedUser.id);

    // Update role: delete existing then insert new
    const { error: dErr } = await (supabase as any)
      .from('user_roles')
      .delete()
      .eq('user_id', selectedUser.id);

    const { error: rErr } = await (supabase as any)
      .from('user_roles')
      .insert({ user_id: selectedUser.id, role: userForm.role });

    if (pErr || dErr || rErr) {
      toast.error('Update failed: ' + (pErr?.message ?? dErr?.message ?? rErr?.message));
    } else {
      toast.success('User updated successfully.');
    }

    setUserProcessing(false);
    setUserDialog(null);
    setSelectedUser(null);
    await fetchUsers();
  };

  // DELETE: remove profile + roles (auth user stays — admin can deactivate manually)
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setUserProcessing(true);

    const { error: rErr } = await (supabase as any)
      .from('user_roles')
      .delete()
      .eq('user_id', selectedUser.id);

    const { error: pErr } = await (supabase as any)
      .from('profiles')
      .delete()
      .eq('user_id', selectedUser.id);

    if (rErr || pErr) {
      toast.error('Delete failed: ' + (rErr?.message ?? pErr?.message));
    } else {
      toast.success('User removed from the system.');
    }

    setUserProcessing(false);
    setUserDialog(null);
    setSelectedUser(null);
    await fetchUsers();
  };

  // CREATE: invite a new user via Supabase auth admin invite
  const handleCreateUser = async () => {
    setUserProcessing(true);

    // Use edge function or RPC to call admin.inviteUserByEmail server-side
    const { data, error } = await supabase.functions.invoke('admin-invite-user', {
      body: {
        email:     newUserForm.email,
        full_name: newUserForm.full_name,
        phone:     newUserForm.phone,
        role:      newUserForm.role,
      },
    });

    if (error || (data as any)?.error) {
      toast.error('Failed to create user: ' + (error?.message ?? (data as any)?.error));
    } else {
      toast.success(`Invite sent to ${newUserForm.email}`);
      setNewUserForm({ email: '', full_name: '', phone: '', role: 'patient' });
      setUserDialog(null);
      await fetchUsers();
    }
    setUserProcessing(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────────
  const filteredApps  = appFilter === 'all' ? applications : applications.filter((a) => a.status === appFilter);
  const filteredUsers = users.filter((u) =>
    [u.email, u.full_name ?? '', u.role].some((v) =>
      v.toLowerCase().includes(userSearch.toLowerCase())
    )
  );

  const appCounts = {
    all:      applications.length,
    pending:  applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  const userCounts = {
    total:      users.length,
    admins:     users.filter((u) => u.role === 'admin').length,
    pharmacists: users.filter((u) => u.role === 'pharmacist').length,
    patients:   users.filter((u) => u.role === 'patient').length,
  };

  // ── Loading ────────────────────────────────────────────────────────────────────
  if (authLoading || (user && !isAdmin)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="h-10 w-10 text-primary mx-auto mb-3 animate-pulse" />
          <p className="text-muted-foreground">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* ── Admin Sidebar Nav ── */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <p className="font-heading font-bold text-sm text-foreground">Admin Panel</p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{user?.email}</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-1">
          {(
            [
              { key: 'overview',      label: 'Overview',      icon: LayoutDashboard, badge: undefined },
              { key: 'applications',  label: 'Applications',  icon: Building2,       badge: appCounts.pending },
              { key: 'users',         label: 'Manage Users',  icon: Users,           badge: undefined },
            ] as { key: Tab; label: string; icon: React.ElementType; badge: number | undefined }[]
          ).map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`
                w-full flex items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                ${activeTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'}
              `}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              {badge != null && badge > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === key ? 'bg-white/20 text-white' : 'bg-warning/20 text-warning'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-border">
          <button
            onClick={() => { supabase.auth.signOut(); navigate('/auth'); }}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 h-14">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-heading font-bold text-base">Admin Panel</span>
        </div>
        <button
          onClick={() => { supabase.auth.signOut(); navigate('/auth'); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around px-2 py-2">
        {([
          { key: 'overview',     label: 'Overview',     icon: LayoutDashboard },
          { key: 'applications', label: 'Applications', icon: Building2,       badge: appCounts.pending },
          { key: 'users',        label: 'Users',        icon: Users },
        ] as { key: Tab; label: string; icon: React.ElementType; badge?: number }[]).map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors
              ${activeTab === key ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {badge != null && badge > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{label}</span>
            {activeTab === key && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </nav>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto p-4 pt-20 md:pt-8 md:p-8 pb-24 md:pb-8 min-w-0">

        {/* ══════════════════════════════════ OVERVIEW ══════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 w-full max-w-5xl">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">Overview</h1>
              <p className="text-sm text-muted-foreground mt-1">System-wide summary</p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Users',    value: userCounts.total,       icon: Users,       color: 'text-blue-600'  },
                { label: 'Pharmacists',    value: userCounts.pharmacists,  icon: Building2,   color: 'text-emerald-600' },
                { label: 'Pending Apps',   value: appCounts.pending,       icon: Clock,       color: 'text-amber-600' },
                { label: 'Active Pharmacies', value: appCounts.approved,   icon: CheckCircle, color: 'text-primary'   },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-2xl font-bold text-foreground mt-0.5">{s.value}</p>
                      </div>
                      <s.icon className={`h-8 w-8 ${s.color} opacity-80`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* User breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">User Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Patients',    count: userCounts.patients,    pct: userCounts.total ? Math.round(userCounts.patients / userCounts.total * 100) : 0,    color: 'bg-muted-foreground' },
                    { label: 'Pharmacists', count: userCounts.pharmacists, pct: userCounts.total ? Math.round(userCounts.pharmacists / userCounts.total * 100) : 0, color: 'bg-blue-500' },
                    { label: 'Admins',      count: userCounts.admins,      pct: userCounts.total ? Math.round(userCounts.admins / userCounts.total * 100) : 0,      color: 'bg-primary' },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-medium">{row.count} ({row.pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border">
                        <div className={`h-1.5 rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Application status breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Application Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: 'Pending',  count: appCounts.pending,  className: 'text-warning'     },
                    { label: 'Approved', count: appCounts.approved, className: 'text-success'     },
                    { label: 'Rejected', count: appCounts.rejected, className: 'text-destructive' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-border p-3">
                      <p className={`text-2xl font-bold ${s.className}`}>{s.count}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════ APPLICATIONS ══════════════════════════════════ */}
        {activeTab === 'applications' && (
          <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-heading text-2xl font-bold text-foreground">Pharmacy Applications</h1>
                <p className="text-sm text-muted-foreground mt-1">Review and approve incoming pharmacy registrations</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchApplications} disabled={appLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${appLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
              {(['all','pending','approved','rejected'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setAppFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    appFilter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  <span className="ml-1.5 opacity-70">
                    {f === 'all' ? appCounts.all : appCounts[f]}
                  </span>
                </button>
              ))}
            </div>

            {appLoading ? (
              <p className="text-center py-12 text-muted-foreground">Loading applications…</p>
            ) : filteredApps.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">No applications found.</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pharmacy</TableHead>
                      <TableHead>Pharmacist</TableHead>
                      <TableHead>License No.</TableHead>
                      <TableHead>Med. Aid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApps.map((app) => {
                      const cfg = statusConfig[app.status] ?? statusConfig.pending;
                      const StatusIcon = cfg.icon;
                      return (
                        <TableRow key={app.id}>
                          <TableCell className="font-medium">{app.pharmacy_name}</TableCell>
                          <TableCell>{app.pharmacist_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{app.license_number}</TableCell>
                          <TableCell>
                            <Badge variant={app.accepts_medical_aid ? 'default' : 'outline'}>
                              {app.accepts_medical_aid ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cfg.className}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(app.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { setSelectedApp(app); setAdminNotes(app.admin_notes ?? ''); }}
                            >
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )}

        {/* ════════════════════════════════ USERS ════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-heading text-2xl font-bold text-foreground">Manage Users</h1>
                <p className="text-sm text-muted-foreground mt-1">View, edit roles, and remove users</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={userLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${userLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setUserDialog('create')}>
                  <UserPlus className="h-4 w-4 mr-1" /> Invite User
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or role…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {userLoading ? (
              <p className="text-center py-12 text-muted-foreground">Loading users…</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">No users found.</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.phone ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={roleColors[u.role]}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => {
                                setSelectedUser(u);
                                setUserForm({ full_name: u.full_name ?? '', phone: u.phone ?? '', role: u.role });
                                setUserDialog('edit');
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                            {/* Prevent admin from deleting themselves */}
                            {u.id !== user?.id && (
                              <Button
                                size="sm" variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => { setSelectedUser(u); setUserDialog('delete'); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════ APPLICATION DETAIL DIALOG ══════════════════ */}
      <Dialog open={!!selectedApp} onOpenChange={(o) => { if (!o) { setSelectedApp(null); setAdminNotes(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedApp && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {selectedApp.pharmacy_name}
                </DialogTitle>
                <DialogDescription>Application details</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <Section title="Pharmacy Info">
                  <Detail label="Address"  value={selectedApp.address} />
                  <Detail label="Phone"    value={selectedApp.phone}   />
                  <Detail label="Email"    value={selectedApp.email}   />
                </Section>
                <Section title="License">
                  <Detail label="Number"    value={selectedApp.license_number}     />
                  <Detail label="Expiry"    value={selectedApp.license_expiry_date} />
                  <Detail label="Authority" value={selectedApp.issuing_authority}   />
                </Section>
                <Section title="Pharmacist in Charge">
                  <Detail label="Name"  value={selectedApp.pharmacist_name}  />
                  <Detail label="Email" value={selectedApp.pharmacist_email} />
                  <Detail label="Phone" value={selectedApp.pharmacist_phone} />
                </Section>
                <Section title="Operating Hours">
                  <Detail label="Opens"       value={selectedApp.opening_time}                      />
                  <Detail label="Closes"      value={selectedApp.closing_time}                      />
                  <Detail label="Medical Aid" value={selectedApp.accepts_medical_aid ? 'Yes' : 'No'} />
                </Section>

                {selectedApp.status === 'pending' ? (
                  <div className="space-y-2">
                    <Label>Admin Notes (optional)</Label>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Notes about this decision…"
                      rows={3}
                    />
                  </div>
                ) : selectedApp.admin_notes ? (
                  <Section title="Admin Notes">
                    <p className="text-muted-foreground">{selectedApp.admin_notes}</p>
                  </Section>
                ) : null}

                {selectedApp.reviewed_at && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed {new Date(selectedApp.reviewed_at).toLocaleString()}
                  </p>
                )}
              </div>

              {selectedApp.status === 'pending' && (
                <DialogFooter className="gap-2 pt-2">
                  <Button
                    variant="ghost" className="text-destructive hover:text-destructive"
                    disabled={processing}
                    onClick={() => handleAppAction(selectedApp.id, 'rejected')}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {processing ? 'Processing…' : 'Reject'}
                  </Button>
                  <Button
                    disabled={processing}
                    onClick={() => handleAppAction(selectedApp.id, 'approved')}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    {processing ? 'Approving…' : 'Approve'}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════ EDIT USER DIALOG ══════════════════ */}
      <Dialog open={userDialog === 'edit'} onOpenChange={(o) => { if (!o) { setUserDialog(null); setSelectedUser(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                value={userForm.full_name}
                onChange={(e) => setUserForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={userForm.phone}
                onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+267 71 234 567"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={userForm.role}
                onValueChange={(v) => setUserForm((f) => ({ ...f, role: v as UserRow['role'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">Patient</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setUserDialog(null); setSelectedUser(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={userProcessing}>
              {userProcessing ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════ DELETE USER DIALOG ══════════════════ */}
      <Dialog open={userDialog === 'delete'} onOpenChange={(o) => { if (!o) { setUserDialog(null); setSelectedUser(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>
              This removes <strong>{selectedUser?.full_name ?? selectedUser?.email}</strong> from the system.
              Their auth account is retained but they will lose all profile data and role access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2 gap-2">
            <Button variant="outline" onClick={() => { setUserDialog(null); setSelectedUser(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={userProcessing}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {userProcessing ? 'Removing…' : 'Remove User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════ INVITE USER DIALOG ══════════════════ */}
      <Dialog open={userDialog === 'create'} onOpenChange={(o) => { if (!o) setUserDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
            <DialogDescription>
              An invite email will be sent. They set their own password on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                value={newUserForm.full_name}
                onChange={(e) => setNewUserForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={newUserForm.phone}
                onChange={(e) => setNewUserForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+267 71 234 567"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={newUserForm.role}
                onValueChange={(v) => setNewUserForm((f) => ({ ...f, role: v as UserRow['role'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">Patient</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setUserDialog(null)}>Cancel</Button>
            <Button
              onClick={handleCreateUser}
              disabled={userProcessing || !newUserForm.email}
            >
              <UserPlus className="h-4 w-4 mr-1" />
              {userProcessing ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="pt-2">
    <h4 className="font-semibold text-foreground mb-1 border-b pb-1">{title}</h4>
    <div className="space-y-1">{children}</div>
  </div>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <span className="text-muted-foreground shrink-0">{label}:</span>
    <span className="text-foreground font-medium text-right">{value}</span>
  </div>
);

export default AdminDashboard;