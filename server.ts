import express from 'express';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';

const adminAny = admin as any;

// Initialize Firebase Admin safely if credentials are available
try {
  if (!adminAny.apps?.length) {
    adminAny.initializeApp({
      credential: adminAny.credential?.applicationDefault(),
      projectId: "strange-bird-467010-q9",
    });
  }
} catch (e) {
  console.warn("Firebase Admin initialized without default credentials or skipped:", e);
}

async function startServer() {
  const app = express();
  const port = 3000;

  try {
    if (adminAny.apps?.length) {
      const adminAuth = adminAny.auth();
      const uid = 'L73xRryXtqPZozz4dPE1Qgxyb6Z2';
      const user = await adminAny.auth().getUser(uid);
      await adminAuth.setCustomUserClaims(uid, {
        ...user.customClaims,
        admin: true
      });
      console.log('SUCCESS: Cloudvalt admin access granted.');
    }
  } catch (error) {
    console.log('Note: Admin claim assignment skipped or waiting for valid credentials.');
  }

  // Create Vite server in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
