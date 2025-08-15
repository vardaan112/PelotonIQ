const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to PelotonIQ API',
    version: '1.0.0',
    status: 'running'
  });
});

app.listen(PORT, () => {
  console.log(`PelotonIQ server running on port ${PORT}`);
});

module.exports = app;