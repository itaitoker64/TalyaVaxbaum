import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth.tsx';
import { useI18n } from './i18n/index.tsx';
import { Loading, ErrorBox, Icon } from './components/ui.tsx';
import { Login, Join } from './client/Auth.tsx';
import { Onboarding } from './client/Onboarding.tsx';
import { Today } from './client/Today.tsx';
import { Training } from './client/Training.tsx';
import { SessionScreen } from './client/Session.tsx';
import { LogView } from './shared/LogView.tsx';
import { Nutrition, RecipeScreen } from './client/Nutrition.tsx';
import { Progress } from './client/Progress.tsx';
import { GoalDetail } from './shared/GoalDetail.tsx';
import { CheckinScreen } from './client/Checkin.tsx';
import { Messages } from './shared/Messages.tsx';
import { PublicRecipe } from './client/PublicRecipe.tsx';
import { Account } from './shared/Account.tsx';
import { Attention } from './coach/Attention.tsx';
import { Clients } from './coach/Clients.tsx';
import { ClientProfile } from './coach/ClientProfile.tsx';
import { Library } from './coach/Library.tsx';
import { Programs, ProgramEditor } from './coach/Programs.tsx';
import { Recipes, RecipeEditor } from './coach/Recipes.tsx';
import { CoachSettings } from './coach/Settings.tsx';

function Topbar({ unread }: { unread?: boolean }) {
  const { me } = useAuth();
  const { t } = useI18n();
  const u = me?.user;
  return (
    <header className="topbar">
      <Link to={u?.role === 'coach' ? '/coach' : '/'} className="brand">
        <span className="brand-mark">T</span>
        <span>{t('app.name')}</span>
      </Link>
      <span className="spacer" />
      {u?.role === 'client' && (
        <Link to="/messages" className="iconbtn" aria-label={t('nav.messages')}>
          <Icon name="chat" />
          {unread && <span className="dot" />}
        </Link>
      )}
      <Link to="/account" className="iconbtn" aria-label={t('settings.profile')}>
        {u?.name?.slice(0, 1).toUpperCase()}
      </Link>
    </header>
  );
}

function DemoBanner() {
  const { me } = useAuth();
  const { t } = useI18n();
  return me?.user?.is_demo ? <div className="demo-banner">{t('common.demoBanner')}</div> : null;
}

function ClientLayout() {
  const { me } = useAuth();
  const { t } = useI18n();
  const loc = useLocation();
  if (!me?.onboardingDone && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
  const tabs = [
    { to: '/', icon: 'today', label: t('tab.today'), end: true },
    { to: '/training', icon: 'training', label: t('tab.training') },
    { to: '/nutrition', icon: 'nutrition', label: t('tab.nutrition') },
    { to: '/progress', icon: 'progress', label: t('tab.progress') },
  ] as const;
  return (
    <div className="app">
      <DemoBanner />
      <Topbar />
      <nav className="tabbar" aria-label="main">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={'end' in tab} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

function CoachLayout() {
  const { t } = useI18n();
  const links = [
    { to: '/coach', label: t('coach.attention'), end: true },
    { to: '/coach/clients', label: t('coach.clients') },
    { to: '/coach/programs', label: t('coach.programs') },
    { to: '/coach/library', label: t('coach.library') },
    { to: '/coach/recipes', label: t('coach.recipes') },
    { to: '/coach/settings', label: t('coach.settings') },
  ];
  return (
    <div className="app">
      <DemoBanner />
      <Topbar />
      <nav className="coachnav" aria-label="coach">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="main wide">
        <Outlet />
      </main>
    </div>
  );
}

function Gate() {
  const { me, loading, error, reload } = useAuth();
  if (loading && !me) return <Loading />;
  if (error && !me) return <div className="main"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!me?.user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RoleHome() {
  const { me } = useAuth();
  return me?.user?.role === 'coach' ? <Navigate to="/coach" replace /> : <ClientLayout />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/r/:token" element={<PublicRecipe />} />
        <Route element={<Gate />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<RoleHome />}>
            <Route index element={<Today />} />
            <Route path="training" element={<Training />} />
            <Route path="training/session/:sid" element={<SessionScreen />} />
            <Route path="training/log/:lid" element={<LogView />} />
            <Route path="nutrition" element={<Nutrition />} />
            <Route path="nutrition/recipe/:id" element={<RecipeScreen />} />
            <Route path="progress" element={<Progress />} />
            <Route path="progress/goal/:gid" element={<GoalDetail />} />
            <Route path="checkin" element={<CheckinScreen />} />
            <Route path="messages" element={<Messages />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="coach" element={<CoachLayout />}>
            <Route index element={<Attention />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:cid/*" element={<ClientProfile />} />
            <Route path="logs/:lid" element={<LogView />} />
            <Route path="goals/:gid" element={<GoalDetail />} />
            <Route path="programs" element={<Programs />} />
            <Route path="programs/:pid" element={<ProgramEditor />} />
            <Route path="library" element={<Library />} />
            <Route path="recipes" element={<Recipes />} />
            <Route path="recipes/:id" element={<RecipeEditor />} />
            <Route path="settings" element={<CoachSettings />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="account" element={<Account />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
