require('dotenv').config();
const createApp = require('./app');
const { PostgresContactRepository } = require('./repositories/contactRepository');

const PORT = process.env.PORT || 4000;
const repo = new PostgresContactRepository();
const app = createApp({ contactRepository: repo });

app.listen(PORT, () => {
  console.log(`API démarrée sur le port ${PORT}`);
});
