export default function EvidencePage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace / evidence</p>
          <h1>Keep the proof close.</h1>
          <p className="page-lede">
            Reconciliation runs and GitHub source mapping will appear here once a project exists.
          </p>
        </div>
      </header>
      <section className="panel panel-large">
        <p className="eyebrow">Integration status</p>
        <h2>GitHub is not connected.</h2>
        <p className="panel-copy">
          The current backend safely supports repository mapping and bounded pull-request ingestion.
          Tenant-specific OAuth and commit ingestion are not yet exposed, so this interface will not
          pretend otherwise.
        </p>
      </section>
    </>
  )
}
