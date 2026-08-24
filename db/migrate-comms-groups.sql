-- Migration: custom group chats. A group is a named, member-picked conversation;
-- its messages live in comms_messages under thread_id 'group:<id>'. Additive and
-- safe. Run once on live.
CREATE TABLE IF NOT EXISTS comms_groups (
  id          TEXT PRIMARY KEY,
  name_enc    TEXT NOT NULL,                 -- encrypted group name
  member_ids  JSONB NOT NULL DEFAULT '[]',   -- clinician ids in the group (incl. creator)
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
