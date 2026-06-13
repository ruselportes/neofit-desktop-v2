require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

let isProcessing = false;

async function processPending() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const { data: pending, error } = await supabase
      .from('sms_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Poll error:', error.message);
      return;
    }

    if (!pending || pending.length === 0) return;

    for (const item of pending) {
      console.log(`Sending SMS to ${item.recipient}...`);
      const cmd = `termux-sms-send -n "${item.recipient.replace(/[^0-9]/g, '')}" "${item.message.replace(/"/g, '\\"')}"`;

      try {
        await new Promise((resolve, reject) => {
          exec(cmd, (err, stdout, stderr) => {
            if (err) reject(new Error(err.message + ' ' + stderr));
            else resolve(stdout);
          });
        });

        await supabase
          .from('sms_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', item.id);

        console.log(`Sent to ${item.recipient}`);
      } catch (sendErr) {
        console.error(`Failed to send to ${item.recipient}:`, sendErr.message);

        await supabase
          .from('sms_queue')
          .update({ status: 'failed', error: sendErr.message })
          .eq('id', item.id);
      }
    }
  } finally {
    isProcessing = false;
  }
}

console.log(`NeoFit SMS client started – polling every ${POLL_INTERVAL}ms`);
console.log('Make sure termux-sms-send is installed (pkg install termux-api)');

processPending();
setInterval(processPending, POLL_INTERVAL);
