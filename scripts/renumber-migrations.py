#!/usr/bin/env python3
"""Migration-уудыг өөр дугаарын муж руу зөөнө — файлын нэр + schema_migrations хамт.

Яагаад болгоомжтой байх ёстой вэ: runner нь хэрэгжсэн migration-ыг
`schema_migrations` хүснэгтэд **файлын нэрээр** тэмдэглэдэг. Файлыг зүгээр
дахин дугаарлавал production дээр тэр migration "хэрэгжээгүй" болж дахин
ажиллана. Тиймээс энэ хэрэгсэл файлыг нэрлэхийн зэрэгцээ DB-д тавих
`UPDATE`-үүдийг үүсгэдэг. Хоёрыг ЗЭРЭГ хэрэглэнэ.

Хэрэглээ:
    # 42-оос дээших migration-уудыг 3000-аас эхлүүлэн зөөх, юу болохыг харах
    ./scripts/renumber-migrations.py --from 42 --to 3000

    # бодитоор нэрлэх + SQL файл үүсгэх
    ./scripts/renumber-migrations.py --from 42 --to 3000 --apply

Дараа нь үүссэн SQL-ийг deploy хийхээс ӨМНӨ ажиллуулна:
    psql "$DATABASE_URL" -f migrations-renumber.sql

Дараалал чухал: эхлээд DB, дараа нь шинэ код. Эсрэгээр хийвэл migration
дахин ажиллана.
"""
import argparse
import os
import re
import subprocess
import sys

NAME_RE = re.compile(r'^(\d+)_(.+)\.(up|down)\.sql$')


def collect(mig_dir, start):
    """start-аас дээш дугаартай файлуудыг (дугаар, нэр) болгож цуглуулна."""
    out = []
    for f in sorted(os.listdir(mig_dir)):
        m = NAME_RE.match(f)
        if not m:
            continue
        num = int(m.group(1))
        if num >= start:
            out.append((num, m.group(2), m.group(3), f))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='backend/migrations', help='migrations хавтас')
    ap.add_argument('--from', dest='start', type=int, required=True,
                    help='энэ дугаараас дээших бүх migration зөөгдөнө')
    ap.add_argument('--to', dest='base', type=int, required=True,
                    help='шинэ мужийн эхлэл дугаар')
    ap.add_argument('--apply', action='store_true', help='бодитоор нэрлэ (үгүй бол dry-run)')
    ap.add_argument('--sql-out', default='migrations-renumber.sql')
    args = ap.parse_args()

    mig = args.dir
    if not os.path.isdir(mig):
        sys.exit(f'хавтас олдсонгүй: {mig}')

    items = collect(mig, args.start)
    if not items:
        print(f'{args.start}-аас дээш дугаартай migration алга — хийх зүйл байхгүй.')
        return

    # Ижил дугаартай up/down хос нэг л шинэ дугаар авахын тулд эхлээд
    # хуучин дугаарууд → шинэ дугаар гэсэн зураглал үүсгэнэ.
    old_nums = sorted({n for n, _, _, _ in items})
    mapping = {old: args.base + i for i, old in enumerate(old_nums)}

    renames, sql = [], []
    for num, slug, kind, fname in items:
        new = f'{mapping[num]}_{slug}.{kind}.sql'
        renames.append((fname, new))
        if kind == 'up':
            sql.append(
                "UPDATE schema_migrations SET name = '%s' WHERE name = '%s';" % (new, fname))

    width = max(len(a) for a, _ in renames)
    print(f'{len(renames)} файл зөөгдөнө ({len(old_nums)} migration):\n')
    for a, b in renames:
        print(f'  {a:<{width}}  →  {b}')
    print(f'\n{len(sql)} мөр SQL үүснэ ({args.sql_out}).')

    if not args.apply:
        print('\n[dry-run] Бодитоор хийхийн тулд --apply нэм.')
        return

    in_git = subprocess.run(['git', 'rev-parse', '--is-inside-work-tree'],
                            capture_output=True, text=True).returncode == 0
    for a, b in renames:
        src, dst = os.path.join(mig, a), os.path.join(mig, b)
        if os.path.exists(dst):
            sys.exit(f'ЗОГСЛОО: {dst} аль хэдийн байна')
        if in_git:
            subprocess.run(['git', 'mv', src, dst], check=True)
        else:
            os.rename(src, dst)

    header = (
        '-- Migration дахин дугаарлалт. Шинэ кодыг deploy хийхээс ӨМНӨ ажиллуул.\n'
        '-- Дараалал: (1) энэ SQL, (2) шинэ код. Эсрэгээр хийвэл migration дахин ажиллана.\n'
        'BEGIN;\n')
    with open(args.sql_out, 'w', encoding='utf-8') as fh:
        fh.write(header + '\n'.join(sql) + '\nCOMMIT;\n')

    # LEGACY жагсаалт нэрээр ажилладаг тул хамт шинэчилнэ.
    legacy = os.path.join(mig, 'LEGACY')
    if os.path.exists(legacy):
        table = dict(renames)
        with open(legacy, encoding='utf-8') as fh:
            lines = fh.read().split('\n')
        with open(legacy, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(table.get(l, l) for l in lines))
        print('LEGACY шинэчлэгдлээ.')

    print(f'\nБоллоо. Дараа нь: psql "$DATABASE_URL" -f {args.sql_out}')


if __name__ == '__main__':
    main()
