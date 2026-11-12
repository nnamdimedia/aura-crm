/**
 * Release view — embeds AuraRelease_v2.html.
 * The HTML file lives in /public so Vite copies it into dist/ on every build
 * and GitHub Pages serves it from the same origin as the app (no sandbox).
 * Full native React port is a later sprint.
 */

const RELEASE_URL = `${import.meta.env.BASE_URL}AuraRelease_v2.html`;

export default function Release() {
  return (
    <div style={{ margin: '-12px', height: 'calc(100vh - 52px - 60px)' }}>
      <iframe
        src={RELEASE_URL}
        title="AuraRelease"
        style={{ width: '100%', height: '100%', border: 'none', background: '#0A0A0A' }}
        allow="camera"
      />
    </div>
  );
}
