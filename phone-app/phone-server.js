const express = require('express');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, platform: process.platform });
});

// Send SMS via termux-sms-send (Android/Termux only)
app.post('/send-sms', (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) {
    return res.status(400).json({ error: 'Number and message are required.' });
  }

  const cmd = `termux-sms-send -n "${number.replace(/[^0-9]/g, '')}" "${message.replace(/"/g, '\\"')}"`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('SMS send error:', err.message);
      return res.status(500).json({ error: err.message, stderr });
    }
    console.log(`SMS sent to ${number}`);
    res.json({ ok: true, number, length: message.length });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NeoFit SMS bridge running on http://0.0.0.0:${PORT}`);
  console.log('Make sure termux-sms-send is installed (pkg install termux-api)');
});
