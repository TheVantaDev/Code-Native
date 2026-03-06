import express from 'express';
const app = express();

// I'm checking if the 'server.js' file exists in the same directory.
try {
  fs.statSync('server.js');
} catch (err) {
  console.log("The 'server.js' file doesn't exist.");
}

export default app;