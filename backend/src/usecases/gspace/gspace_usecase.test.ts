// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Gerege Space usecase + client-ийн unit тестүүд. Гол зорилго: КВОТ хатуу
// баригдах (ижил нэртэй файлыг орлуулахад л хасалт хийгдэнэ), тохируулаагүй үед
// endpoint бүр ойлгомжтой алдаа өгөх, path traversal хаагдах.

import { describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import { background } from '../../pkg/ctx/ctx.js';
import { safeSegment, type FileInfo, type GSpaceClient } from '../../pkg/gspace/gspace.js';
import { newGSpaceUsecase } from './gspace_usecase.js';

const userId = '11111111-1111-1111-1111-111111111111';
const quota = 2 << 20; // 2 MiB

function file(name: string, size: number): FileInfo {
  return { name, size, modTime: new Date('2026-07-25T10:00:00Z') };
}

function mockClient(over: Partial<GSpaceClient> = {}): GSpaceClient {
  const files: FileInfo[] = [];
  return {
    configured: () => true,
    list: vi.fn(() => Promise.resolve(files)),
    usage: vi.fn(() => Promise.resolve(0)),
    upload: vi.fn(() => Promise.resolve()),
    download: vi.fn(() => Promise.resolve(Buffer.from('hello'))),
    deleteFile: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

describe('safeSegment (path traversal хамгаалалт)', () => {
  it('".." болон замын сегментүүдийг хасна', () => {
    expect(safeSegment('../../etc/passwd')).toBe('passwd');
    expect(safeSegment('/etc/shadow')).toBe('shadow');
    expect(safeSegment('..')).toBe('');
    expect(safeSegment('   ')).toBe('');
  });

  it('Windows маягийн backslash замыг ч барина', () => {
    expect(safeSegment('..\\..\\windows\\system32')).toBe('system32');
  });

  it('жирийн нэрийг хөндөхгүй (кирилл нэр ч мөн)', () => {
    expect(safeSegment('  тайлан.pdf ')).toBe('тайлан.pdf');
  });
});

describe('тохируулаагүй үе', () => {
  it('бүх үйлдэл ойлгомжтой алдаа өгнө (сүлжээнд хүрэхгүй)', async () => {
    const list = vi.fn(() => Promise.resolve([]));
    const uc = newGSpaceUsecase(mockClient({ configured: () => false, list }), quota);

    await expect(uc.overview(background(), userId)).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
    await expect(uc.upload(background(), userId, 'a.txt', Buffer.from('x'))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.Internal),
    );
    await expect(uc.download(background(), userId, 'a.txt')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
    await expect(uc.deleteFile(background(), userId, 'a.txt')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
    expect(list).not.toHaveBeenCalled();
  });
});

describe('overview', () => {
  it('нийт эзлэхүүнийг тооцож квоттой хамт буцаана', async () => {
    const uc = newGSpaceUsecase(
      mockClient({ list: vi.fn(() => Promise.resolve([file('a', 100), file('b', 250)])) }),
      quota,
    );
    await expect(uc.overview(background(), userId)).resolves.toEqual({
      files: [file('a', 100), file('b', 250)],
      used: 350,
      limit: quota,
    });
  });
});

describe('upload — квот', () => {
  it('квотоос ТОМ файлыг шууд татгалзана (400) — usage ч уншихгүй', async () => {
    const usage = vi.fn(() => Promise.resolve(0));
    const upload = vi.fn(() => Promise.resolve());
    const uc = newGSpaceUsecase(mockClient({ usage, upload }), 1024);

    await expect(uc.upload(background(), userId, 'big.bin', Buffer.alloc(2048))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(usage).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('нийлбэр квотоос хэтэрвэл татгалзана', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const uc = newGSpaceUsecase(
      mockClient({
        usage: vi.fn(() => Promise.resolve(900)),
        list: vi.fn(() => Promise.resolve([file('old.txt', 900)])),
        upload,
      }),
      1024,
    );

    await expect(uc.upload(background(), userId, 'new.txt', Buffer.alloc(200))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('ИЖИЛ нэртэй файлыг орлуулахад хуучин хэмжээ квотоос хасагдана', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const uc = newGSpaceUsecase(
      mockClient({
        usage: vi.fn(() => Promise.resolve(900)),
        list: vi.fn(() => Promise.resolve([file('report.pdf', 900)])),
        upload,
      }),
      1024,
    );

    // 900 (нийт) − 900 (ижил нэртэй) + 1000 = 1000 ≤ 1024 → зөвшөөрөгдөнө.
    await uc.upload(background(), userId, 'report.pdf', Buffer.alloc(1000));

    expect(upload).toHaveBeenCalled();
  });

  it('нэр эсвэл өгөгдөл хоосон бол 400', async () => {
    const uc = newGSpaceUsecase(mockClient(), quota);
    await expect(uc.upload(background(), userId, '  ', Buffer.from('x'))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
    await expect(uc.upload(background(), userId, 'a.txt', Buffer.alloc(0))).rejects.toSatisfy(
      (err: unknown) => is(err, ErrorType.BadRequest),
    );
  });

  it('жагсаалт уншиж чадахгүй бол хасалт ХИЙХГҮЙ (квотыг хатуу талд барина)', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const uc = newGSpaceUsecase(
      mockClient({
        usage: vi.fn(() => Promise.resolve(900)),
        list: vi.fn(() => Promise.reject(new Error('sftp down'))),
        upload,
      }),
      1024,
    );

    await expect(
      uc.upload(background(), userId, 'report.pdf', Buffer.alloc(200)),
    ).rejects.toSatisfy((err: unknown) => is(err, ErrorType.BadRequest));
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('download / delete', () => {
  it('татаж чадаагүй бүх шалтгаан 404 болно (оршихуйг илчлэхгүй)', async () => {
    const uc = newGSpaceUsecase(
      mockClient({ download: vi.fn(() => Promise.reject(new Error('permission denied'))) }),
      quota,
    );
    await expect(uc.download(background(), userId, 'other.txt')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.NotFound),
    );
  });

  it('устгах алдаа нь ДОТООД алдаа (SFTP-ийн дэлгэрэнгүй клиентэд гарахгүй)', async () => {
    const uc = newGSpaceUsecase(
      mockClient({ deleteFile: vi.fn(() => Promise.reject(new Error('sftp: EACCES /home/x'))) }),
      quota,
    );
    await expect(uc.deleteFile(background(), userId, 'a.txt')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
  });
});

describe('квотын өгөгдмөл', () => {
  it('тэг/сөрөг квот нь 2 MiB болно', () => {
    expect(newGSpaceUsecase(mockClient(), 0).limit()).toBe(2 << 20);
    expect(newGSpaceUsecase(mockClient(), -5).limit()).toBe(2 << 20);
  });
});
