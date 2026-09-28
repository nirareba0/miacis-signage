import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestDb, createUser, createMember, asUser, asAnon, asAdmin } from './helper.mjs';

test('既存の別テーブル (public.other_app) の権限を変えていない', async () => {
  const db = await createTestDb(async (d) => {
    await d.exec('create table public.other_app (id int);');
  });

  const { rows: anonRows } = await db.query(
    `select has_table_privilege('anon', 'public.other_app', 'select') as ok;`
  );
  assert.equal(anonRows[0].ok, true, 'anon should retain select on other_app');

  const { rows: authRows } = await db.query(
    `select has_table_privilege('authenticated', 'public.other_app', 'select') as ok;`
  );
  assert.equal(authRows[0].ok, true, 'authenticated should retain select on other_app');
});

test('anon は slides, members を読めない・書けない・role 関数も呼べない', async () => {
  const db = await createTestDb();

  await asAnon(db, async () => {
    await assert.rejects(
      db.query('select * from public.signage_slides'),
      /permission denied/
    );
    await assert.rejects(
      db.query('select * from public.signage_members'),
      /permission denied/
    );
    await assert.rejects(
      db.query(`insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on)
                values ('test', 'image', 'slides/a.jpg', '2026-09-01', '2026-09-10')`),
      /permission denied/
    );
    await assert.rejects(
      db.query(`insert into public.signage_members (user_id, role, display_name)
                values ('${crypto.randomUUID()}', 'editor', 'テスト')`),
      /permission denied/
    );
    await assert.rejects(
      db.query('select public.signage_role()'),
      /permission denied/
    );
  });
});

test('members に載っていない authenticated ユーザーは slides を読めない・書けない・storage も読めない', async () => {
  const db = await createTestDb();
  const studentId = crypto.randomUUID();
  await createUser(db, studentId);

  // admin で1件作成しておく
  const editorId = crypto.randomUUID();
  await createMember(db, editorId, 'editor', 'スタッフ');
  await asAdmin(db, async () => {
    await db.query(`
      insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on)
      values ('テスト', 'image', 'slides/test.jpg', '2026-09-01', '2026-09-30');
    `);
    await db.query(`
      insert into storage.objects (bucket_id, name)
      values ('signage', 'slides/test.jpg');
    `);
  });

  await asUser(db, studentId, async () => {
    const { rows: roleRows } = await db.query('select public.signage_role() as role');
    assert.equal(roleRows[0].role, null);

    const { rows: memberRows } = await db.query('select * from public.signage_members');
    assert.equal(memberRows.length, 0);

    const { rows: slideRows } = await db.query('select * from public.signage_slides');
    assert.equal(slideRows.length, 0);

    await assert.rejects(
      db.query(`
        insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on)
        values ('不正', 'image', 'slides/bad.jpg', '2026-09-01', '2026-09-30');
      `),
      /violates row-level security policy/
    );

    const { rows: storageRows } = await db.query(
      `select * from storage.objects where bucket_id = 'signage'`
    );
    assert.equal(storageRows.length, 0);

    await assert.rejects(
      db.query(`
        insert into storage.objects (bucket_id, name)
        values ('signage', 'slides/bad.jpg');
      `),
      /violates row-level security policy/
    );
  });
});

test('display 権限のメンバーは slides を読めるが insert/update/delete できない', async () => {
  const db = await createTestDb();
  const displayId = crypto.randomUUID();
  await createMember(db, displayId, 'display', '展示タブレット');

  let slideId;
  await asAdmin(db, async () => {
    const { rows } = await db.query(`
      insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on)
      values ('展示用スライド', 'image', 'slides/disp.jpg', '2026-09-01', '2026-09-30')
      returning id;
    `);
    slideId = rows[0].id;
    await db.query(`
      insert into storage.objects (bucket_id, name)
      values ('signage', 'slides/disp.jpg');
    `);
  });

  await asUser(db, displayId, async () => {
    const { rows: roleRows } = await db.query('select public.signage_role() as role');
    assert.equal(roleRows[0].role, 'display');

    const { rows: slideRows } = await db.query('select * from public.signage_slides');
    assert.equal(slideRows.length, 1);
    assert.equal(slideRows[0].title, '展示用スライド');

    const { rows: memberRows } = await db.query('select * from public.signage_members');
    assert.equal(memberRows.length, 1);

    const { rows: storageRows } = await db.query(
      `select * from storage.objects where bucket_id = 'signage'`
    );
    assert.equal(storageRows.length, 1);

    // insert できない
    await assert.rejects(
      db.query(`
        insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on)
        values ('追加不可', 'image', 'slides/no.jpg', '2026-09-01', '2026-09-30');
      `),
      /violates row-level security policy/
    );

    // update できない (RLS により 0 件更新)
    const updateResult = await db.query(
      `update public.signage_slides set title = '改ざん' where id = $1`,
      [slideId]
    );
    assert.equal(updateResult.affectedRows, 0);

    // delete できない (RLS により 0 件削除)
    const deleteResult = await db.query(
      `delete from public.signage_slides where id = $1`,
      [slideId]
    );
    assert.equal(deleteResult.affectedRows, 0);

    // storage への insert できない
    await assert.rejects(
      db.query(`
        insert into storage.objects (bucket_id, name)
        values ('signage', 'slides/disp_bad.jpg');
      `),
      /violates row-level security policy/
    );
  });
});

