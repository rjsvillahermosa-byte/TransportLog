// Decorative animated background for the public pages. Purely visual — it sits
// behind the content (see .live-bg in index.css) and is hidden from assistive tech.
export default function LiveBackground() {
  return (
    <div className="live-bg" aria-hidden="true">
      <span className="live-blob live-blob-a" />
      <span className="live-blob live-blob-b" />
      <span className="live-blob live-blob-c" />
    </div>
  );
}
