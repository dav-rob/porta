interface Props {
  connected: boolean;
}

export function ConnectionBanner({ connected }: Props) {
  if (connected) return null;

  return (
    <div className="connection-banner" role="alert" aria-live="polite">
      <span className="connection-banner-dot" aria-hidden="true" />
      <span className="connection-banner-text">
        <strong>Antigravity is not running.</strong> Start it from your SSH
        session with{" "}
        <code className="connection-banner-cmd">runantigravity</code>, then
        refresh this page.
      </span>
    </div>
  );
}
