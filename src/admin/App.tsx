/**
 * Admin SPA routes (feature docs 10A–10C).
 *
 * `/login` is public; everything else lives under the authenticated shell and
 * is guarded by `RequireAuth`. Implemented modules get explicit routes and are
 * removed from the placeholder generator; pending modules keep their generated
 * honest placeholder. Permission guards add a friendly 403, while the API
 * remains the real authorization boundary.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './src/components/RequireAuth';
import { RequirePermission } from './src/components/content/RequirePermission';
import { AdminLayout } from './src/layout/AdminLayout';
import { AuthProvider } from './src/lib/auth';
import { moduleLinks } from './src/lib/navigation';
import { DashboardPage } from './src/pages/DashboardPage';
import { LoginPage } from './src/pages/LoginPage';
import { NotFoundPage } from './src/pages/NotFoundPage';
import { SectionPlaceholderPage } from './src/pages/SectionPlaceholderPage';
import { ContentIndexPage } from './src/pages/content/ContentIndexPage';
import { SermonEditorPage } from './src/pages/content/sermons/SermonEditorPage';
import { SermonListPage } from './src/pages/content/sermons/SermonListPage';
import { SermonPreviewPage } from './src/pages/content/sermons/SermonPreviewPage';
import { MediaLibraryPage } from './src/pages/media/MediaLibraryPage';

/** Vite's `base` is `/panel/`; React Router wants it without the trailing slash. */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

/** Modules delivered by 10B/10C keep their nav entry but no longer get a placeholder. */
const IMPLEMENTED_PATHS = new Set([
  '/contenido',
  '/contenido/sermones',
  '/media',
  '/media/biblioteca',
]);

const modules = moduleLinks().filter(
  ({ item }) => !IMPLEMENTED_PATHS.has(item.to),
);

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

            <Route path="contenido" element={<ContentIndexPage />} />
            <Route
              path="contenido/sermones"
              element={
                <RequirePermission permission="sermons.read">
                  <SermonListPage />
                </RequirePermission>
              }
            />
            <Route
              path="contenido/sermones/nuevo"
              element={
                <RequirePermission permission="sermons.create">
                  <SermonEditorPage />
                </RequirePermission>
              }
            />
            <Route
              path="contenido/sermones/:id"
              element={
                <RequirePermission permission="sermons.read">
                  <SermonEditorPage />
                </RequirePermission>
              }
            />
            <Route
              path="contenido/sermones/:id/preview"
              element={
                <RequirePermission permission="sermons.read">
                  <SermonPreviewPage />
                </RequirePermission>
              }
            />

            <Route
              path="media"
              element={
                <RequirePermission permission="media.read">
                  <Navigate to="/media/biblioteca" replace />
                </RequirePermission>
              }
            />
            <Route
              path="media/biblioteca"
              element={
                <RequirePermission permission="media.read">
                  <MediaLibraryPage />
                </RequirePermission>
              }
            />

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
