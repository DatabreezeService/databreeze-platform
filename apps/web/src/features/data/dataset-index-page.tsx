export interface DatasetCardV1 {
  readonly datasetId: string;
  readonly label: string;
  readonly health: 'READY' | 'NEEDS_REVIEW' | 'BLOCKED';
  readonly versionLabel: string;
}

export function DatasetIndexPage({
  locale,
  datasets,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly datasets: readonly DatasetCardV1[];
}) {
  return (
    <main className="dataset-index-page">
      <h1>{locale === 'vi-VN' ? 'Dữ liệu' : 'Data'}</h1>
      <ul>
        {datasets.map((dataset) => (
          <li key={dataset.datasetId}>
            <article>
              <h2>{dataset.label}</h2>
              <p>{dataset.versionLabel}</p>
              <p>{dataset.health}</p>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
