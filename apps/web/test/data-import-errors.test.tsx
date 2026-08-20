import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportReviewWorkspace } from '../src/features/data/import-review-workspace.tsx';
import { ImportSession } from '../src/features/data/import-session.ts';

function validCsvBytes(): ArrayBuffer {
  return new TextEncoder().encode('name,amount\nLan,10\n').buffer;
}

async function failedSession(code: string, locale: 'en' | 'vi-VN'): Promise<ImportSession> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  const session = new ImportSession({
    destination: { kind: 'NEW_DATASET' },
    datasetName: 'Import regression',
    files: [{ fileName: 'rows.csv', bytes: validCsvBytes() }],
    locale,
  });
  await session.start();
  return session;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('[DDA-002][WEB-021] data-import problem presentation', () => {
  it('explains the 1,000,000-row limit in Vietnamese and offers reselect instead of retry', async () => {
    const onCancel = vi.fn();
    const session = await failedSession('DDA_INTAKE_LIMIT_ROWS', 'vi-VN');

    render(
      <ImportReviewWorkspace
        session={session}
        locale="vi-VN"
        onApproved={() => undefined}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(/1\.000\.000 dòng/u)).toBeTruthy();
    expect(screen.getByText(/chia tệp/u)).toBeTruthy();
    expect(screen.queryByText('DDA_INTAKE_LIMIT_ROWS')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn tệp khác' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'DDA_INTAKE_MALFORMED_ENCODING',
      'The CSV character encoding is malformed. Save it as UTF-8 or Windows-1258, then choose the file again.',
    ],
    [
      'DDA_INTAKE_UNSUPPORTED_ENCODING',
      'The CSV character encoding is not supported. Save it as UTF-8 or Windows-1258, then choose the file again.',
    ],
  ])('localizes %s in English without exposing the raw code', async (code, message) => {
    const session = await failedSession(code, 'en');

    render(
      <ImportReviewWorkspace
        session={session}
        locale="en"
        onApproved={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText(code)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeTruthy();
  });
});