test('editor 権限のメンバーは slides を insert/update/delete できる', async () => {
  const db = await createTestDb();
  const editorId = crypto.randomUUID();
  await createMember(db, editorId, 'editor', 'スタッフA');

  await asUser(db, editorId, async () => {
    const { rows: roleRows } = await db.query('select public.signage_role() as role');
    assert.equal(roleRows[0].role, 'editor');

    // insert
    const { rows: insertRows } = await db.query(`
      insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on, duration_sec)
      values ('新スライド', 'image', 'slides/new.jpg', '2026-09-10', '2026-09-20', 15)
      returning *;
    `);
    assert.equal(insertRows.length, 1);
    assert.equal(insertRows[0].title, '新スライド');
    assert.equal(insertRows[0].duration_sec, 15);
    assert.equal(insertRows[0].created_by, editorId);

    const slideId = insertRows[0].id;

    // update
    const updateResult = await db.query(
      `update public.signage_slides set title = '更新スライド', duration_sec = 20 where id = $1`,
      [slideId]
    );
    assert.equal(updateResult.affectedRows, 1);

    const { rows: checkUpdate } = await db.query(
      'select * from public.signage_slides where id = $1',
      [slideId]
    );
    assert.equal(checkUpdate[0].title, '更新スライド');
    assert.equal(checkUpdate[0].duration_sec, 20);

    // storage insert / delete
    await db.query(`
      insert into storage.objects (bucket_id, name)
      values ('signage', 'slides/new.jpg');
    `);
    const delStorage = await db.query(`
      delete from storage.objects where bucket_id = 'signage' and name = 'slides/new.jpg';
    `);
    assert.equal(delStorage.affectedRows, 1);

    // delete
    const deleteResult = await db.query(
      'delete from public.signage_slides where id = $1',
      [slideId]
    );
    assert.equal(deleteResult.affectedRows, 1);

    const { rows: remaining } = await db.query('select * from public.signage_slides');
    assert.equal(remaining.length, 0);
  });
});

test('制約違反の拒否: starts_on > ends_on, duration_sec 範囲外', async () => {
  const db = await createTestDb();
  const editorId = crypto.randomUUID();
  await createMember(db, editorId, 'editor', 'スタッフ');

  await asUser(db, editorId, async () => {
    // starts_on > ends_on
    await assert.rejects(
      db.query(`
        insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on)
        values ('期間不正', 'image', 'slides/inv.jpg', '2026-09-25', '2026-09-20');
      `),
      /violates check constraint/
    );

    // duration_sec < 3
    await assert.rejects(
      db.query(`
        insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on, duration_sec)
        values ('秒数不足', 'image', 'slides/short.jpg', '2026-09-01', '2026-09-10', 2);
      `),
      /violates check constraint/
    );

    // duration_sec > 60
    await assert.rejects(
      db.query(`
        insert into public.signage_slides (title, kind, storage_path, starts_on, ends_on, duration_sec)
        values ('秒数超過', 'image', 'slides/long.jpg', '2026-09-01', '2026-09-10', 61);
      `),
      /violates check constraint/
    );
  });
});

test('誰も members に書き込めない (editor でも)', async () => {
  const db = await createTestDb();
  const editorId = crypto.randomUUID();
  await createMember(db, editorId, 'editor', 'スタッフ');

  await asUser(db, editorId, async () => {
    await assert.rejects(
      db.query(`
        insert into public.signage_members (user_id, role, display_name)
        values ('${crypto.randomUUID()}', 'editor', '勝手に追加');
      `),
      /permission denied/
    );

    await assert.rejects(
      db.query(`
        update public.signage_members set display_name = '改名' where user_id = $1
      `, [editorId]),
      /permission denied/
    );

    await assert.rejects(
      db.query(`
        delete from public.signage_members where user_id = $1
      `, [editorId]),
      /permission denied/
    );
  });
});

test('migration は2回流しても落ちない（本番へ流し直せる）', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const db = await createTestDb();
  const sql = fs.readFileSync(path.resolve(import.meta.dirname, '../../supabase/migrations/0001_signage.sql'), 'utf8');
  await db.exec(sql);
  const { rows } = await db.query(`select count(*)::int as n from pg_policies where policyname like 'signage_%'`);
  assert.equal(rows[0].n, 9); // members 1 + slides 4 + storage 4
});
