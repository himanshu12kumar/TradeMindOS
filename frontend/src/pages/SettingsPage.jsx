import EmailSettings from '../components/EmailSettings';

export default function SettingsPage() {
  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: 680 }}>
        <div style={{ marginBottom: 32 }} className="animate-in">
          <h1>⚙️ Settings</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '0.9rem' }}>
            Manage your account preferences and notification settings.
          </p>
        </div>
        <div className="animate-in">
          <EmailSettings />
        </div>
      </div>
    </div>
  );
}
