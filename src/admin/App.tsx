/**
 * Admin SPA routes (feature docs 10A–10D2).
 *
 * `/login` is public; everything else lives under the authenticated shell and
 * is guarded by `RequireAuth`. Implemented modules get explicit routes and are
 * removed from the placeholder generator; pending modules keep their generated
 * honest placeholder. Permission guards add a friendly 403, while the API
 * remains the real authorization boundary.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './src/components/RequireAuth';
import {
  RequireAnyPermission,
  RequirePermission,
} from './src/components/content/RequirePermission';
import { AdminLayout } from './src/layout/AdminLayout';
import { AuthProvider } from './src/lib/auth';
import { moduleLinks } from './src/lib/navigation';
import { DashboardPage } from './src/pages/DashboardPage';
import { LoginPage } from './src/pages/LoginPage';
import { NotFoundPage } from './src/pages/NotFoundPage';
import { SectionIndexPage } from './src/pages/SectionIndexPage';
import { SectionPlaceholderPage } from './src/pages/SectionPlaceholderPage';
import { AuditPage } from './src/pages/admin/AuditPage';
import { ContactPage } from './src/pages/admin/ContactPage';
import { RolesPage } from './src/pages/admin/RolesPage';
import { SettingsPage } from './src/pages/admin/SettingsPage';
import { UsersPage } from './src/pages/admin/UsersPage';
import { ContentIndexPage } from './src/pages/content/ContentIndexPage';
import { SermonEditorPage } from './src/pages/content/sermons/SermonEditorPage';
import { SermonListPage } from './src/pages/content/sermons/SermonListPage';
import { SermonPreviewPage } from './src/pages/content/sermons/SermonPreviewPage';
import { MediaLibraryPage } from './src/pages/media/MediaLibraryPage';
import { NavigationPage } from './src/pages/site/NavigationPage';
import { SeoPage } from './src/pages/site/SeoPage';

/** Vite's `base` is `/panel/`; React Router wants it without the trailing slash. */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

/** Delivered modules keep their nav entry but no longer get a placeholder. */
const IMPLEMENTED_PATHS = new Set([
  '/contenido',
  '/contenido/sermones',
  '/media',
  '/media/biblioteca',
  '/sitio',
  '/sitio/navegacion',
  '/sitio/seo',
  '/administracion',
  '/administracion/usuarios',
  '/administracion/roles',
  '/administracion/auditoria',
  '/administracion/configuracion',
  '/administracion/contacto',
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

            <Route
              path="sitio"
              element={
                <RequireAnyPermission
                  permissions={['navigation.read', 'seo.read']}
                >
                  <SectionIndexPage sectionTo="/sitio" />
                </RequireAnyPermission>
              }
            />
            <Route
              path="sitio/navegacion"
              element={
                <RequirePermission permission="navigation.read">
                  <NavigationPage />
                </RequirePermission>
              }
            />
            <Route
              path="sitio/seo"
              element={
                <RequirePermission permission="seo.read">
                  <SeoPage />
                </RequirePermission>
              }
            />

            <Route
              path="administracion"
              element={
                <RequireAnyPermission
                  permissions={[
                    'users.read',
                    'roles.read',
                    'settings.read',
                    'audit.read',
                    'contact.read',
                  ]}
                >
                  <SectionIndexPage sectionTo="/administracion" />
                </RequireAnyPermission>
              }
            />
            <Route
              path="administracion/usuarios"
              element={
                <RequirePermission permission="users.read">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="administracion/roles"
              element={
                <RequirePermission permission="roles.read">
                  <RolesPage />
                </RequirePermission>
              }
            />
            <Route
              path="administracion/configuracion"
              element={
                <RequirePermission permission="settings.read">
                  <SettingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="administracion/auditoria"
              element={
                <RequirePermission permission="audit.read">
                  <AuditPage />
                </RequirePermission>
              }
            />
            <Route
              path="administracion/contacto"
              element={
                <RequirePermission permission="contact.read">
                  <ContactPage />
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
