-- Run this in Supabase SQL Editor to set up RLS for the Expo phone app
-- (Required before the phone app can use the anon key)

-- 1. Add device_id column to sms_queue
ALTER TABLE sms_queue ADD COLUMN IF NOT EXISTS device_id TEXT;

-- 2. Enable RLS on sms_queue
ALTER TABLE sms_queue ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if any
DROP POLICY IF EXISTS "anon_insert_sms" ON sms_queue;
DROP POLICY IF EXISTS "anon_select_own" ON sms_queue;
DROP POLICY IF EXISTS "anon_claim_own" ON sms_queue;
DROP POLICY IF EXISTS "anon_update_own" ON sms_queue;

-- 4. Create RLS policies

-- Anyone can insert a new pending SMS
CREATE POLICY "anon_insert_sms" ON sms_queue
  FOR INSERT TO anon
  WITH CHECK (true);

-- Can read pending rows (unclaimed) OR rows claimed by this device
CREATE POLICY "anon_select_own" ON sms_queue
  FOR SELECT TO anon
  USING (
    status = 'pending'
    OR device_id = current_setting('app.device_id', true)
  );

-- Can claim a pending row by setting device_id
CREATE POLICY "anon_claim_own" ON sms_queue
  FOR UPDATE TO anon
  USING (device_id IS NULL AND status = 'pending')
  WITH CHECK (device_id = current_setting('app.device_id', true));

-- Can update (mark sent/failed) rows claimed by this device
CREATE POLICY "anon_update_own" ON sms_queue
  FOR UPDATE TO anon
  USING (device_id = current_setting('app.device_id', true));
