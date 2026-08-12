/** Shared docs table column classes — progressive reveal by breakpoint. */
export const docsCol = {
  name: "page-pl py-2.5 pr-2 font-medium sm:pr-3",
  client: "hidden px-2 py-2.5 font-medium sm:table-cell sm:px-3",
  erp: "hidden px-2 py-2.5 font-medium md:table-cell md:px-3",
  team: "hidden px-2 py-2.5 font-medium lg:table-cell lg:px-3",
  anzsco: "hidden px-2 py-2.5 font-medium xl:table-cell xl:px-3",
  status: "px-2 py-2.5 font-medium sm:px-3",
  sources: "hidden px-2 py-2.5 font-medium md:table-cell md:px-3",
  uploaded: "hidden px-2 py-2.5 font-medium lg:table-cell lg:px-3",
  actions: "page-pr w-11 py-2.5 pl-1 text-right font-medium sm:w-12 sm:pl-2",
} as const;

export const docsCell = {
  name: "page-pl min-w-0 py-3 pr-2 sm:pr-3",
  client: "hidden max-w-[9rem] px-2 py-3 sm:table-cell sm:px-3",
  erp: "hidden max-w-[7rem] px-2 py-3 md:table-cell md:px-3",
  team: "hidden max-w-[7rem] px-2 py-3 lg:table-cell lg:px-3",
  anzsco: "hidden max-w-[6rem] px-2 py-3 xl:table-cell xl:px-3",
  status: "px-2 py-3 sm:px-3",
  sources: "hidden px-2 py-3 md:table-cell md:px-3",
  uploaded: "hidden max-w-[9rem] px-2 py-3 lg:table-cell lg:px-3",
  actions: "page-pr w-11 py-3 pl-1 text-right sm:w-12 sm:pl-2",
} as const;

export function DocsTableHead() {
  return (
    <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]">
      <tr className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted)]">
        <th className={docsCol.name} scope="col">
          Name
        </th>
        <th className={docsCol.client} scope="col">
          Client
        </th>
        <th className={docsCol.erp} scope="col">
          ERP
        </th>
        <th className={docsCol.team} scope="col">
          Team
        </th>
        <th className={docsCol.anzsco} scope="col">
          ANZSCO
        </th>
        <th className={docsCol.status} scope="col">
          Status
        </th>
        <th className={docsCol.sources} scope="col">
          Sources
        </th>
        <th className={docsCol.uploaded} scope="col">
          Uploaded
        </th>
        <th className={docsCol.actions} scope="col">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}
