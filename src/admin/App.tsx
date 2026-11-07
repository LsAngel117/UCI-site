/**
 * Admin SPA routes (feature doc 10A).
 *
 * `/login` is public; everything else lives under the authenticated shell and
 * is guarded by `RequireAuth`. Section placeholders are generated from the
 * navigation model so a route and its sidebar entry can never drift apart.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './src/components/RequireAuth';
import { AdminLayout } from './src/layout/AdminLayout';
import { AuthProvider } from './src/lib/auth';
import { moduleLinks } from './src/lib/navigation';
import { DashboardPage } from './src/pages/DashboardPage';
import { LoginPage } from './src/pages/LoginPage';
import { NotFoundPage } from './src/pages/NotFoundPage';
import { SectionPlaceholderPage } from './src/pages/SectionPlaceholderPage';

/** Vite's `base` is `/panel/`; React Router wants it without the trailing slash. */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

const modules = moduleLinks();

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />

            {modules.map(({ item, parentLabel }) => (
              <Route
                key={item.to}
                path={item.to.replace(/^\//, '')}
                element={
                  <SectionPlaceholderPage
                    title={item.label}
                    description={item.description}
                    phase={item.phase}
                    parentLabel={parentLabel}
                  />
                }
              />
            ))}

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
